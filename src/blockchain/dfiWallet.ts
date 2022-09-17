import { WalletProvider } from '../utils/walletprovider';
import { LiquidityPoolPairAmount, LoanAmount, Wallet } from '../interfaces';
import { WhaleWalletAccount } from '@defichain/whale-api-wallet';
import { JellyfishWallet, WalletHdNode } from '@defichain/jellyfish-wallet';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { AddressToken } from '@defichain/whale-api-client/dist/api/address';
import { getDFINetwork, getSEEDFromEnv } from '../config/configuration';
import { WhaleApiClient } from '@defichain/whale-api-client';
import { Vault } from './vault';
import { PoolPairData } from '@defichain/whale-api-client/dist/api/poolpairs';
import { TokenData } from '@defichain/whale-api-client/dist/api/tokens';
import {
  ScriptBalances,
  CTransactionSegWit
} from '@defichain/jellyfish-transaction';
import { Prevout } from '@defichain/jellyfish-transaction-builder/dist/provider';
import { ActivePrice } from '@defichain/whale-api-client/dist/api/prices';
import { Transaction } from '@defichainwizard/custom-transactions';
import { logDebug, logInfo } from '@defichainwizard/custom-logging';
import { logErrorTelegram } from '../utils/helpers';

/**
 * The DFI Wallet that offers all operations on the wallet. It can return certain information about the desired wallet.
 */
class DFIWallet {
  private readonly client: WhaleApiClient;
  private readonly walletProvider: WalletProvider;
  private readonly wallet: Wallet;

  private constructor() {
    try {
      logInfo('Initializing wallet.');
      this.walletProvider = new WalletProvider();
      this.client = this.walletProvider.getClient();
      this.wallet = new WalletProvider().getWallet(getSEEDFromEnv());
      logInfo('Wallet successfully initialized!');
    } catch (e) {
      logErrorTelegram('Wallet initialization failed!');
      throw e;
    }
  }

