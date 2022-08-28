import { Condition } from './condition';

/**
 * The base class for a condition set.
 */
export class ConditionSet {
  private conditions: (Condition | ConditionSet)[];
  private operator: 'AND' | 'OR';

  constructor(props: {
    conditions: (Condition | ConditionSet)[];
    operator?: 'AND' | 'OR';
  }) {
    this.operator = props.operator ?? 'AND';
    this.conditions = props.conditions;
  }

  /**
   * Returns true of false if all conditions in the set match.
   *
   * @returns true, if all conditions in the set match
   */
  public async isFulfilled(): Promise<boolean> {
    const condResults = await Promise.all(
      this.conditions.map(async (condition) => await condition.isFulfilled())
    );
    if (this.operator === 'AND') {
      return condResults.every((condition) => condition === true);
    } else {
      return condResults.some((condition) => condition === true);
    }
  }
}
