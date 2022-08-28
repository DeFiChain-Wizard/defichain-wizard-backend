/* eslint-disable @typescript-eslint/ban-types */
/**
 * Allows to work with Promises in intervals.
 */
class SmartInterval {
  private asyncFn: Function;
  private delay: number;
  private isRunning = false;

  constructor(asyncFn: Function, delayMs: number) {
    this.asyncFn = asyncFn;
    this.delay = delayMs;
  }

  /**
   * The actual interval cycle that runs the function.
   *
   * It will wait for the given time.
   */
  private async cycle() {
    await this.asyncFn();
    await this.waitFor(this.delay);
    if (this.isRunning) this.cycle();
  }

  /**
   * The actual waiting function that is called by the cycle.
   *
   * @param ms the time in ms to wait
   * @returns The timout as promise
   */
  private waitFor(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(() => res(), ms));
  }

  /**
   * Starts the actual cycle.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.cycle();
  }

  /**
   * Stops the cycle.
   */
  public stop(): void {
    if (this.isRunning) this.isRunning = false;
  }
}

export { SmartInterval };
