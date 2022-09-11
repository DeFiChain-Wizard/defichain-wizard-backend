import { AddressToken } from '@defichain/whale-api-client/dist/api/address';
import {
  BlockScanner,
  Transaction
} from '@defichainwizard/custom-transactions';
import {
  CollateralToken,
  ConstantValues,
  PreviousOuts
} from '../../interfaces';
import {
  DexWorker,
  LiquidityMiningWorker,
  LoanWorker,
  VaultWorker
} from '../../workers';
import { Action, ActionSet } from '../model';
import { BaseFactory } from './base';
import { Prevout } from '@defichain/jellyfish-transaction-builder/dist/provider';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { logDebug, logInfo, logWarn } from '@defichainwizard/custom-logging';
import {
  logErrorTelegram,
  sendVaultRatioToTelegram
} from '../../utils/helpers';
import { Vault } from '../../blockchain';

/**
 * The factory that provides all actions.
 */
export class ActionFactory extends BaseFactory {
  private getAddCollateralAction(token: string, decimals: number): Action {
    const addCollateralFunction = async () => {
      // get token balance
      const tokenBalance = (await this.wallet.getTokenBalance(
        token
      )) as AddressToken;

      if (tokenBalance === undefined) {
        throw `Could not get ${token} Balance`;
      }

      const tokenBalanceAmount = new BigNumber(
        tokenBalance.amount
      ).decimalPlaces(decimals);

      let balanceToTransfer = new BigNumber(tokenBalanceAmount);

      if (tokenBalance.symbol == 'DFI') {
        // get unspend tokens
        const UTXOBalance = await this.wallet.getUTXOBalance();

        if (UTXOBalance === undefined) {
          throw `Could not get UTXO ${token} Balance`;
        }

        // deduct minimum UTXO Balance
        const minimunUTXOBalance = ConstantValues.minimumUTXOAmount;

        // create sum
        balanceToTransfer = tokenBalanceAmount
          .plus(UTXOBalance.minus(minimunUTXOBalance))
          .decimalPlaces(decimals);
      }

      logInfo(`Balance to transfer: ${balanceToTransfer} ${token}`);

      // add all existing DFI's to Collateral (full DFI's => decimals will be cut off)
      const vaultWrkr = new VaultWorker(this.wallet, this.vaultId);
      const tx = await vaultWrkr.addCollateral(
        token as CollateralToken,
        balanceToTransfer
      );
      if (!tx) {
        return {
          isSuccess: false,
          hasTxSent: true
        };
      }
      return {
        isSuccess: true,
        hasTxSent: true,
        prevout: Transaction.prevOutFromTx(tx)
      };
    };

    // create new Action
    return new Action({
      name: 'addCollateral',
      inputParameters: [],
      runFunction: addCollateralFunction
    });
  }

  /**
   * Returns the WAITING action that waits for the next block.
   *
   * @returns the WAITING action.
   */
  private getWaitingAction(): Action {
    const waitForNextBlockFunction = async () => {
      const myBlockScanner = new BlockScanner({
        client: this.client,
        address: await this.wallet.getAddress()
      });
      await myBlockScanner.waitForNextBlock(
        (
          await myBlockScanner.getCurrentBlock()
        ).height
      );

      return {
        isSuccess: true,
        hasTxSent: false
      };
    };

    // create new Action
    return new Action({
      name: 'waitForNextBlockFunction',
      inputParameters: [],
      runFunction: waitForNextBlockFunction
    });
  }