  /**
   * Creates a new Instance of DFIWallet.
   *
   * @param walletAddress The address to check
   * @returns The DFIWallet object
   */
  public static async build(walletAddress: string): Promise<DFIWallet> {
    const wallet = new DFIWallet();
    await wallet.setAccount(walletAddress);
    return wallet;
  }
  /**
   * Sets the account for a certain wallet address, this is required init the DFI Wallet object
   *
   * @param walletAddress The address to check
   * @returns void
   */
  private async setAccount(walletAddress: string): Promise<void> {
    logDebug(`Trying to fetch wallet address: ${walletAddress}`);
    const DFIwallet = this.wallet.wallet as JellyfishWallet<
      WhaleWalletAccount,
      WalletHdNode
    >;

    const accounts = await DFIwallet.discover();
    if (accounts.length === 0) {
      throw new Error(
        'No accounts found for the given account. Please check your seed phrase or make sure you have at least one transaction in that wallet.'
      );
    }
    // this.wallet.account = undefined;
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const address = await account.getAddress();
      logDebug(`Checking address: ${address}`);
      if (address === walletAddress) {
        logDebug(`Address detected!`);
        this.wallet.account = account;
        break;
      }
    }
    if (!this.wallet.account) {
      throw new Error(
        `Your given address (${walletAddress}) was not found on the wallet. Please check your config.`
      );
    }
  }

  /**
   * Returns the account for this wallet object.
   *
   * @returns The account object for this wallet.
   */
  getAccount(): WhaleWalletAccount {
    if (!this.wallet.account) {
      throw 'Account is not set, this should not happen.';
    }
    return this.wallet.account;
  }

  /**
   * Returns the client for this wallet object.
   * @returns The client object for this wallet.
   */
  getClient(): WhaleApiClient {
    return this.client;
  }

  /**
   * Returns the address of wallet.
   * @returns The address of this wallet.
   */
  async getAddress(): Promise<string> {
    return (await this.wallet.account?.getAddress()) ?? '';
  }

  /**
   * Returns the current balance of a wallet.
   * @returns A map containing the list of tokens available in the wallet.
   */
  async getUTXOBalance(): Promise<BigNumber> {
    return new BigNumber(
      await this.client.address.getBalance(await this.getAddress())
    );
  }

  /**
   * Returns a list of all tokens in the wallet.
   * @returns A map containing the list of tokens available in the wallet.
   */
  async getTokenBalance(
    symbol?: string
  ): Promise<AddressToken | Map<string, AddressToken> | undefined> {
    const address = await this.getAddress();
    const tokens = await this.client.address.listToken(address, 100);

    // if a symbol was provided return just this one
    if (symbol) {
      return tokens.find(
        (token) => token.isDAT && token.symbol === symbol
      ) as AddressToken;
    }
    return new Map(tokens.map((token) => [token.symbol, token])) as Map<
      string,
      AddressToken
    >;
  }

  /**
   * Returns a given pool pair by symbol name.
   *
   * @param poolSymbol The symbol of the pool that should be returned.
   * @returns The pool pair data or undefined if nothing was found.
   */
  async getPoolPairBySymbol(
    poolSymbol: string
  ): Promise<PoolPairData | undefined> {
    return (await this.client.poolpairs.list(1000)).find((pool) => {
      return pool.symbol === poolSymbol;
    });
  }

  /**
   * Returns a given pool pair by id.
   *
   * @param poolId The ID of the pool that should be returned.
   * @returns The pool pair data or undefined if nothing was found.
   */
  async getPoolPairByID(poolId: string): Promise<PoolPairData | undefined> {
    return (await this.client.poolpairs.list(1000)).find((pool) => {
      return pool.id === poolId;
    });
  }
  /**
   * Returns the pool pair data for a given pool pair.
   *
   * @param tokenSymbolA The first token of the pool
   * @param tokenSymbolB The second token of the pool
   * @returns The PoolPairData for this pool
   */
  async getPoolPairByToken(
    tokenSymbolA: string,
    tokenSymbolB: string
  ): Promise<PoolPairData | undefined> {
    return (await this.client.poolpairs.list(1000)).find((pool) => {
      return (
        pool.symbol === `${tokenSymbolA}-${tokenSymbolB}` ||
        pool.symbol === `${tokenSymbolB}-${tokenSymbolA}`
      );
    });
  }

  /**
   * Returns some information about a certain token.
   * @param token The token to get the info for.
   * @returns The info for the requested token.
   */
  async getToken(tokenToSearch: string): Promise<TokenData | undefined> {
    return (await this.client.tokens.list(999)).find(
      (t) => t.symbolKey == tokenToSearch
    );
  }

  /**
   * Calculates the loan amount to take in order to reach the desired target collateral ratio in the vault
   *
   * @param pairs map of dTokens with dToken as key and the relative share to go into LM.
   * @param targetRatio the desired ratio used to calculate the loan Amount
   * @param vaultAddress The address of the vault to base the calculation on. This Vault has to be owned by the wallet this method is called on.
   * @param dTokenOnly NOT IMPLEMENTED YET!!! Flag to calculate the loan amount if only taking dToken loan (no DUSD)
   * @returns Loans to take
   */
  public async getLoanAmount(
    pairs: { [key: string]: number },
    targetRatio: number,
    vaultAddress: string
  ) {
    const ratioDivider = targetRatio / 100;
    const vault = await this.getVault(vaultAddress);

    // calculate next loan value and next collateral value
    const nextLoanValue = vault.getNextLoanValue();
    const nextCollateralValue = vault.getNextCollateralValue();

    // take minimum from next or current collateral value
    const totalLoanToTake = BigNumber.min(
      new BigNumber(vault.loanVault.collateralValue)
        .div(ratioDivider)
        .minus(vault.loanVault.loanValue),
      new BigNumber(nextCollateralValue).div(ratioDivider).minus(nextLoanValue)
    ).decimalPlaces(6, BigNumber.ROUND_FLOOR);

    logDebug(
      `Take curr collateral: ${new BigNumber(vault.loanVault.collateralValue)
        .div(ratioDivider)
        .minus(vault.loanVault.loanValue)}`
    );

    logDebug(
      `Take next collateral: ${new BigNumber(nextCollateralValue)
        .div(ratioDivider)
        .minus(nextLoanValue)}`
    );

    logDebug(` -> Total loans to take are: ${totalLoanToTake} dUSD`);

    // calculate total of shares in poolpairs
    const totalShares = Object.values(pairs).reduce(
      (sum, share) => sum + share,
      0
    );

    logDebug(`Total shares: ${totalShares}`);

    return await Promise.all(
      Object.keys(pairs).map(async (token) => {
        const loanToTake = totalLoanToTake
          .dividedBy(totalShares)
          .multipliedBy(pairs[token]);

        const liquidityPool = await this.getPoolPairBySymbol(`${token}-DUSD`);
        if (!liquidityPool) {
          logErrorTelegram(
            `There was an error getting the pool data for token ${token}`
          );
          throw `There was an error getting the pool data for token ${token}`;
        }
        // we need to get the tokenRatio from the LiquidityPool
        const oraclePrice = await this.getOraclePriceFeed(token);
        if (!oraclePrice || !oraclePrice.active) {
          logErrorTelegram(
            `There was an error getting the Oracle Data for token ${token}`
          );
          throw `There was an error getting the pool data for token ${token}`;
        }

        logDebug(`Oracle Price: ${oraclePrice.active.amount}`);

        const priceRatio = new BigNumber(liquidityPool.priceRatio.ab);

        logDebug(`Price Ratio: ${priceRatio}`);

        const amountDUSD = loanToTake.div(
          priceRatio
            .multipliedBy(new BigNumber(oraclePrice.active.amount))
            .plus(1)
        );

        const amountdToken = priceRatio.multipliedBy(amountDUSD);

        return { token, DUSD: amountDUSD, dToken: amountdToken };
        // HOW WE GOT TO THIS FORMULA
        // 1@DUSD - 0.00153835@dTSLA
        // loantoTake = amountDUSD * 1 + amountTSLA * oracleTSLA#
        // amountTSLA = ratioDEXTSLA * amountDUSD;
        // loantoTake = amountDUSD + (ratioDEXTSLA * amountDUSD) * oracleTSLA
        // x = a + (b * a) * c
        // a = x / ( b*c +1)
        // amountDUSD = loantoTake / (ratioDEXTSLA * oracleTSLA +1)
        // EXAMPLE FOR COINBASE
        //              100 / (0.02043813 * 51.19 + 1)
        //              100 /     (2,04622787) = 48,87041246
        //amountCOIN =  48,87041246 * 0,02043813 == 0,99881984
        // EXAMPLE FOR VOO
        // amountDUSD = 100 / (0,00286079 * 337.94 +1) = 50,84464723
        // amountVOO = 50,84464723 * 0,00286079 = 0,14545586
      })
    );
  }

  /**
   * Calculates the amount of LM tokens we need to remove & repay loan to reach the desired target collateral ratio in the Vault
   *
   * @param pairs map of dTokens with dToken as key and the relative share to go into LM.
   * @param targetRatio the desired ratio used to calculate the loan Amount
   * @param vaultAddress The address of the vault to base the calculation on. This Vault has to be owned by the wallet this method is called on.
   * @returns list of LiquidityPoolPairAmounts - dTokens to remove from LM
   */
  public async getNeededRepay(
    pairs: { [key: string]: number },
    targetRatio: number,
    vaultAddress: string
  ): Promise<LiquidityPoolPairAmount[]> {
    const ratioDivider = targetRatio / 100;

    const vault = await this.getVault(vaultAddress);
    const nextLoanValue = vault.getNextLoanValue();
    const nextCollateralValue = vault.getNextCollateralValue();
    const totalRequiredPayback = BigNumber.max(
      new BigNumber(vault.loanVault.loanValue).minus(
        new BigNumber(vault.loanVault.collateralValue).dividedBy(ratioDivider)
      ),
      nextLoanValue.minus(nextCollateralValue.div(ratioDivider))
    ).decimalPlaces(6, BigNumber.ROUND_FLOOR);

    logDebug(`Total required Payback: ${totalRequiredPayback}`);

    // calculate total of shares in poolpairs
    const totalShares = Object.values(pairs).reduce(
      (sum, share) => sum + share,
      0
    );

    // calc required payback tokens per poolpair
    return await Promise.all(
      Object.keys(pairs).map(async (token) => {
        const liquidityPool = await this.getPoolPairBySymbol(`${token}-DUSD`);
        const requiredPayback = totalRequiredPayback
          .dividedBy(totalShares)
          .multipliedBy(pairs[token]); // required payback for this poolpair is the share it has on the total

        logDebug(`Required Payback: ${requiredPayback} ${token}-DUSD`);

        if (!liquidityPool) {
          logErrorTelegram(
            `Could not get the Liquidity Pool for ${token}-DUSD`
          );
          throw `Could not get the Liquidity Pool for ${token}-DUSD`;
        }

        if (new BigNumber(vault.loanVault.loanValue).eq(0)) {
          logDebug(`No loan exists`);
        } else {
          if (requiredPayback.lte(0)) {
            logErrorTelegram(
              `Oops, I cannot payback token ${token}, it looks like it was not part of a loan!

Please clean up your wallet manually! Your wallet should not contain any dTokens that are not part of a loan.

After the cleanup I can take over again. 🧙`
            );
            throw `For some reason the required payback is negative for token ${token}. Loan: ${vault.loanVault.loanValue} / ${nextLoanValue}`;
          }
        }

        const dTokenOracle = (await this.getOraclePriceFeed(token)).active
          ?.amount;

        if (!dTokenOracle) {
          throw `Could not get token oracle active price for token: ${token} `;
        }

        logDebug(`dToken Oracle: ${dTokenOracle}`);

        logDebug('--- Loan Amounts ---');
        vault.loanVault.loanAmounts.forEach((loanAmount) => {
          logDebug(`Loan: ${loanAmount.displaySymbol} (${loanAmount.amount})`);
        });

        const poolValue = BigNumber.sum(
          new BigNumber(dTokenOracle).multipliedBy(
            liquidityPool.tokenA.reserve
          ),
          liquidityPool.tokenB.reserve // This is DUSD so we need no oracle price
        );

        logDebug(`Pool Value: ${poolValue}`);

        const pricePerToken = poolValue.div(liquidityPool.totalLiquidity.token);
        logDebug(`Price per Token: ${pricePerToken}`);

        let requiredTokens = requiredPayback.div(pricePerToken);
        logDebug(`Required Tokens:  ${requiredTokens}`);

        // retrieve currently available tokens in pool
        let availableTokensAmout = new BigNumber(0);
        const availableTokens = (await this.getTokenBalance(
          `${token}-DUSD`
        )) as AddressToken;

        if (availableTokens) {
          availableTokensAmout = new BigNumber(availableTokens.amount);
        }
        logDebug(`Available Tokens: ${availableTokensAmout}`);

        if (availableTokensAmout.lt(requiredTokens)) {
          requiredTokens = availableTokensAmout;
        }

        logDebug(`Payback Tokens:   ${requiredTokens}`);

        return { amount: requiredTokens, poolpair: `${token}-DUSD` };
      })
    );
  }

  /**
   * Calculates the expected amounts of dToken and DUSD if when removing the given amount of LM-Tokens
   *
   * @param lmTokenAmounts NOT IMPLEMENTED YET!!! Flag to calculate the LM Token amount if only taking dToken loan (no DUSD)
   * @returns list of LoanAmounts - expeted amount of dToken and DUSD when removing Liquidity
   */
  public async getExpectedTokensFromLMToken(
    lmTokenAmounts: LiquidityPoolPairAmount[],
    vault: Vault
  ): Promise<LoanAmount[]> {
    // get DUSD Loan Amounts

    let maxDUSDPayback = new BigNumber(0);
    vault.loanVault.loanAmounts.forEach((loanAmount) => {
      if (loanAmount.symbol == 'DUSD') {
        maxDUSDPayback = new BigNumber(loanAmount.amount);
      }
    });

    let interestDUSD = new BigNumber(0);
    vault.loanVault.interestAmounts.forEach((interestAmount) => {
      if (interestAmount.symbol == 'DUSD') {
        interestDUSD = new BigNumber(interestAmount.amount);
      }
    });

    logDebug(`Interest DUSD: ${interestDUSD}`);

    if (maxDUSDPayback.gt(0)) {
      logDebug(`PAYBACK MaxLoan in DUSD: ${maxDUSDPayback}`);
    } else {
      logDebug(`Couldn't find DUSD loan!`);
    }

    const retAmount: LoanAmount[] = [];
    let dUSDAmount = new BigNumber(0);
    for (const amount of lmTokenAmounts) {
      const poolpair = await this.getPoolPairBySymbol(amount.poolpair);
      if (!poolpair) {
        throw `There was an error getting the poolpair ${amount.poolpair}`;
      }
      const poolShare = amount.amount.div(poolpair.totalLiquidity.token);

      logDebug(`PoolShare: ${poolShare} (Pool: ${poolpair.displaySymbol})`);
      const dTokenInfo =
        poolpair.tokenA.symbol === 'DUSD' ? poolpair.tokenB : poolpair.tokenA;

      logDebug(
        `dToken: ${dTokenInfo.displaySymbol} (ID: ${dTokenInfo.id}) -> Reserve: ${dTokenInfo.reserve}`
      );

      const dUSDInfo =
        poolpair.tokenA.symbol === 'DUSD' ? poolpair.tokenA : poolpair.tokenB;

      logDebug(
        `dToken: ${dUSDInfo.displaySymbol} (ID: ${dUSDInfo.id}) -> Reserve: ${dUSDInfo.reserve}`
      );

      const expectedDTokens = poolShare.multipliedBy(dTokenInfo.reserve);

      logDebug(
        `Expected dTokens: ${dTokenInfo.displaySymbol} (${expectedDTokens})`
      );

      // sum up dUSD amounts in order to have only one dUSD payback loan
      dUSDAmount = dUSDAmount.plus(poolShare.multipliedBy(dUSDInfo.reserve));
      retAmount.push({
        amount: expectedDTokens,
        token: dTokenInfo.symbol
      });
    }

    let expectedDUSD = dUSDAmount.decimalPlaces(6, BigNumber.ROUND_FLOOR);
    logDebug(`Expected dUSD Payback: (${expectedDUSD})`);

    // Check on negative interest
    if (interestDUSD < new BigNumber(0)) {
      logDebug(
        `Detected negative interest: MaxLoan - Interest = ${maxDUSDPayback.plus(
          interestDUSD
        )}`
      );

      // if negative interest and expected payback is larger than loan -> limit the payback
      if (expectedDUSD > maxDUSDPayback.plus(interestDUSD)) {
        logDebug(
          `Detected overpayment for dUSD loan -> limiting payback to maxPayBack: ${maxDUSDPayback.plus(
            interestDUSD
          )}`
        );

        // only payback maximum of loan
        expectedDUSD = maxDUSDPayback.plus(interestDUSD);
      } else {
        // reduce payback by negative interest
        expectedDUSD = expectedDUSD.plus(interestDUSD);
      }
    }

    logDebug(`dUSD Payback: (${expectedDUSD})`);

    retAmount.push({ amount: expectedDUSD, token: 'DUSD' });
    return retAmount;
  }
  /**
   * Convert UTXO DFI into Token DFI
   * @param amount THe amount of UTXOs to convert
   * @param prevout prevOut Object from a aprevious transaction
   * @param address THe Address you want to convert the UTXOS from
   * @returns Transaction
   */

  //TODO: Move this to some worker
  async utxoToOwnAccount(
    amount: BigNumber,
    prevout: Prevout | undefined = undefined
  ): Promise<CTransactionSegWit> {
    const account = this.getAccount();
    if (!account) {
      throw 'Could not get Account';
    }
    const script = await account.getScript();
    const balances: ScriptBalances[] = [
      { script: script, balances: [{ token: 0, amount: amount }] }
    ]; //DFI has tokenId 0
    const txn = await account.withTransactionBuilder().account.utxosToAccount(
      {
        to: balances
      },
      script
    );

    const transaction = new Transaction({
      client: this.client,
      account: account,
      network: getDFINetwork(),
      passphrase: getSEEDFromEnv()
    });

    return transaction.sendTransactionWithPrevout(txn, prevout);
  }

  /**
   * Returns a vault object for a given vault address.
   *
   * @param address The address of a given vault
   * @returns
   */
  async getVault(address: string): Promise<Vault> {
    return await Vault.build(this.client, address);
  }

  /**
   * Returns the Oracle price feed.
   * @param token The token to get the feed for
   * @returns The Oracle price feed for a given token.
   */
  async getOraclePriceFeed(token: string): Promise<ActivePrice> {
    const feed = await this.client.prices.getFeedActive(token, 'USD', 1);
    return feed[0];
  }
}

export { DFIWallet };
