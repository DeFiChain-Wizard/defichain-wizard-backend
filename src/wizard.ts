import { DFIWallet } from './blockchain/dfiWallet';
import {
  getBotConfig,
  getDFINetwork,
  getSEEDFromEnv,
  getWalletAddress,
  setBotConfig
} from './config/configuration';
import 'dotenv/config';
import {
  logErrorTelegram,
  printWalletInfo,
  sendMessageToTelegram,
  tryGetAsync
} from './utils/helpers';
import {
  BlockScanner,
  CustomMessage,
  Transaction
} from '@defichainwizard/custom-transactions';
import { RuleFactory } from './rules/factory';
import {
  logDebug,
  logError,
  logInfo,
  logConfig
} from '@defichainwizard/custom-logging';
import { SmartInterval } from './utils/smartInterval';
import { BigNumber } from '@defichain/jellyfish-api-core';

// Initially it will be 2010000 (round July 2022, before DeFiChain Wizard was released) and will change once we found the first block that contained a config
const INITIAL_LAST_CONFIG_BLOCK = 2010000;
class Wizard {
  // store the current block here
  private static lastBlockHeight = 0;
  private static lastConfigBlock = INITIAL_LAST_CONFIG_BLOCK;
  private static lastConfigBlockTime = 0;
  private static pauseHasElapsedMessageSent = false;
  /**
   * This is where the actual magic happens... :)
   *
   * This function will check the blockchain and will search for new configs or run the rules.
   *
   * @param blockScanner The block scanner object that scans the blockchain
   * @param transaction The transaction utility to read the transactions
   */
  private static async doMagic(
    blockScanner: BlockScanner,
    transaction: Transaction,
    wallet: DFIWallet
  ) {
    try {
      const currentBlock = await blockScanner.getCurrentBlock();
      const currentBlockHeight = await blockScanner.getBlockHeight();

      // only do some magic when a new block has been found - no need to do it on the same block again
      if (currentBlockHeight !== Wizard.lastBlockHeight) {
        logInfo(
          `New block found (${currentBlockHeight}), will start the analysis now...`
        );
        // store current height so we don't check the same block again
        Wizard.lastBlockHeight = currentBlockHeight;

        logDebug(
          'Checking if there is a new configuration on the blockchain...'
        );

        const wizardTransaction =
          await blockScanner.findLastWizardConfiguration(
            Wizard.lastConfigBlock
          );

        if (!wizardTransaction) {
          logDebug(
            `No (new) config found on blockchain, since last block "${Wizard.lastConfigBlock}"...`
          );
        } else {
          logInfo('New configuration found. Will update bot...');

          try {
            // get config
            let oldPause = 0;

            logDebug(`Old Config:`);

            const config = getBotConfig();
            if (config) {
              logDebug(config);
              oldPause = config.pause;
            } else {
              oldPause = 0;
            }

            // new config
            const message = transaction.getCustomMessage(
              wizardTransaction.message
            );

            const ConfigMessage = message as CustomMessage;
            const vault = await wallet.getVault(ConfigMessage.vaultId);
            setBotConfig(message, vault.getVaultLoanSchemePercentage());

            Wizard.lastConfigBlock = wizardTransaction.lastConfigBlock;
            Wizard.lastConfigBlockTime = wizardTransaction.blockTime;
            Wizard.pauseHasElapsedMessageSent = false;

            if (oldPause == -1 && ConfigMessage.pause >= 0) {
              sendMessageToTelegram(
                `✅ My break is over! Now I'll take care of your vault again 👍`
              );
            } else if (ConfigMessage.pause > 0) {
              sendMessageToTelegram(
                `⏸ You have configured a break for me. I'll stop guarding your vault for the next ${ConfigMessage.pause} minutes.`
              );
            } else if (ConfigMessage.pause == -1) {
              sendMessageToTelegram(
                `🚨 You have put me to sleep. I'll not take any actions until you wake me again.`
              );
            }
          } catch (e) {
            logError(
              'Error reading custom message from transaction. Did you use the DeFiChain Wizard app to send the config?'
            );
          }
        }

        // get config again - this time as bot config
        const config = getBotConfig(true);
        // check if config was found OR config pause is set to -1
        if (typeof config !== 'undefined' && config.pause >= 0) {
          // If Pause is > 0 we will wait for the configured number in minutes
          if (config.pause > 0) {
            const waitTill = Wizard.lastConfigBlockTime + config.pause * 60;
            const now = currentBlock.time;
            logDebug(`Pause configured till ${waitTill} now is ${now}`);

            if (waitTill > now) {
              logInfo('Doing nothing: User configured Pause');
              return;
            } else {
              logDebug(
                `Pause was configured, but is already elapsed (${Wizard.pauseHasElapsedMessageSent})`
              );

              if (!Wizard.pauseHasElapsedMessageSent) {
                sendMessageToTelegram(
                  `✅ My break is over! Now I'll take care of your vault again 👍`
                );
                Wizard.pauseHasElapsedMessageSent = true;
              }
            }
          }
          // now we have checked for a new config... let's run some rules if needed
          logDebug('Current config:');
          logConfig(config);

          // create the rule factory
          const ruleFactory = new RuleFactory(wallet, config.vaultId);
          //Running Safety Check
          logInfo('Running Safety Check');
          try {
            await ruleFactory.checkSafety(config);
            logInfo('Safety Check was successful');
          } catch (e) {
            logErrorTelegram(`SAFETY CHECK FAILED: ${e}`);
          }
          // get the rules from the config object
          const rules = ruleFactory.getRulesFromConfig(config);

          logDebug(
            `Generated ${rules.length} rules from config: ${rules
              .map((rule) => rule.getName())
              .join(', ')}`
          );

          logInfo('Running rules now...');

          for (const rule of rules) {
            logDebug(`Running rule: ${rule.getName()}`);
            logDebug(rule.getDescription());
            const ret = await rule.run();
            if (ret.hasTxSent) {
              logDebug(
                'Waiting for next Block, after running Rule with Transactions sent'
              );

              // make sure that we really wair - even if there where new blocks while processing
              Wizard.lastBlockHeight = await blockScanner.getBlockHeight();

              return;
            }
          }
        } else {
          logInfo(
            `No new block found or bot has been stopped (Bot stopped? ${
              !config || config.pause < 0
            }). Won't do anything!`
          );
        }
      } else {
        const config = getBotConfig(true);
        let currentVaultRatio = new BigNumber(0);
        let nextVaultRatio = new BigNumber(0);

        if (config?.vaultId) {
          const vault = await wallet.getVault(config?.vaultId);
          currentVaultRatio = vault
            .getCurrentCollateralRatio()
            .decimalPlaces(2);
          nextVaultRatio = vault.getNextCollateralRatio().decimalPlaces(2);
        }

        logDebug(
          `Last checked block: ${currentBlockHeight} - Vault Ratio Current: ${currentVaultRatio}% => Next: ${nextVaultRatio}%`
        );
      }
    } catch (e) {
      logError(`Something went wrong in Main loop: ${e}`);
    }
  }