  /**
   * Returns the SWAP action to swap a token.
   *
   * @param swapTokenTo The token to swap to
   * @returns the SWAP action
   */
  private getSwapAction(swapTokenTo: string): Action {
    // swap DFI to dToken
    const swapTokenFunction = async () => {
      const minimumUTXOBalance = new BigNumber(
        ConstantValues.minimumUTXOAmount
      );

      // get unspend tokens
      const UTXOBalance = await this.wallet.getUTXOBalance();

      if (UTXOBalance === undefined) {
        throw `Could not get UTXO DFI Balance`;
      }

      let prevout: Prevout | undefined;

      if (UTXOBalance > minimumUTXOBalance) {
        logDebug(
          `UTXO Conversion necessary: ${UTXOBalance.minus(
            minimumUTXOBalance
          )} DFI`
        );

        const tx = await this.wallet.utxoToOwnAccount(
          UTXOBalance.minus(minimumUTXOBalance),
          undefined
        );

        if (!tx) {
          // UTXO Conversion failed
          return {
            isSuccess: false,
            hasTxSent: true
          };
        }

        prevout = Transaction.prevOutFromTx(tx);

        logDebug(`-> UTXO Conversion posted in Transactions ${tx.txId}`);

        // Wait for next Block. Swap can't access prevout and will not see the converted UTXOs
        await this.getWaitingAction().run();
      }

      // get DFI Balance
      const dfiBalance = (await this.wallet.getTokenBalance(
        'DFI'
      )) as AddressToken;

      if (dfiBalance === undefined) {
        throw 'Could not get DFI Balance';
      }

      const balanceToSwap = new BigNumber(dfiBalance.amount);

      logInfo(`${balanceToSwap} DFI to be swapped into: ${swapTokenTo}`);

      const dexWrkr = new DexWorker(
        this.wallet,
        await this.wallet.getAddress()
      );

      const tx = await dexWrkr.swapToken(
        'DFI',
        swapTokenTo,
        balanceToSwap,
        !prevout ? prevout : undefined
      );

      if (!tx) {
        return {
          isSuccess: false,
          hasTxSent: true
        };
      }

      logDebug(`-> ${swapTokenTo} Swap posted in Transaction ${tx.txId}`);

      return {
        isSuccess: true,
        hasTxSent: true,
        prevout: Transaction.prevOutFromTx(tx)
      };
    };

    // create new Action
    return new Action({
      name: 'swapToken',
      inputParameters: [],
      runFunction: swapTokenFunction
    });
  }

  //--------------------------------------------
  // Action sets
  //--------------------------------------------
  public getCompoundingActionSet(
    mode: number,
    swapTokenTo?: string
  ): ActionSet {
    switch (mode) {
      case 0: {
        logDebug(`Compounding Mode 0: Compounding is deactivated. -> skipping`);
        return new ActionSet({
          name: 'Compounding Mode 0',
          finishMessage: 'n/a',
          actions: [],
          walletData: {
            client: this.client,
            vaultId: this.vaultId
          }
        });
      }
      case 1: {
        logDebug(`Compounding Mode 1: Increase DFI Collateral`);
        return new ActionSet({
          name: 'Compounding Mode 1',
          finishMessage: 'Increased DFI collateral',
          actions: [this.getAddCollateralAction('DFI', 8)],
          walletData: {
            client: this.client,
            vaultId: this.vaultId
          }
        });
      }
      case 2: {
        logDebug(`Compounding Mode 2: Swap to ${swapTokenTo}`);
        if (!swapTokenTo) throw 'swapTokenTo is undefinded';

        return new ActionSet({
          name: 'Compounding Mode 2',
          finishMessage: `Token swap to ${swapTokenTo} successful!`,
          actions: [this.getSwapAction(swapTokenTo)],
          walletData: {
            client: this.client,
            vaultId: this.vaultId
          }
        });
      }
      case 3: {
        logDebug(
          `Compounding Mode 3: Swap to ${swapTokenTo} & increase collateral`
        );
        if (!swapTokenTo) throw 'swapTokenTo is undefinded';

        return new ActionSet({
          name: 'Compounding Mode 3',
          finishMessage: `Finished token swap and increased colletaral.`,
          actions: [
            this.getSwapAction(swapTokenTo),
            this.getWaitingAction(),
            this.getAddCollateralAction(swapTokenTo, 8)
          ],
          walletData: {
            client: this.client,
            vaultId: this.vaultId
          }
        });
      }
    }

    throw `Error! Compounding Mode: "${mode}" is not a vaild compounding mode!`;
  }

