import { DFIWallet } from './blockchain/dfiWallet';
import {
  getBotConfig,
  getDFINetwork,
  getSEEDFromEnv,
  getWalletAddress,
  setBotConfig,
  getBotVersion
} from './config/configuration';
import 'dotenv/config';
import {
  logErrorTelegram,
  printWalletInfo,
  sendMessageToTelegram,
  tryGetAsync
} from './utils/helpers';
import { ConstantValues } from './interfaces';
import {
  CustomMessage,
  Transaction
} from '@defichainwizard/custom-transactions';
import { Block } from '@defichain/whale-api-client/dist/api/blocks';
import { RuleFactory } from './rules/factory';
import { logDebug, logError, logInfo } from '@defichainwizard/custom-logging';
import { SmartInterval } from './utils/smartInterval';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { RequestInfo, RequestInit } from 'node-fetch';
import * as semver from 'semver';

class Wizard {
  // store the current block here
  private static lastBlockHeight = 0;
  private static lastConfigBlock = ConstantValues.initialLastConfigBlock;
  private static lastConfigBlockTime = 0;
  private static wizardStart = true;
  private static messageHasNotBeenSent = {
    botInactive: false,
    botSleeping: false,
    botActive: false,
    vaultIsEmpty: false,
    noConfigSent: true
  };
  /**
   * This is where the actual magic happens... :)
   *
   * This function will check the blockchain and will search for new configs or run the rules.
   *
   * @param blockScanner The block scanner object that scans the blockchain
   * @param transaction The transaction utility to read the transactions
   */
  private static async doMagic(transaction: Transaction, wallet: DFIWallet) {
    try {
      const blockScanner = wallet.getBlockScanner();
      const currentBlock = await blockScanner.getCurrentBlock();

      // only do some magic when a new block has been found - no need to do it on the same block again
      if (currentBlock.height !== Wizard.lastBlockHeight) {
        logInfo(
          `New block found (${currentBlock.height}), will start the analysis now...`
        );
        // store current height so we don't check the same block again
        Wizard.lastBlockHeight = currentBlock.height;

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

          // Compare Versions and inform user if newer version is available
          await Wizard.compareBackendVersion();

          // if we have a new config: reset all message counters
          Wizard.messageHasNotBeenSent = {
            botActive: true,
            botSleeping: true,
            botInactive: true,
            vaultIsEmpty: true,
            noConfigSent: true
          };

          try {
            // new config
            const message = transaction.getCustomMessage(
              wizardTransaction.message
            );

            const ConfigMessage = message as CustomMessage;
            const vault = await wallet.getVault(ConfigMessage.vaultId);
            setBotConfig(message, vault.getVaultLoanSchemePercentage());

            Wizard.lastConfigBlock = wizardTransaction.lastConfigBlock;
            Wizard.lastConfigBlockTime = wizardTransaction.blockTime;

            // Inform user about pause status: botInactive or botSleeping for x minutes
            const pauseActive = Wizard.sendPauseMessage(
              ConfigMessage,
              currentBlock
            );
            if (pauseActive) return;

            // check if vault is empty
            if (vault.getVaultState() === 'EMPTY') {
              logDebug(`The vault is in state EMPTY. we can't operate`);
              if (
                (ConfigMessage.compounding.mode == 1 ||
                  ConfigMessage.compounding.mode === 3) &&
                Wizard.messageHasNotBeenSent.vaultIsEmpty
              ) {
                sendMessageToTelegram(
                  `🔔 It seems your vault is currently EMPTY. 

The compounding feature is not configured to automatically add collateral to your vault. 

Please add it manually to get started.`
                );

                Wizard.messageHasNotBeenSent.vaultIsEmpty = false;
                return;
              }
            }
          } catch (e) {
            logError(
              'Error reading custom message from transaction. Did you use the DeFiChain Wizard app to send the config?'
            );
          }
        }

        // get config - this time as bot config
        const config = getBotConfig(Wizard.messageHasNotBeenSent.noConfigSent);

        if (config === undefined) {
          Wizard.messageHasNotBeenSent.noConfigSent = false;
          return;
        }

        // check if config was found and config pause is not set to -1
        if (typeof config !== 'undefined' && config.pause >= 0) {
          // Pause is configured -> calculate end time of pause
          const waitTill = Wizard.lastConfigBlockTime + config.pause * 60;
          const minutesBeforReactivation =
            (waitTill - currentBlock.time) / 60 > config.pause
              ? config.pause
              : (waitTill - currentBlock.time) / 60;
          const pauseHasElapsed = currentBlock.time >= waitTill ? true : false;

          if (!pauseHasElapsed && config.pause > 0) {
            const minutesString = `${minutesBeforReactivation.toFixed(1)}/${
              config.pause
            }`;

            if (Wizard.messageHasNotBeenSent.botSleeping) {
              Wizard.sendSleepingMessage(minutesString);
            } else {
              logDebug(
                `The Wizard will not guard for the next ${minutesString} minutes.`
              );
            }
            Wizard.wizardStart = false;

            return;
          }

          if (Wizard.messageHasNotBeenSent.botActive) {
            if (!Wizard.wizardStart) {
              sendMessageToTelegram(
                `✅ My break is over! Now I'll take care of your vault again 👍`
              );
            }
            Wizard.messageHasNotBeenSent = {
              botActive: false,
              botInactive: true,
              botSleeping: true,
              vaultIsEmpty: Wizard.messageHasNotBeenSent.vaultIsEmpty,
              noConfigSent: Wizard.messageHasNotBeenSent.noConfigSent
            };
          }
          Wizard.wizardStart = false;

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
        const config = getBotConfig(Wizard.messageHasNotBeenSent.noConfigSent);

        if (config === undefined) {
          Wizard.messageHasNotBeenSent.noConfigSent = false;
          return;
        }

        let currentVaultRatio = new BigNumber(0);
        let nextVaultRatio = new BigNumber(0);

        if (config?.vaultId) {
          const vault = await wallet.getVault(config?.vaultId);
          currentVaultRatio = vault
            .getCurrentCollateralRatio()
            .decimalPlaces(3);
          nextVaultRatio = (await vault.getNextCollateralRatio()).decimalPlaces(
            3
          );
        }

        logDebug(
          `Last checked block: ${currentBlock.height} - Vault Ratio Current: ${currentVaultRatio}% => Next: ${nextVaultRatio}%`
        );
      }
    } catch (e) {
      logError(`Something went wrong in Main loop: ${e}`);
    }

    Wizard.wizardStart = false;
  }

