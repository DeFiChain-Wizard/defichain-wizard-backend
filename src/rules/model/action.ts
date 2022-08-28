import { logDebug } from '@defichainwizard/custom-logging';
import { ActionReturn, PreviousOuts } from '../../interfaces';
import { logErrorTelegram } from '../../utils/helpers';
import { Parameter } from './parameter';

/**
 * The base class for an action.
 */
export class Action {
  private name: string;
  private inputParameters: Parameter[]; // TODO: How to deal with these
  private runFunction: (
    prevout: PreviousOuts,
    input?: Parameter[]
  ) => Promise<ActionReturn>;

  constructor(props: {
    name: string;
    inputParameters: Parameter[];
    runFunction: (
      prevout?: PreviousOuts,
      input?: Parameter[]
    ) => Promise<ActionReturn>;
  }) {
    this.name = props.name;
    this.inputParameters = props.inputParameters;
    this.runFunction = props.runFunction;
  }

  /**
   * Runs the action.
   */
  public async run(prevout?: PreviousOuts): Promise<ActionReturn> {
    let ret = { hasTxSent: false, isSuccess: false };
    try {
      logDebug(`Running Action ${this.name}`);
      ret = await this.runFunction(prevout, this.inputParameters);
      if (!ret.isSuccess) {
        throw new Error(
          `Something went wrong executing the action: ${this.name}`
        );
      }
    } catch (e) {
      logErrorTelegram(`Error Running Action ${this.name}: ${e}`);
    }
    return ret;
  }
}
