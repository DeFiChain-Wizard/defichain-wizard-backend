import {
  AddLiquidityAmount,
  LiquidityPoolPairAmount,
  PreviousOuts
} from '../interfaces';
import type {
  PoolRemoveLiquidity,
  CTransactionSegWit
} from '@defichain/jellyfish-transaction';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { Transaction } from '@defichainwizard/custom-transactions';
import { BaseWorker } from './baseWorker';
import { logDebug, logInfo, logWarn } from '@defichainwizard/custom-logging';
import { logErrorTelegram } from '../utils';

/**
 * This strategy will add or remove tokens to/from the liquidity mining.
 */
export class LiquidityMiningWorker extends BaseWorker {
  async removeLiquidity(
    amounts: LiquidityPoolPairAmount[],
    prevouts?: PreviousOuts
  ): Promise<CTransactionSegWit[]> {
    logInfo('Removing liquidity...');

    amounts.forEach((amount) => {
      if (amount.amount.eq(0)) {
        logWarn(`No liquidity avalable to remove from pool ${amount.poolpair}`);
      } else {
        logDebug(
          `Will remove liquidity ${amount.amount} of pool ${amount.poolpair}`
        );
      }
    });

    const liquidityAvailable = amounts.reduce(
      (sum, amount) => sum.plus(amount.amount),
      new BigNumber(0)
    );

    if (liquidityAvailable.eq(0)) {
      logWarn(
        `leaving remove liqidity method -> no liquidity available to remove`
      );
      return [];
    }

    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();

    let prevout = prevouts;
    const returnTxs: CTransactionSegWit[] = [];
    for (const amount of amounts) {
      const tokenInfo = await this.wallet.getToken(amount.poolpair);
      if (!tokenInfo || !tokenInfo.id) {
        logErrorTelegram(
          `Could not get token Id for LM-Token ${amount.poolpair}`
        );
        throw `Could not get token Id for LM-Token ${amount.poolpair}`;
        //TODO What to do in this case?
      }
      const removeLMInput: PoolRemoveLiquidity = {
        amount: amount.amount,
        tokenId: parseInt(tokenInfo.id),
        script
      };
      const txn = await transactionBuilder.liqPool.removeLiquidity(
        removeLMInput,
        script
      );

      const tx = await this.transaction.sendTransactionWithPrevout(
        txn,
        prevout
      );
      prevout = Transaction.prevOutFromTx(tx);
      returnTxs.push(tx);
    }
    return returnTxs;
  }

  /**
   * Adds a certain to the liquidity mining.
   * @param amounts the amounts to add
   * @param prevout the prevout
   * @returns the transaction
   */
  public async addLiquidity(
    amounts: AddLiquidityAmount[],
    prevouts?: PreviousOuts
  ): Promise<CTransactionSegWit[]> {
    logInfo('Adding liquidity...');
    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();
    let prevout = prevouts;
    const returnTxs: CTransactionSegWit[] = [];
    for (const amount of amounts) {
      const tokensInPair = amount.poolpair.split('-');
      if (tokensInPair.length !== 2) {
        logErrorTelegram(
          `Did not find exactly 2 Tokens in pool pair ${amount.poolpair}`
        );
        throw `Did not find exactly 2 Tokens in pool pair ${amount.poolpair}`;
      }

      if (amount.isDUSD) {
        logErrorTelegram('Giving me DUSD Amounts is not supported yet!!');
        throw 'Giving me DUSD Amounts is not supported yet!!';
      } else {
        const token = tokensInPair.find((e) => e !== 'DUSD');
        if (!token) {
          logErrorTelegram(
            `Did not find Current token of Poolpair ${amount.poolpair}`
          );
          throw `Did not find Current token of Poolpair ${amount.poolpair}`;
        }

        const tokenInfo = await this.wallet.getToken(token);

        if (!tokenInfo || !tokenInfo.id) {
          logErrorTelegram(`Could not get token Id for Token ${token}`);
          throw `Could not get token Id  Token ${token}`;
          //TODO What to do in this case?
        }

        // Get DUSD Amount
        const liquidityPool = await this.wallet.getPoolPairBySymbol(
          amount.poolpair
        );
        if (!liquidityPool) {
          logErrorTelegram(
            `There was an error getting the Pooldata for token ${token}`
          );
          throw `There was an error getting the Pooldata for token ${token}`;
        }

        const tokenToDUSDPrice =
          liquidityPool.tokenA.symbol === 'DUSD'
            ? liquidityPool.priceRatio.ab
            : liquidityPool.priceRatio.ba;
        const dusdAmount = amount.amount.multipliedBy(tokenToDUSDPrice);

        logInfo(
          `Will add Liquidity: ${amount.amount}@${token} & ${dusdAmount}@DUSD`
        );

        const txn = await transactionBuilder.liqPool.addLiquidity(
          {
            shareAddress: script,
            from: [
              {
                balances: [
                  {
                    token: parseInt(tokenInfo.id),
                    amount: amount.amount
                  },
                  {
                    token: 15, // DUSD is Token ID 15!!
                    amount: dusdAmount
                  }
                ],
                script
              }
            ]
          },
          script
        );
        const tx = await this.transaction.sendTransactionWithPrevout(
          txn,
          prevout
        );
        prevout = Transaction.prevOutFromTx(tx);
        returnTxs.push(tx);
      }
    }
    return returnTxs;
  }
}