  public getDecreaseVaultRatioActionSet(
    poolpairs: { [key: string]: number },
    targetRatio: number
  ): ActionSet {
    const decreaseVaultRatio = async () => {
      sendVaultRatioToTelegram(
        await Vault.build(this.client, this.vaultId),
        targetRatio
      );
      // Getting amounts
      const amounts = await this.wallet.getLoanAmount(
        poolpairs,
        targetRatio,
        this.vaultId
      );

      const dUSDLoanSum = amounts
        .map((amount) => amount.DUSD)
        .reduce((sum, dusd) => sum.plus(dusd), new BigNumber(0));

      const dTokenLoans = amounts.map((amount) => {
        return { amount: amount.dToken, token: amount.token };
      });

      let loanTxPrevOut: Prevout;

      try {
        const loanWrkr = new LoanWorker(this.wallet, this.vaultId);
        const tx = await loanWrkr.takeLoan([
          ...dTokenLoans,
          { amount: dUSDLoanSum, token: 'DUSD' }
        ]);
        loanTxPrevOut = Transaction.prevOutFromTx(tx);
        logDebug(`takeLoan in transaction ${tx.txId}`);
      } catch (e) {
        logErrorTelegram(`There was an error taking the Loan: ${e}`);
        throw `There was an error taking the Loan: ${e}`;
      }
      // Adding Liquidity:

      // TODO: Add functionality to add commission rewards Tokens from wallet
      // Get Token Balances
      // const dTokenBalances = await Promise.all(
      //   Object.keys(poolpairs).map(async (token) => {
      //     const balance = await this.wallet.getTokenBalance(token);
      //     if (balance === undefined) {
      //       throw `Could not get Token Balance for token ${token}`;
      //     }
      //     return {
      //       amount: new BigNumber(balance.amount),
      //       poolpair: `${token}-DUSD`
      //     };
      //   })
      const liquidityToAdd = dTokenLoans.map((loan) => {
        return { amount: loan.amount, poolpair: `${loan.token}-DUSD` };
      });
      try {
        const liquidityWrkr = new LiquidityMiningWorker(this.wallet);
        const txs = await liquidityWrkr.addLiquidity(
          liquidityToAdd,
          loanTxPrevOut
        );
        logDebug(
          `addLiquidity in transactions ${txs.map((tx) => tx.txId).join(', ')}`
        );
        const prevout =
          txs.length > 1
            ? Transaction.prevOutFromTx(txs[txs.length - 1])
            : undefined;
        return {
          isSuccess: true,
          hasTxSent: true,
          prevout
        };
      } catch (e) {
        logErrorTelegram(`There was an error adding Liquidity: ${e}`);
        return {
          isSuccess: false,
          hasTxSent: true
        };
      }
    };

    const decreaseVaultRatioAction = new Action({
      name: 'addLiquidity',
      inputParameters: [],
      runFunction: decreaseVaultRatio
    });

    return new ActionSet({
      name: 'DecreaseVaultRatio',
      finishMessage: `Wow! My spell invested more 💰. You will earn more rewards once the transaction went through!`,
      actions: [decreaseVaultRatioAction],
      walletData: {
        client: this.client,
        vaultId: this.vaultId
      }
    });
  }

