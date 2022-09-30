import { WhaleApiClient } from '@defichain/whale-api-client';
import { logDebug } from '@defichainwizard/custom-logging';
import { BlockScanner } from '@defichainwizard/custom-transactions';
import { Vault } from '../../blockchain';
import { ActionReturn, PreviousOuts } from '../../interfaces';
import { logErrorTelegram, sendMessageToTelegram } from '../../utils/helpers';
import { Action } from './action';

interface WalletData {
  client: WhaleApiClient;
  vaultId: string;
  blockScanner: BlockScanner;
}
/**
 * The base class for an action set.
 */
export class ActionSet {
  private name: string;
  private finishMessage: string;
  private actions: Action[];
  private walletData: WalletData;

  constructor(props: {
    name: string;
    finishMessage: string;
    actions: Action[];
    walletData: WalletData;
  }) {
    this.name = props.name;
    this.finishMessage = props.finishMessage;
    this.actions = props.actions;
    this.walletData = props.walletData;
  }

  getVaultRatios = async () => {
    const vault = await Vault.build(
      this.walletData.client,
      this.walletData.vaultId,
      this.walletData.blockScanner
    );
    return {
      next: (await vault.getNextCollateralRatio()).toNumber().toFixed(2),
      current: vault.getCurrentCollateralRatio().toNumber().toFixed(2)
    };
  };

  /**
   * Runs the action set.
   */
  public async run(): Promise<ActionReturn> {
    logDebug(`Starting: ${this.name}`);
    let error = false;
    const actionReturns: ActionReturn[] = [];
    let prevout: PreviousOuts = undefined;
    let txID = '';
    let finishMessage = this.finishMessage;
    for (const act of this.actions) {
      try {
        const ret: ActionReturn = await act.run(prevout);
        //We send the prevout from the previous TX, if it has one, if not we send from the one before.
        prevout = ret.hasTxSent ? ret.prevout : prevout;
        txID = ret.txID ? ret.txID : '';

        actionReturns.push(ret);
        if (!ret.isSuccess) {
          error = true;
        }

        if (ret.finishMessage) {
          finishMessage = ret.finishMessage;
        }
      } catch (e) {
        error = true;
        logErrorTelegram(`Failed running action: ${e}`);
      }
    }
    //TODO: Do we need this error var? We have isSuccess now.
    //TODO: Should we stop the set, in case of error.
    if (!error) {
      // if finishMessage was overwriten by any action and the message only contains "n/a" -> don't send a Telegram message
      if (finishMessage !== 'n/a') {
        sendMessageToTelegram(finishMessage);
      }

      return {
        isSuccess: actionReturns.every((act) => act.isSuccess),
        hasTxSent: actionReturns.some((act) => act.hasTxSent),
        txID: txID,
        prevout: prevout
      };
    }
    return {
      isSuccess: false,
      hasTxSent: actionReturns.some((act) => act.hasTxSent),
      txID: txID,
      prevout
    };
  }
}
