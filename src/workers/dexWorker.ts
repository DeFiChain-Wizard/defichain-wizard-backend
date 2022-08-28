import { BigNumber } from '@defichain/jellyfish-api-core';
import {
  CTransactionSegWit,
  CompositeSwap
} from '@defichain/jellyfish-transaction';
import { Prevout } from '@defichain/jellyfish-transaction-builder/dist';
import { TokenData } from '@defichain/whale-api-client/dist/api/tokens';
import { logInfo, logDebug } from '@defichainwizard/custom-logging';
import { BaseWorker } from './baseWorker';

/**
 * This strategy will take care of reinvesting tokens.
 */
export class DexWorker extends BaseWorker {
  public async swapToken(
    fromTokenSymbol: string,
    toTokenSymbol: string,
    amount: BigNumber,
    prevout?: Prevout
  ): Promise<CTransactionSegWit | undefined> {
    logInfo(`Swapping ${amount} ${fromTokenSymbol} to ${toTokenSymbol}`);

    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();

    const fromToken = (await this.wallet.getToken(
      fromTokenSymbol
    )) as TokenData;
    if (!fromToken) {
      throw `SwapToken could not find TokenID for fromToken: ${fromTokenSymbol}`;
    }

    const toToken = (await this.wallet.getToken(toTokenSymbol)) as TokenData;
    if (!toToken) {
      throw `SwapToken could not find TokenID for toToken: ${toTokenSymbol}`;
    }

    const bestPath = await this.wallet
      .getClient()
      .poolpairs.getBestPath(fromToken.id, toToken.id);

    const pools = bestPath.bestPath.map((pool) => {
      return { id: Number(pool.poolPairId) };
    });

    logInfo(
      `Using the folloing PoolID/s for the swap: ${pools
        .map((pool) => pool.id)
        .join(',')}`
    );

    if (pools.length == 0) {
      throw `Could not retrieve SwapPath for tokens: ${fromTokenSymbol} -> ${toTokenSymbol}`;
    } else if (pools.length == 1) {
      logDebug(
        `This is a PoolSwap ${amount} ${fromTokenSymbol}  -> ${toTokenSymbol}`
      );
    } else if (pools.length >= 2) {
      logDebug(
        `This is a CompositeSwap ${amount} ${fromTokenSymbol} -> ${toTokenSymbol}`
      );
    }

    const poolPair = await this.wallet.getPoolPairByID(
      pools[pools.length - 1].id.toString()
    );

    if (!poolPair) {
      throw `Could not retrieve Poolpair for PoolID: ${
        pools[pools.length - 1].id
      }`;
    }
    // Calculate expected amount of tokens to retrieve based on DEX price
    const amountTo = new BigNumber(
      poolPair.tokenA.symbol === fromTokenSymbol
        ? poolPair.priceRatio.ab
        : poolPair.priceRatio.ba
    ).multipliedBy(amount);

    logInfo(`amountTo: ${amountTo}`);

    // Calculate max price that includes 1% slippage
    // TODO: Slippage as a parameter in GUI?
    const maxPrice = new BigNumber(poolPair.priceRatio.ba)
      .times(1.01)
      .decimalPlaces(8);

    logInfo(`MaxPrice: ${maxPrice}`);

    //! What if 1% is not enough to make the swap?? -> dev-talk

    const swap: CompositeSwap = {
      poolSwap: {
        fromScript: script,
        toScript: script,
        fromTokenId: parseInt(fromToken.id),
        toTokenId: parseInt(toToken.id),
        fromAmount: amount,
        maxPrice
      },

      pools: pools
      //      pools: [{ id: Number(poolPair.id) }]
    };

    const dfTx = await transactionBuilder.dex.compositeSwap(swap, script);

    if (!prevout) {
      return this.transaction.sendTransaction({
        txn: dfTx,
        initialWaitTime: 0,
        waitTime: 5000,
        retries: 3,
        client: this.client
      });
    } else {
      return this.transaction.sendTransactionWithPrevout(dfTx, prevout);
    }
  }
}
