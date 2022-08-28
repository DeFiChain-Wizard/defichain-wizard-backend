import { logDebug } from '@defichainwizard/custom-logging';
import { Parameter } from './parameter';

/**
 * The base class for a condition.
 *
 * A condition must match so that some action takes place.
 */
export class Condition {
  private name: string;
  private parameter: Parameter;
  private parameterThreshold: number | string;
  private compOperator: string; //TODO: which type

  constructor(props: {
    name: string;
    parameter: Parameter;
    parameterThreshold: number | string;
    compOperator: '<' | '>' | '==' | '<=' | '>=' | '!=';
  }) {
    this.name = props.name;
    this.parameter = props.parameter;
    this.parameterThreshold = props.parameterThreshold;
    this.compOperator = props.compOperator;
    if (
      typeof this.parameterThreshold === 'string' &&
      !(this.compOperator === '==' || this.compOperator === '!=')
    ) {
      throw `Cannot use Operator ${this.compOperator} for String Type, received as Threshold`;
    }
  }

  /**
   * Returns true of false if a certain condition matches.
   *
   * @returns true, if a condition matches
   */
  public async isFulfilled(): Promise<boolean> {
    const val = await this.parameter.getCurrentValue();
    if (
      typeof val === 'string' &&
      !(this.compOperator === '==' || this.compOperator === '!=')
    ) {
      throw `Cannot use Operator ${this.compOperator} for String Type, received from Parameter`;
    }
    logDebug(
      `Validating Condition ${this.name}: ${val} ${this.compOperator} ${this.parameterThreshold}`
    );
    switch (this.compOperator) {
      //TODO: I think there should be a better way to do this. for now just quick`n dirty
      case '<': {
        return val < this.parameterThreshold;
      }
      case '<=': {
        return val <= this.parameterThreshold;
      }
      case '>=': {
        return val >= this.parameterThreshold;
      }
      case '==': {
        return val === this.parameterThreshold;
      }
      case '>': {
        return val > this.parameterThreshold;
      }
      case '!=': {
        return val != this.parameterThreshold;
      }
      default: {
        return false;
      }
    }
  }
}
