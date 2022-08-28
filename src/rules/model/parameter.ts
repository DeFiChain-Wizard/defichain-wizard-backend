/**
 * The base class for a parameter.
 */
export class Parameter {
  private getValueFunc: () => Promise<number | string>;
  constructor(props: {
    name: string;
    getValue: () => Promise<number | string>;
  }) {
    this.getValueFunc = props.getValue;
  }
  /**
   * Returns the current value of the parameter.
   * @returns the current value of this parameter
   */
  public getCurrentValue(): Promise<number | string> {
    return this.getValueFunc();
  }
}