  public getIncreaseVaultRatioActionSet(
    poolpairs: { [key: string]: number },
    targetRatio: number
  ): ActionSet {
    const increaseVaultRatio = async () => {
      const vault = await Vault.build(this.client, this.vaultId);

      //get Amounts
      const amounts = await this.wallet.getNeededRepay(
        poolpairs,
        targetRatio,
        this.vaultId
      );

      // if amounts are empty don't continue processing
      if (amounts.length == 0) {
        logErrorTelegram(
          'There was an issue getting the required token amount to repay!'
        );
        return {
          isSuccess: false,
          hasTxSent: false
        };
      }

      //remove Liquidity
      let removeLiquidityPrevouts: PreviousOuts = undefined;
      try {
        const LMWrkr = new LiquidityMiningWorker(this.wallet);
        const tx = await LMWrkr.removeLiquidity(amounts);

        // we only need the last Prevout
        if (tx.length === 0) {
          throw 'Did not receive any TX Info ';
        }

        sendVaultRatioToTelegram(vault, targetRatio);

        logDebug(
          `-> Remove Liquidity posted in Transactions ${tx
            .map((t) => t.txId)
            .join(', ')}`
        );

        removeLiquidityPrevouts = Transaction.prevOutFromTx(tx[tx.length - 1]);
      } catch (e) {
        logWarn(`There was an error removing Liquidity: ${e}`);

        let finishMessage = `There is currently not enough liquidity available to reach your vault ratio setting. Please check your account manually.`;
        if (
          Math.min(
            vault.getCurrentCollateralRatio().toNumber(),
            vault.getNextCollateralRatio().toNumber()
          ) >
          vault.getVaultLoanSchemePercentage() +
            ConstantValues.additionalVaultRatioSafety
        ) {
          logWarn(
            `Currently the configured vault ratio can't be reached. There is not enough liquidity available. As we are save we don't send any notification.`
          );
          // do not send a telegram report
          finishMessage = `n/a`;
        }

        return {
          finishMessage: finishMessage,
          isSuccess: true,
          hasTxSent: false
        };
      }
      // TODO: Add functionality to use all available Tokens (comission rewards), instead of only calculated amount
      // const dTokenBalances = await Promise.all(
      //   Object.keys(poolpairs).map(async (token) => {
      //     const balance = await this.wallet.getTokenBalance(token);
      //     if (balance === undefined) {
      //       throw `Could not get Token Balance for token ${token}`;
      //     }
      //     return { token, amount: new BigNumber(balance.amount) };
      //   })
      // ); // Get Token Balances
      // const dDUSDBalance = await this.wallet.getTokenBalance('DUSD');
      // if (dDUSDBalance === undefined) {
      //   throw 'Could not get Balance for DUSD';
      // }

      try {
        // Getting Expected dTokens we receive from removeLiquidity
        const expectedDTokens = await this.wallet.getExpectedTokensFromLMToken(
          amounts,
          vault
        );
        const loanWrkr = new LoanWorker(this.wallet, this.vaultId);

        // let loopPrevout = removeLiquidityPrevouts;

        // for (const dToken of expectedDTokens) {
        //   const tx = await loanWrkr.paybackLoan([dToken], loopPrevout);
        //   logDebug(
        //     ` -> Payback loan (${dToken.token}) posted in transaction: ${tx.txId}`
        //   );
        //   loopPrevout = Transaction.prevOutFromTx(tx);
        // }

        const tx = await loanWrkr.paybackLoan(
          expectedDTokens,
          removeLiquidityPrevouts
        );
        logDebug(` -> Payback loan posted in transaction: ${tx.txId}`);

        return {
          isSuccess: true,
          hasTxSent: true,
          prevout: Transaction.prevOutFromTx(tx)
        };
      } catch (e) {
        logErrorTelegram(`There was a problem paying back loans: ${e}`);
        return {
          isSuccess: false,
          hasTxSent: true
        };
      }
    };

    const increaseVaultRatioAction = new Action({
      name: 'paybackLoan',
      inputParameters: [],
      runFunction: increaseVaultRatio
    });

    return new ActionSet({
      name: 'IncreaseVaultRatio',
      finishMessage: `☝️ The spell was successful and payed back some loans to keep your minimum and maximum ratio. Your vault is safe!`,
      actions: [increaseVaultRatioAction],
      walletData: {
        client: this.client,
        vaultId: this.vaultId
      }
    });
  }
}
