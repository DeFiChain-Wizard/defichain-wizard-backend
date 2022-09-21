import { WhaleApiClientOptions } from '@defichain/whale-api-client';
import { WhaleWalletAccount } from '@defichain/whale-api-wallet';
import { JellyfishWallet, WalletHdNode } from '@defichain/jellyfish-wallet';
import { BigNumber } from '@defichain/jellyfish-api-core';
import { CustomMessage } from '@defichainwizard/custom-transactions';
import { Prevout } from '@defichain/jellyfish-transaction-builder/dist/provider';
import { LoanVaultState } from '@defichain/whale-api-client/dist/api/loan';
import { Version } from '@defichainwizard/custom-transactions/dist/transactions/version';
import { Telegram } from '@defichainwizard/custom-logging';
/**
 * When using the Desktop wallet, an account is needed in order to get the address. Jellyfish can get the account via wallet.
 *
 * Both wallets can be returned by the WalletProvider. Therefore an interface is needed.
 *
 * Therefore `account` is optional.
 */
export interface Wallet {
  wallet: JellyfishWallet<WhaleWalletAccount, WalletHdNode>;
  account?: WhaleWalletAccount;
}

/**
 *  The interface for the general bot configuration
 */
export interface DfiVaultBotConfig {
  bot: GeneralBotConfig;
  dfichain: WhaleApiClientOptions;
  telegram: Telegram;
}

/**
 *  The interface for the basic bot configuration.
 */
export interface GeneralBotConfig {
  name: string;
  address: string;
}

/**
 *  We type, which Tokens we can use as Collateral here.
 */
export type CollateralToken = 'DFI' | 'DUSD' | 'BTC' | 'ETH' | 'USDC' | 'USDT';

/**
 *  Interface that is used to reference liquidity Tokens
 */
export interface LiquidityPoolPairAmount {
  amount: BigNumber;
  poolpair: string;
}

/**
 *  Interface that is used to add Liquidity
 */
export interface AddLiquidityAmount {
  poolpair: string;
  amount: BigNumber;
  isDUSD?: boolean;
}

/**
 *  Interface that is used to specify Token and amount of Loans to take
 */
export interface LoanAmount {
  token: string;
  amount: BigNumber;
}

/**
 *  Interface that bundles the Config and the blockTime it was received
 * TODO: This might be moved to custom-transaction-library
 */
export interface DecryptedConfig {
  blockTime: number;
  config: CustomMessage | Version;
}
/**
 *  The builtin LoanVaultState does not have READY and EMPTY which we know from LW and DefiScan, so we enhance it.
 */
enum ExtendedVaultStates {
  READY = 'READY',
  EMPTY = 'EMPTY'
}

// This is a trick to actually extend an existing enum: https://stackoverflow.com/a/71255520
export type VaultState = LoanVaultState | ExtendedVaultStates;
export const VaultState = { ...LoanVaultState, ...ExtendedVaultStates };

/**
 *  Type to bundle prevout we need for sending transactions
 */
export type PreviousOuts = Prevout | Prevout[] | undefined;

export enum ConstantValues {
  minimumUTXOAmount = 0.1,
  additionalVaultRatioSafety = 100, // this has to be reached by paying back all LM Tokens to pass the safety check
  initialLastConfigBlock = 2010000, // Initially it will be 2010000 (round July 2022, before DeFiChain Wizard was released) and will change once we found the first block that contained a config
  dUSDCollateralIncreaseBlock = 2257500, // FCE Update brings 120% dUSD Collateral Value
  dUSDCollateralValueFCE = 1.2
}
export interface ActionReturn {
  hasTxSent: boolean;
  prevout?: PreviousOuts;
  isSuccess: boolean;
  finishMessage?: string;
}
