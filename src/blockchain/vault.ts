import { WhaleApiClient } from '@defichain/whale-api-client';
import {
  LoanVaultActive,
  LoanVaultLiquidated,
  LoanVaultTokenAmount
} from '@defichain/whale-api-client/dist/api/loan';
import { CollateralToken, ConstantValues, VaultState } from '../interfaces';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { logErrorTelegram } from '../utils/helpers';
import { logError } from '@defichainwizard/custom-logging';
import { BlockScanner } from '@defichainwizard/custom-transactions';

/**
 * The Vault implementation that offers all operations on the vault.
 */
class Vault {
  private readonly client: WhaleApiClient;
  private readonly vaultAddress: string;
  private readonly blockScanner: BlockScanner;

  // @ts-expect-error TS2564: Property '_loanVault' has no initializer and is not definitely assigned in the constructor.
  // This is expected, but no problem, as we init _loanVault in the static build method, which is the only way to create a new Vault object
  private _loanVault: LoanVaultActive;
  private constructor(
    client: WhaleApiClient,
    vaultAddress: string,
    blockScanner: BlockScanner
  ) {
    this.client = client;
    this.vaultAddress = vaultAddress;
    this.blockScanner = blockScanner;
  }

  /**
   * Creates a new Instance of Vault, according to the Builder pattern
   *
   * @param client WhaleApiClient object
   * @param vaultAddress string address of the Vault
   * @returns The Vault object
   */
  public static async build(
    client: WhaleApiClient,
    vaultAddress: string,
    blockScanner: BlockScanner
  ): Promise<Vault> {
    const vault = new Vault(client, vaultAddress, blockScanner);
    await vault.setLoanVault();
    return vault;
  }

  /**
   * Sets the loanVault for the internal vault address, this is required init the Vault object
   * @returns void
   */
  private async setLoanVault(): Promise<void> {
    const vault = await this.client.loan.getVault(this.vaultAddress);
    if (!Vault.isVaultActive(vault)) {
      logError(`Current Vault state: ${vault.state}`);
      throw 'Vault is not Active (possibly in Liquidation)';
    }
    this._loanVault = vault;
  }

  /**
   * Returns the inner LoanVault object
   *
   * @returns The LoanVault object
   */
  public get loanVault(): LoanVaultActive {
    return this._loanVault;
  }

  /**
   * Returns the inner Extended VaultState: Ocean gives us Active, but in LW and DefiScan we differentiate as READY / EMPTY / ACTIVE.
   * We want to do this here, too. EMPTY means means no collateral, READY means no Loan
   *
   * @returns The VaultState
   */
  public getVaultState(): VaultState {
    if (
      this._loanVault.state === VaultState.ACTIVE &&
      this._loanVault.collateralRatio === '-1'
    ) {
      if (
        new BigNumber(this._loanVault.collateralValue)
          .decimalPlaces(6, BigNumber.ROUND_FLOOR)
          .isEqualTo(0)
      ) {
        return VaultState.EMPTY;
      } else if (
        new BigNumber(this._loanVault.loanValue)
          .decimalPlaces(6, BigNumber.ROUND_FLOOR)
          .isEqualTo(0)
      ) {
        return VaultState.READY;
      }
    }
    return this._loanVault.state;
  }

  /**
   * Calculates the next Collateral Value in USD
   *
   * @returns Next Collateral Value
   */
  public async getNextCollateralValue(): Promise<BigNumber> {
    const currentBlockHeight = await this.blockScanner.getBlockHeight();

    let USDCollateralValue = 0.0;

    // using: "if-immediate" for performance purposes
    if (currentBlockHeight < ConstantValues.dUSDCollateralIncreaseBlock) {
      USDCollateralValue = 0.99;
    } else if (
      currentBlockHeight >= ConstantValues.dUSDCollateralIncreaseBlock
    ) {
      USDCollateralValue = ConstantValues.dUSDCollateralValueFCE;
    }

    return this._loanVault.collateralAmounts.reduce(
      (collateralSum: BigNumber, collateral: LoanVaultTokenAmount) =>
        collateralSum.plus(
          new BigNumber(collateral.amount).multipliedBy(
            collateral.activePrice?.next?.amount ??
              (collateral.symbol === 'DUSD' ? USDCollateralValue : 0)
          )
        ),
      new BigNumber(0)
    );
  }

  /**
   * Calculates the next Loan Value in USD
   *
   * @returns Next Loan Value
   */
  public getNextLoanValue(): BigNumber {
    return this._loanVault.loanAmounts.reduce(
      (loanSum: BigNumber, loan: LoanVaultTokenAmount) =>
        loanSum.plus(
          new BigNumber(loan.amount).multipliedBy(
            loan.activePrice?.next?.amount ?? (loan.symbol === 'DUSD' ? 1 : 0)
          )
        ),
      new BigNumber(0)
    );
  }

  /**
   * Calculates the next Collateral Ratio
   *
   * @returns Next Collateral Ratio in percent
   */
  public async getNextCollateralRatio(): Promise<BigNumber> {
    return (await this.getNextCollateralValue())
      .dividedBy(this.getNextLoanValue())
      .multipliedBy(100);
  }

  /**
   * Returns the current Collateral Ratio
   *
   * @returns Current Collateral Ratio in percent
   */
  public getCurrentCollateralRatio(): BigNumber {
    try {
      const ratio = new BigNumber(this._loanVault.informativeRatio);
      return ratio;
    } catch (e) {
      logErrorTelegram(
        `Could not get collateral (${this._loanVault.informativeRatio})`
      );
      return new BigNumber(-1);
    }
  }

  /**
   * Returns the amount of Collateral for a specific Token
   *
   * @param token The token from the collateral
   * @returns Amount of Collateral for the given Token
   */
  public getCollateralAmountByToken(
    token: CollateralToken
  ): LoanVaultTokenAmount {
    const tokenAmount = this._loanVault.collateralAmounts.find(
      (a) => a.symbol === token
    );
    if (!tokenAmount) {
      throw `Did not find Collateral Amount for token ${token} in vault ${this.vaultAddress}`;
    }
    return tokenAmount;
  }

  /**
   * Checks if the vault is in ACTIVE state.
   *
   * Some values of the vault are only available if the vault is in ACTIVE state.
   *
   * @param vault the vault to check
   * @returns true if the vault is in ACTIVE state
   */
  public static isVaultActive(
    vault: LoanVaultActive | LoanVaultLiquidated
  ): vault is LoanVaultActive {
    return (
      vault.state === 'ACTIVE' ||
      vault.state === 'MAY_LIQUIDATE' ||
      vault.state === 'UNKNOWN'
    );
  }

  /**
   * Checks if the current ault is in ACTIVE state.
   *
   * Some values of the vault are only avavailable if the vault is in ACTIVE state.
   *
   * @returns true if the vault is in ACTIVE state
   */
  public isActive(): boolean {
    return Vault.isVaultActive(this._loanVault);
  }

  public getVaultLoanSchemePercentage(): number {
    return Number(this.loanVault.loanScheme.minColRatio);
  }
}
export { Vault };
