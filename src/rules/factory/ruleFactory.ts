import { AddressToken } from '@defichain/whale-api-client/dist/api/address';
import { CustomMessage } from '@defichainwizard/custom-transactions';
import { DFIWallet } from '../../blockchain';
import { ConstantValues } from '../../interfaces';
import { logErrorTelegram } from '../../utils';
import { Rule } from '../model';
import { ActionFactory } from './actionFactory';
import { BaseFactory } from './base';
import { ConditionFactory } from './conditionFactory';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { logDebug } from '@defichainwizard/custom-logging';
/**
 * The Rule Factory serves all rules.
 */
export class RuleFactory extends BaseFactory {
  protected conditionFactory: ConditionFactory;
  protected actionFactory: ActionFactory;

  constructor(wallet: DFIWallet, vaultId: string) {
    super(wallet, vaultId);
    this.conditionFactory = new ConditionFactory(wallet, vaultId);
    this.actionFactory = new ActionFactory(wallet, vaultId);
  }

  public async checkSafety(config: CustomMessage): Promise<boolean> {
    const vault = await this.wallet.getVault(this.vaultId);
    const safetyRatio =
      ConstantValues.additionalVaultRatioSafety +
      vault.getVaultLoanSchemePercentage();

    logDebug(
      `Getting LM Tokens required to get back to Ratio of : ${safetyRatio}%`
    );

    if (
      vault.getCurrentCollateralRatio().gt(safetyRatio) &&
      vault.getNextCollateralRatio().gt(safetyRatio)
    ) {
      logDebug(
        `Current Vault Ratio is high enough. Skipping Safety-check (Curr: ${vault
          .getCurrentCollateralRatio()
          .decimalPlaces(2)}% / Next: ${vault
          .getNextCollateralRatio()
          .decimalPlaces(2)}%)`
      );
      return true;
    }

    const neededLMTokens = await this.wallet.getNeededRepay(
      config.poolpairs,
      safetyRatio,
      this.vaultId
    );

    // if amounts are empty don't continue processing
    if (neededLMTokens.length == 0) {
      throw `There was an issue getting the required token amount to repay!`;
    }

    logDebug(`Checking Balance of LM Tokens`);
    for (const pair of neededLMTokens) {
      const balance = (await this.wallet.getTokenBalance(
        pair.poolpair
      )) as AddressToken;

      if (!balance) {
        throw 'Could not get balance for pair correctly.';
      } else {
        if (pair.amount.gt(balance.amount)) {
          throw `Can not get Vault into Safe Ratio: Insufficient Wallet Balance: need ${pair.amount}@${pair.poolpair}, got ${balance.amount}@${pair.poolpair}`;
        }
      }
      // check if we have the correct loans
    }
    const expectedTokens = await this.wallet.getExpectedTokensFromLMToken(
      neededLMTokens
    );
    const expectedDToken = expectedTokens.filter(
      (token) => token.token !== 'DUSD'
    );
    const expectedDUSD = expectedTokens
      .filter((token) => token.token === 'DUSD')
      .reduce(
        (prev, cur) => {
          prev.amount = prev.amount.plus(cur.amount);
          return prev;
        },
        { amount: new BigNumber(0), token: 'DUSD' }
      );

    logDebug(`Checking Existance of matching Loans`);
    for (const loan of vault.loanVault.loanAmounts) {
      if (loan.symbol == 'DUSD' && expectedDUSD.amount.gt(loan.amount)) {
        throw `Can not get Vault into Safe Ratio: incorrect Loans: Can not payback enough DUSD, Loan is ${loan.amount}, Want to payback ${expectedDUSD.amount}`;
      } else {
        const dToken = expectedDToken.find(
          (token) => token.token === loan.symbol
        );
        if (dToken?.amount.gt(loan.amount)) {
          throw `Can not get Vault into Safe Ratio: incorrect Loans: Can not payback enough ${dToken.token}, Loan is ${loan.amount}, Want to payback ${dToken.amount}`;
        }
      }
    }
    return true;
  }

  /**
   * Extracts all rules from the config, that has been retrieved from the blockchain.
   *
   * @param config The config from blockchain
   * @returns The list of rules
   */
  public getRulesFromConfig(config: CustomMessage): Rule[] {
    // Check on version
    if (config.version !== '1.0') {
      logErrorTelegram(
        'Unsupported version of config found. Please make sure that you have the latest app and the latest Wizard backend version.'
      );
      throw 'Unsupported Config Version';
    }

    // calculates the target ratio
    const targetRatio =
      (config.rules.keepMinRatio + config.rules.keepMaxRatio) / 2; // TargetRatio is always the middle of min and max

    //--------------------------------------------
    // Rules
    //--------------------------------------------

    // Rule that describes the case of vault ratio falling below minimum ratio - so loans need to be payed back
    const minRule = new Rule({
      name: 'KeepMinRatio',
      description: `Checking your MINIMUM vault ratio. If it's lower than ${config.rules.keepMinRatio}, I will pay back loans...`,
      vaultId: this.vaultId,
      conditionSet: this.conditionFactory.getMinVaultRatioConditionSet(
        config.rules.keepMinRatio
      ),
      actionSet: this.actionFactory.getIncreaseVaultRatioActionSet(
        config.poolpairs,
        targetRatio
      )
    });

    // Rule that describes the case of vault ratio is above maximum ratio - so new loans can be taken
    const maxRule = new Rule({
      name: 'KeepMaxRatio',
      description: `Checking your MAXIMUM vault ratio. If it's higher than ${config.rules.keepMaxRatio}, I will take more loans...`,
      vaultId: this.vaultId,
      conditionSet: this.conditionFactory.getMaxVaultRatioConditionSet(
        config.rules.keepMaxRatio
      ),
      actionSet: this.actionFactory.getDecreaseVaultRatioActionSet(
        config.poolpairs,
        targetRatio
      )
    });

    // Rule that describes how to re-invest rewards
    const compoundingRule = new Rule({
      name: 'Compounding',
      description: 'Checking how to re-invest your rewards...',
      vaultId: this.vaultId,
      conditionSet: this.conditionFactory.getCompoundingConditionSet(
        config.compounding.threshold
      ),
      actionSet: this.actionFactory.getCompoundingActionSet(
        config.compounding.mode,
        config.compounding.token
      )
    });

    return [compoundingRule, minRule, maxRule];
  }
}
