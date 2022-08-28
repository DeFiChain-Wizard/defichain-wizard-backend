import { AddressToken } from '@defichain/whale-api-client/dist/api/address';
import { Parameter } from '../model';
import { BaseFactory } from './base';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { logDebug } from '@defichainwizard/custom-logging';
import { shortID } from '../../utils/helpers';

/**
 * The Parameter Factory serves all parameters.
 */
export class ParameterFactory extends BaseFactory {
  /**
   * Returns the current vault ratio as parameter.
   *
   * @returns the current vault ratio
   */
  public getCurrentVaultRatioParameter(): Parameter {
    const getVaultRatio = async () => {
      const vault = await this.wallet.getVault(this.vaultId);
      logDebug(
        `Current vault ratio for '${shortID(this.vaultId)}: ${vault
          .getCurrentCollateralRatio()
          .toNumber()}%.`
      );
      return vault.getCurrentCollateralRatio().toNumber();
    };
    return new Parameter({
      name: 'currentVaultRatio',
      getValue: getVaultRatio
    });
  }

  /**
   * Returns the NEXT vault ratio as parameter.
   *
   * @returns the NEXT vault ratio
   */
  public getNextVaultRatioParameter(): Parameter {
    return new Parameter({
      name: 'nextVaultRatio',
      getValue: async () => {
        const vault = await this.wallet.getVault(this.vaultId);
        logDebug(
          `Next vault ratio for '${shortID(this.vaultId)}: ${vault
            .getNextCollateralRatio()
            .toNumber()}%.`
        );
        return vault.getNextCollateralRatio().toNumber();
      }
    });
  }

  /**
   * Returns the current vault state as parameter.
   *
   * @returns the current vault state (e.g. READY/EMPTY/ACTIVE/...)
   */
  public getVaultStateParameter() {
    const getVaultState = async () => {
      const vault = await this.wallet.getVault(this.vaultId);
      logDebug(
        `Retrieving vault state for '${shortID(
          this.vaultId
        )}': ${vault.getVaultState()}`
      );
      return vault.getVaultState();
    };

    return new Parameter({
      name: 'vaultState',
      getValue: getVaultState
    });
  }

  /**
   * Returns the current DFI token balance as parameter.
   *
   * @returns the current DFI token balance
   */
  public getDFITokenBalanceParameter(): Parameter {
    const getDFITokenBalance = async () => {
      const balance = (await this.wallet.getTokenBalance(
        'DFI'
      )) as AddressToken;

      if (!balance) {
        return 0;
      } else {
        logDebug(
          `Retrieved DFI token balance from wallet. ${balance.amount} ${balance.displaySymbol}`
        );
        return new BigNumber(balance.amount).toNumber();
      }
    };

    return new Parameter({
      name: 'DFITokenBalance',
      getValue: getDFITokenBalance
    });
  }

  /**
   * Returns the current DFI UTXO token balance as parameter.
   *
   * @returns the current DFI UTXO balance
   */
  public getDFIUTXOBalanceParameter(): Parameter {
    const getDFIUTXOBalance = async () => {
      const balance = await this.wallet.getUTXOBalance();

      if (!balance) {
        return 0;
      } else {
        logDebug(`Retrieved DFI UTXO balance from wallet. ${balance} DFI`);
        return balance.toNumber();
      }
    };

    return new Parameter({
      name: 'DFIUTXOBalance',
      getValue: getDFIUTXOBalance
    });
  }

  /**
   * Returns the current DFI Token + UTXO Token balance as parameter.
   *
   * @returns the current DFI balance (UTXO+Token)
   */
  public getDFIBalanceParameter(): Parameter {
    const getDFIBalance = async () => {
      // minimum UTXO Balance that need to be kept for transaction fees
      const minimumUTXOBalance = new BigNumber(0.1);

      // get DFI Token Balance
      const DFIBalance = new BigNumber(
        await this.getDFITokenBalanceParameter().getCurrentValue()
      );

      // get available DFI UTXO Balance
      const UTXOBalance = new BigNumber(
        await this.getDFIUTXOBalanceParameter().getCurrentValue()
      ).minus(minimumUTXOBalance);

      // add both balances
      const balance = DFIBalance.plus(UTXOBalance);

      // only return a balance if it is greter than 0
      return balance.toNumber() < 0 ? 0 : balance.toNumber();
    };

    return new Parameter({
      name: 'DFIBalance',
      getValue: getDFIBalance
    });
  }
}
