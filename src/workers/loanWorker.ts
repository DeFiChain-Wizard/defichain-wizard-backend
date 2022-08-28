import { DFIWallet } from '../blockchain/dfiWallet';
import { getWalletAddress } from '../config/configuration';
import { LoanAmount, PreviousOuts } from '../interfaces';
import {
  CTransactionSegWit,
  TokenBalanceUInt32
} from '@defichain/jellyfish-transaction';
import { BaseWorker } from './baseWorker';
import { logDebug, logInfo } from '@defichainwizard/custom-logging';
import { logErrorTelegram } from '../utils';
/**
 * This strategy can take or payback loans.
 */
export class LoanWorker extends BaseWorker {
  private vaultAddress: string;
  constructor(
    wallet: DFIWallet,
    vaultAddress: string,
    walletAddress: string = getWalletAddress()
  ) {
    super(wallet, walletAddress);
    this.vaultAddress = vaultAddress;
  }

  private getLoanAmounts(amounts: LoanAmount[]): Promise<TokenBalanceUInt32[]> {
    logDebug('Getting Token Ids');
    return Promise.all(
      amounts.map(async (amount) => {
        const tokenInfo = await this.wallet.getToken(amount.token);
        if (!tokenInfo || !tokenInfo.id) {
          logErrorTelegram(`Could not get token Id for Token ${amount.token}`);
          // return {};
          //TODO What to do in this case?
        }
        return { token: parseInt(tokenInfo?.id ?? '0'), amount: amount.amount }; // TODO THIS nullish coallescion should not stay here
      })
    );
  }
  public async paybackLoan(
    amounts: LoanAmount[],
    prevout?: PreviousOuts
  ): Promise<CTransactionSegWit> {
    logInfo('Payback loan...');
    amounts.forEach((amount) =>
      logDebug(`Will Payback ${amount.amount} of ${amount.token}`)
    );
    //TODO: Check if our balance is enough for payback
    const loanAmounts = await this.getLoanAmounts(amounts);
    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();

    const loans2Payback = loanAmounts.map((amount) => {
      return {
        dToken: amount.token, // What is this? is this to be able to payback dusd loan with dfi?
        amounts: [amount]
      };
    });
    const txn = await transactionBuilder.loans.paybackLoanV2(
      {
        vaultId: this.vaultAddress,
        from: script,
        loans: loans2Payback
      },
      script
    );
    return await this.transaction.sendTransactionWithPrevout(txn, prevout);
  }

  public async takeLoan(amounts: LoanAmount[], prevout?: PreviousOuts) {
    logInfo('Taking loan...');
    amounts.forEach((amount) =>
      logDebug(`Will Take Loan  ${amount.amount} of ${amount.token}`)
    );

    const loanAmounts = await this.getLoanAmounts(amounts);
    const script = await this.account.getScript();
    const transactionBuilder = this.account.withTransactionBuilder();
    const txn = await transactionBuilder.loans.takeLoan(
      {
        tokenAmounts: loanAmounts,
        vaultId: this.vaultAddress,
        to: script
      },
      script
    );
    return await this.transaction.sendTransactionWithPrevout(txn, prevout);
  }
}