  /**
   * This function starts the wizard! :)
   */
  static async doYourMagic() {
    sendMessageToTelegram(
      `🧙 Hello my friend, your wizard is up and running.
      
But, in order to do some magic for you, I have the following requirements:

✅ Have at least 10 USD to be managed by me.
✅ Make sure that your wallet does not contain any dTokens that are not managed by me (including dUSD).
✅ Check if you have the latest DeFiChain Wizard App installed on your phone.

If you make sure that this is the case, I will be happy to manage your vault for you! 🪄

*DISCLAIMER*: I'm still a little wizard that has to learn things, so you might see some errors here and there. Please report them to improve my skills! 🧙`
    );
    logDebug('Wallet initialization started...');
    const walletRes = await tryGetAsync<DFIWallet>(() =>
      DFIWallet.build(getWalletAddress())
    );

    // if there was an error when initializing the wallet, stop bot!
    if (!walletRes.success) {
      logError(
        `There was an error initializing the Wallet: ${walletRes.error}`
      );
      process.exit(1);
    }

    // store the successfully initialized wallet
    const myWallet = walletRes.result;

    // print some wallet info at startup
    printWalletInfo(myWallet);

    // Initialize BlockScanner with config
    const blockScanner = new BlockScanner({
      client: myWallet.getClient(),
      address: await myWallet.getAddress()
    });

    // Initialize Transaction with config
    const transaction = new Transaction({
      client: myWallet.getClient(),
      account: myWallet.getAccount(),
      network: getDFINetwork(),
      passphrase: getSEEDFromEnv()
    });

    logInfo(
      'Ready to go - will scan the blockchain now. Time for some magic! :)'
    );
    // start and run our magic loop
    const interval = new SmartInterval(
      () => Wizard.doMagic(blockScanner, transaction, myWallet),
      10000
    );
    interval.start();
  }
}

export { Wizard };
