import { DFIWallet } from '../../blockchain';
import { VaultState } from '../../interfaces';
import { Condition, ConditionSet } from '../model';
import { BaseFactory } from './base';
import { ParameterFactory } from './parameterFactory';

/**
 * The Condition Factory serves all conditions.
 *
 * In short: Which conditions must match to take some action.
 */
export class ConditionFactory extends BaseFactory {
  protected parameterFactory: ParameterFactory;
  constructor(wallet: DFIWallet, vaultId: string) {
    super(wallet, vaultId);
    this.parameterFactory = new ParameterFactory(wallet, vaultId);
  }

  /**
   * Returns the condition set for the MaxVaultRatio.
   * @param ratio the ratio to use as max value
   * @returns The given condition set
   */
  public getMaxVaultRatioConditionSet(ratio: number): ConditionSet {
    const maxCurrentRatioCondition = new Condition({
      name: 'maxRatio',
      parameter: this.parameterFactory.getCurrentVaultRatioParameter(),
      parameterThreshold: ratio,
      compOperator: '>='
    });
    const maxNextRatioCondition = new Condition({
      name: 'maxRatio',
      parameter: this.parameterFactory.getNextVaultRatioParameter(),
      parameterThreshold: ratio,
      compOperator: '>='
    });
    const maxRatioSet = new ConditionSet({
      conditions: [maxCurrentRatioCondition, maxNextRatioCondition],
      operator: 'AND'
    });
    const vaultStateActiveCondition = new Condition({
      name: 'vaultStateActive',
      parameter: this.parameterFactory.getVaultStateParameter(),
      parameterThreshold: VaultState.ACTIVE,
      compOperator: '=='
    });
    const vaultStateReadyCondition = new Condition({
      name: 'vaultStateReady',
      parameter: this.parameterFactory.getVaultStateParameter(),
      parameterThreshold: VaultState.READY,
      compOperator: '=='
    });
    const vaultStateMayLiquidateCondition = new Condition({
      name: 'vaultStateMayLiquidate',
      parameter: this.parameterFactory.getVaultStateParameter(),
      parameterThreshold: VaultState.MAY_LIQUIDATE,
      compOperator: '=='
    });
    const vaultActiveSet = new ConditionSet({
      conditions: [vaultStateActiveCondition, vaultStateMayLiquidateCondition],
      operator: 'OR'
    });
    const vaultActiveAndRatioSet = new ConditionSet({
      conditions: [vaultActiveSet, maxRatioSet],
      operator: 'AND'
    });
    return new ConditionSet({
      conditions: [vaultActiveAndRatioSet, vaultStateReadyCondition], // when Vault is READY (ratio is -1)
      operator: 'OR'
    });
  }

  /**
   * Returns the condition set for the MinVaultRatio.
   * @param ratio the ratio to use as min value
   * @returns The given condition set
   */
  public getMinVaultRatioConditionSet(ratio: number): ConditionSet {
    const minCurrentRatioCondition = new Condition({
      name: 'minCurrentRatio',
      parameter: this.parameterFactory.getCurrentVaultRatioParameter(),
      parameterThreshold: ratio,
      compOperator: '<'
    });
    const minNextRatioCondition = new Condition({
      name: 'minNextRatio',
      parameter: this.parameterFactory.getNextVaultRatioParameter(),
      parameterThreshold: ratio,
      compOperator: '<'
    });
    const minRatioConditionSet = new ConditionSet({
      conditions: [minCurrentRatioCondition, minNextRatioCondition],
      operator: 'OR'
    });
    const vaultStateActiveCondition = new Condition({
      name: 'vaultStateActive',
      parameter: this.parameterFactory.getVaultStateParameter(),
      parameterThreshold: VaultState.ACTIVE, // TODO: Are there other States where we have to react!!!
      compOperator: '=='
    });
    const vaultStateMayLiquidateCondition = new Condition({
      name: 'vaultStateMayLiquidate',
      parameter: this.parameterFactory.getVaultStateParameter(),
      parameterThreshold: VaultState.MAY_LIQUIDATE,
      compOperator: '=='
    });
    const vaultStateActiveConditionSet = new ConditionSet({
      conditions: [vaultStateActiveCondition, vaultStateMayLiquidateCondition],
      operator: 'OR'
    });
    return new ConditionSet({
      conditions: [vaultStateActiveConditionSet, minRatioConditionSet]
    });
  }

  /**
   * Returns the condition set for compounding.
   * @param ratio the amount to use for compounding
   * @returns The given condition set
   */
  public getCompoundingConditionSet(amount: number): ConditionSet {
    const balanceThresholdCondition = new Condition({
      name: 'DFITokenBalance',
      parameter: this.parameterFactory.getDFIBalanceParameter(),
      parameterThreshold: amount,
      compOperator: '>='
    });
    return new ConditionSet({
      conditions: [balanceThresholdCondition]
    });
  }
}
