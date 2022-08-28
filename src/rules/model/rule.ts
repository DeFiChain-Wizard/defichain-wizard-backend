import { logInfo } from '@defichainwizard/custom-logging';
import { ActionReturn } from '../../interfaces';
import { ActionSet } from './actionSet';
import { ConditionSet } from './conditionSet';

/**
 * The base class for a rule.
 *
 * It holds all models we need for our rule based system.
 */
export class Rule {
  private name: string;
  private conditionSet: ConditionSet;
  private actionSet: ActionSet;
  private description: string;

  constructor(props: {
    name: string;
    description: string;
    vaultId: string;
    conditionSet: ConditionSet;
    actionSet: ActionSet;
  }) {
    this.description = props.description;
    this.name = props.name;
    this.conditionSet = props.conditionSet;
    this.actionSet = props.actionSet;
  }

  /**
   * Returns the name of the rule.
   *
   * @returns the name of the rule
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Returns the description of the rule.
   *
   * @returns the description of the rule
   */
  public getDescription(): string {
    return this.description;
  }

  /**
   * Runs the rule.
   */
  public async run(): Promise<ActionReturn> {
    const condSetStatus = await this.conditionSet.isFulfilled();
    if (!condSetStatus) {
      logInfo(
        `Did not run rule "${this.name}" because conditionSet was not fulfilled.`
      );
      return { isSuccess: true, hasTxSent: false };
    } else {
      logInfo(`Running ActionSet of Rule ${this.name}.`);
      //TODO: add Error handling
      return await this.actionSet.run();
    }
  }
}
