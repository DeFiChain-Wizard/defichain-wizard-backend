import { WhaleApiClient } from '@defichain/whale-api-client';
import { WhaleWalletAccount } from '@defichain/whale-api-wallet';
import { Transaction } from '@defichainwizard/custom-transactions';
import { DFIWallet } from '../blockchain/dfiWallet';
import {
  getDFINetwork,
  getSEEDFromEnv,
  getWalletAddress
} from '../config/configuration';

/**
 * This is the base class for all workers. All common stuff should be implemented here.
 */
export class BaseWorker {
  protected wallet: DFIWallet;
  protected walletAddress: string;
  protected client: WhaleApiClient;
  protected account: WhaleWalletAccount;
  protected transaction: Transaction;

  constructor(wallet: DFIWallet, walletAddress: string = getWalletAddress()) {
    this.wallet = wallet;
    this.walletAddress = walletAddress;
    this.client = wallet.getClient();
    this.account = wallet.getAccount();
    this.transaction = new Transaction({
      client: this.client,
      account: this.account,
      network: getDFINetwork(),
      passphrase: getSEEDFromEnv()
    });
  }
}
