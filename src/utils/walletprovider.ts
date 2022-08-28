import { WhaleWalletAccountProvider } from '@defichain/whale-api-wallet';
import { JellyfishWallet } from '@defichain/jellyfish-wallet';
import {
  Bip32Options,
  MnemonicHdNodeProvider
} from '@defichain/jellyfish-wallet-mnemonic';
import { Network } from '@defichain/jellyfish-network';
import { WhaleApiClient } from '@defichain/whale-api-client';
import { getDFIChainConfig, getDFINetwork } from '../config/configuration';
import { Wallet } from '../interfaces';
import { logDebug } from '@defichainwizard/custom-logging';

const SEED_PHRASE_LENGTH = 24;
/**
 * Provides the correct wallet based on the seed structure
 */
class WalletProvider {
  private readonly client: WhaleApiClient;
  constructor() {
    this.client = new WhaleApiClient(getDFIChainConfig());
  }

  /**
   *
   * @returns The WhaleApi
   */
  getClient(): WhaleApiClient {
    return this.client;
  }

  /**
   * Retrieves the correct wallet object for the correct network.
   * @param seed The 24 words seed phrase
   * @returns The wallet object
   */
  getWallet(seed: string[]): Wallet {
    logDebug('Quick check of provided seed to get the wallet correctly.');
    if (seed?.length === SEED_PHRASE_LENGTH) {
      logDebug('Found seed phrase.');
      logDebug(getDFINetwork());
      return {
        wallet: new JellyfishWallet(
          MnemonicHdNodeProvider.fromWords(
            seed,
            WalletProvider.bip32Options(getDFINetwork())
          ),
          new WhaleWalletAccountProvider(this.client, getDFINetwork())
        )
      };
    } else {
      // exit application - no seed => no job! :)
      throw new Error(
        `Please check your seed words (length: ${seed?.length}). It does not seem to be valid!`
      );
    }
  }

  private static bip32Options(network: Network): Bip32Options {
    return {
      bip32: {
        public: network.bip32.publicPrefix,
        private: network.bip32.privatePrefix
      },
      wif: network.wifPrefix
    };
  }
}

export { WalletProvider };
