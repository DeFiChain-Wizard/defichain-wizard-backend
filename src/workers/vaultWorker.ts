import { BigNumber } from '@defichain/jellyfish-api-core';
import { Prevout } from '@defichain/jellyfish-transaction-builder/dist/provider';
import { DFIWallet } from '../blockchain/dfiWallet';
import { getWalletAddress } from '../config/configuration';
import { CTransactionSegWit } from '@defichain/jellyfish-transaction';
import { CollateralToken, ConstantValues } from '../interfaces';
import {
  sendMessageToTelegram,
  logErrorTelegram,
  tryGet
} from '../utils/helpers';
import { fromAddress } from '@defichain/jellyfish-address';
import { BaseWorker } from './baseWorker';
import { Transaction } from '@defichainwizard/custom-transactions';
import { AddressToken } from '@defichain/whale-api-client/dist/api/address';
import { logDebug, logInfo } from '@defichainwizard/custom-logging';

/**
 * This Worker can add or remove funds from the vault.
 */
export class VaultWorker extends BaseWorker {
  private vaultAddress: string;

  constructor(
    wallet: DFIWallet,
    vaultAddress: string,
    walletAddress: string = getWalletAddress()
  ) {
    super(wallet, walletAddress);
    this.vaultAddress = vaultAddress;
  }

  /**
   * Adding Collateral to a Vault
   * @param token The Token to add as collateral
   * @param amount the amount of tokens to add as collateral
   */
  async addCollateral(
    token: CollateralToken,
    amount: BigNumber | number
  ): Promise<CTransactionSegWit | undefined> {
    // keep 0.1 UTXO DFI for transaction fees
    const minimumUTXOAmount = ConstantValues.minimumUTXOAmount;

    if (typeof amount === 'number') {
      amount = new BigNumber(amount);
    }
    // Check if we have enough balance
    logInfo(`Getting balance for token ${token}`);
    const balance = (await this.wallet.getTokenBalance(token)) as AddressToken;
    let tokenBalance = balance?.amount;
    tokenBalance = tokenBalance ?? (token === 'DFI' ? '0' : undefined);
    const tokenId = balance?.id;
    // const tokenBalance = balance?.amount ?? (token === 'DFI' ? 0 : undefined);
    logDebug(`tokenBalance: ${tokenBalance}`);
    if (tokenBalance === undefined) {
      logErrorTelegram(
        `Unable to get Balance for Token ${token} or balance is 0`
      );
      return;
    }
    let prevout: Prevout | undefined = undefined;

    const balanceAmount = new BigNumber(tokenBalance);
    logInfo(`Having ${tokenBalance} ${token} Tokens in wallet`);

    if (balanceAmount < amount) {
      if (token === 'DFI') {
        //If we want to add DFI, we might have UTXOs
        const UTXOBalance = new BigNumber(await this.wallet.getUTXOBalance());
        logInfo(`Having ${UTXOBalance} DFI as UTXO`);
        const availableUTXO = UTXOBalance.minus(minimumUTXOAmount); // need to keep one UTXO
        if (availableUTXO.plus(balanceAmount) >= amount) {
          // we have to convert some UTXOs to make it happen

          const message = `Converting ${UTXOBalance.minus(
            minimumUTXOAmount
          )} DFI from UTXO to Token`;

          logInfo(message);
          sendMessageToTelegram(message);

          const tx = await this.wallet.utxoToOwnAccount(
            UTXOBalance.minus(minimumUTXOAmount),
            undefined
          );
          prevout = Transaction.prevOutFromTx(tx);
        }
      } else {
        logErrorTelegram(
          `Not enough ${token} tokens to deposit ${amount} (having: ${tokenBalance})`
        );
        return;
      }
    }
    // having enough tokens, we can actually deposit to the vault
    logInfo(`Depositing ${amount} ${token} to vault`);
    if (!tokenId) {
      logErrorTelegram(`Unable to get Id for Token ${token}`);
      return;
    }
    return await this.depositToVault(parseInt(tokenId), amount, prevout);
  }

  /**
   * depositing tokens to vault
   * @param tokenId The id of the Token to add as collateral
   * @param amount the amount of tokens to add as collateral
   * @param prevout Prevout object to depend on previous transaction
   * @return Transaction
   */
  private async depositToVault(
    tokenId: number,
    amount: BigNumber,
    prevout: Prevout | undefined = undefined
  ): Promise<CTransactionSegWit> {
    logInfo('Adding collateral...');

    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();
    const txn = await transactionBuilder.vault.depositToVault(
      {
        vaultId: this.vaultAddress,
        from: script,
        tokenAmount: {
          token: tokenId,
          amount: amount
        }
      },
      script
    );
    return this.transaction.sendTransactionWithPrevout(txn, prevout);
  }
  private async withdrawFromVault(
    tokenId: number,
    amount: BigNumber,
    prevout: Prevout | undefined = undefined
  ): Promise<CTransactionSegWit> {
    const script = await this.account.getScript();
    // TODO: TB in base class
    const transactionBuilder = this.account.withTransactionBuilder();
    const txn = await transactionBuilder.vault.withdrawFromVault(
      {
        vaultId: this.vaultAddress,
        to: script,
        tokenAmount: {
          token: tokenId,
          amount: amount
        }
      },
      script
    );
    return this.transaction.sendTransactionWithPrevout(txn, prevout);
  }

  async removeCollateral(
    token: CollateralToken,
    amount: BigNumber | number
  ): Promise<void> {
    logInfo('Removing collateral...');
    // Check Collateral Amount in Vault
    const vault = await this.wallet.getVault(this.vaultAddress);

    const tokenAmountRes = tryGet(() =>
      vault.getCollateralAmountByToken(token)
    );
    if (!tokenAmountRes.success) {
      logErrorTelegram(
        `Problem getting Collateral Amount: ${tokenAmountRes.error}`
      );
      return;
    }
    const tokenAmount = tokenAmountRes.value;
    if (new BigNumber(tokenAmount.amount) < amount) {
      logErrorTelegram(
        `Collateral Amount of token ${token} (${tokenAmount.amount}) is less than requested withdraw amount (${amount})`
      );
      return;
    }
    //Get Token ID
    const tokenId = parseInt(tokenAmount.id);

    // Withdraw from Vault
    logInfo(`Withdrawing ${amount} ${token} from Vault ${this.vaultAddress}`);
    this.withdrawFromVault(tokenId, new BigNumber(amount));
  }

  async transferVault(targetAddress: string) {
    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();
    const targetScript = fromAddress(targetAddress, 'mainnet')?.script;
    if (!targetScript) {
      logErrorTelegram('DId not find target Script');
      return;
    }
    const txn = await transactionBuilder.loans.updateVault(
      {
        vaultId: this.vaultAddress,
        ownerAddress: targetScript,
        schemeId: 'MIN150'
      },
      script
    );
    return this.transaction.sendTransactionWithPrevout(txn, undefined);
  }
}
