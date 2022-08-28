import { WhaleApiClient } from '@defichain/whale-api-client';
import { DFIWallet } from '../../blockchain';

/**
 * The Base Factory to act as superclass for the factory.
 */
export class BaseFactory {
  protected wallet: DFIWallet;
  protected vaultId: string;
  protected client: WhaleApiClient;

  constructor(wallet: DFIWallet, vaultId: string) {
    this.wallet = wallet;
    this.client = wallet.getClient();
    this.vaultId = vaultId;
  }
}