  /**
   * This method sends an initial confirmation about the "Pause State" to the user
   *
   * @param ConfigMessage The configuration message that defines in which state the pause is
   * @param currentBlock The current block for time calculations
   */
  static sendPauseMessage(
    ConfigMessage: CustomMessage,
    currentBlock: Block
  ): boolean {
    if (ConfigMessage.pause == -1 && Wizard.messageHasNotBeenSent.botInactive) {
      logDebug(
        `The Wizard is set to INACTIVE state. Pause: ${ConfigMessage.pause}`
      );
      sendMessageToTelegram(
        `🚨 You have put me to sleep. I'll not take any actions until you wake me up again. Looking forward to do some magic for you again. 🪄`
      );
      // BotInactive Message has been send -> store it to not repeat it
      Wizard.messageHasNotBeenSent.botInactive = false;
    } else if (
      ConfigMessage.pause > 0 &&
      Wizard.messageHasNotBeenSent.botSleeping
    ) {
      // Pause is configured -> calculate end time of pause
      const waitTill = Wizard.lastConfigBlockTime + ConfigMessage.pause * 60;
      const pauseHasElapsed = currentBlock.time >= waitTill ? true : false;

      if (!pauseHasElapsed) {
        // LastConfigBlockTime is sometimes not correct -> use max wait
        const minutesBeforReactivation =
          (waitTill - currentBlock.time) / 60 > ConfigMessage.pause
            ? ConfigMessage.pause
            : (waitTill - currentBlock.time) / 60;
        const minutesString = `${minutesBeforReactivation.toFixed(1)}/${
          ConfigMessage.pause
        }`;

        Wizard.sendSleepingMessage(minutesString);
      } else {
        return false;
      }
    } else {
      return false;
    }

    // Inactivity or Sleeping Message has been send -> remove sent flag from Active message
    Wizard.messageHasNotBeenSent.botActive = true;

    // Remember that start routine is over
    Wizard.wizardStart = false;
    return true;
  }

  static sendSleepingMessage(minutesString: string): void {
    logDebug(
      `The Wizard will not guard for the next ${minutesString} minutes.`
    );

    sendMessageToTelegram(
      `⏸ Ok, it's time to rest. I'll stop guarding your vault for the next ${minutesString} minutes.`
    );

    Wizard.messageHasNotBeenSent.botSleeping = false;
    Wizard.messageHasNotBeenSent.botActive = true;
  }

  /**
   * This function checks if there is a new backendversion available
   */
  static async compareBackendVersion(): Promise<void> {
    const fetch = (url: RequestInfo, init?: RequestInit) =>
      import('node-fetch').then(({ default: fetch }) => fetch(url, init));

    const url =
      'https://api.github.com/repos/defichain-wizard/defichain-wizard-backend/releases/latest';

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DeFiChain-Wizard Backend'
      }
    });

    const json = JSON.parse(JSON.stringify(await response.json()));
    const gitHubVersion = String(json.tag_name).substring(1);
    const botVersion = getBotVersion();
    logDebug(`Bot Version:    ${botVersion}`);
    logDebug(`Github Version: ${gitHubVersion}`);

    if (semver.neq(gitHubVersion, botVersion)) {
      sendMessageToTelegram(`⚙️ I've found a new backend version *${gitHubVersion}*

☝️ Please update your bot on the server. Your current version is *${botVersion}*

https://youtu.be/1mW6MGr1Egg`);
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
      () => Wizard.doMagic(transaction, myWallet),
      10000
    );
    interval.start();
  }
}

export { Wizard };
