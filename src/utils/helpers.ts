import {
  logDebug,
  logTelegram,
  logWalletInfo,
  logWarn
} from '@defichainwizard/custom-logging';
import { logError } from '@defichainwizard/custom-logging';
import { WalletInfo } from '@defichainwizard/custom-logging/dist/wallet';
import { DFIWallet, Vault } from '../blockchain';
import { getConfig, getTelegram } from '../config/configuration';

/**
 * Prepares an object to be sent to the logger for printing out some wallet information.
 * @param wallet the wallet to get the data from
 */
const printWalletInfo = async (wallet: DFIWallet): Promise<void> => {
  const walletInfo: WalletInfo = {
    Address: await wallet.getAddress(),
    UTXO: (await wallet.getUTXOBalance()).toNumber(),
    TokenBalance: await wallet.getTokenBalance(),
    Blockheight: (await wallet.getClient().stats.get()).count.blocks
  };
  logWalletInfo(walletInfo);
};

/**
 * Prints out the current config as debug log.
 */
const printConfig = (): void => {
  logDebug('Current bot configuration:');
  logDebug(getConfig());
};

/**
 * Sends a message to Telegram.
 *
 * Use this for manually sending a message.
 *
 * @param message the message to send to telegram
 */
const sendMessageToTelegram = (message: string): void => {
  logTelegram(getTelegram(), message);
};

/**
 * Send current vault ratio to Telegram.
 *
 * @param vault the message to send to telegram
 */
const sendVaultRatioToTelegram = (vault: Vault, targetRatio: number): void => {
  // check the values of the vault. If they don't make sense, send another message.
  const currentRatio = vault.getCurrentCollateralRatio().toNumber();
  const nextRatio = vault.getNextCollateralRatio().toNumber();

  sendMessageToTelegram(
    currentRatio > 0
      ? `Your current vault ratio has changed:

Current: ${currentRatio.toFixed(2)}%
Next: ${nextRatio.toFixed(2)}%

Your target ratio should be: ${targetRatio}%.

I will cast a spell now to put things into order again! Abracadabra! 🪄`
      : `There is no vault ratio yet. that means that you don't have a loan yet.
      
Let me see if I can do some magic here! 🪄`
  );
};

/**
 * Logs an error and sends message to Telegram.
 */
const logErrorTelegram = (
  ...message: Array<object | number | string>
): void => {
  logError(message);
  const telegram = getTelegram();
  // send message to, if enabled and if passed parameters are a string
  if (telegram && message.length > 0 && typeof message[0] === 'string') {
    sendMessageToTelegram(
      `⚠️ ${message[0]}
      
Please send me your logs via Telegram or Discord, so my developers can analyze it! 🧙`
    );
  } else {
    logWarn(
      'Could not send the given message to Telegram as either Telegram was not set up correctly or the passed message was no text.',
      message
    );
  }
};

/**
 * Returns the first 4 characters and the last 4 characters of a string.
 * Can be used to make Adresses and VaultIDs more readable
 *
 * @param value String that should be shortened
 * @returns shortend string "abcdefghijklmnopqrstuvwxyz" -> "abcd...xyz"
 */
const shortID = (value: string): string => {
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
};

/**
 * Checks if a certain String is null or empty
 *
 * @param value the text to be checked
 * @returns true or false
 */
const isStringNullOrEmpty = (value: string): boolean => {
  return value === undefined || value.length === 0;
};

/**
 * Small helper Function to exit the application
 *
 * @returns nothing
 */
const exitApp = () => {
  logError('Will exit application now...');
  process.exit(1);
};

/**
 * Get´s Env var by key with default value. exiting app if no default and unset
 *
 * @param key the env key to be fetched
 * @param _default Default value in case the key is not set, if empty key is mandatory
 * @returns value of the environment key or default
 */
const getEnv = (
  key: string,
  _default: string | undefined = undefined
): string => {
  const env = process.env[key] ?? _default;
  // If we have no default, it is mandatory
  if (!env) {
    logError(
      `Setting Environment Variable ${key} is not set but is mandatory! Please refer to the README to see which ones you need: https://github.com/DeFiChain-Wizard/defichain-wizard-backend/blob/main/README.md`
    );
    return exitApp(); // We have to return here, because TS wants every codepath to return something..
  } else {
    return env;
  }
};

/**
 * Helper to asynchronously get a value back with try/catch: This helps not to have to try/catch everything, and getting problems with const assignments.
 *
 * @param getter which returns something asynchronously
 * @returns Promise of an object, that reflects success/error and contains the result (on success) or error (on failure)
 */
async function tryGetAsync<T>(getter: () => Promise<T>): Promise<
  | {
      success: true;
      result: T;
    }
  | {
      success: false;
      error: Error;
    }
> {
  try {
    return {
      success: true,
      result: await getter()
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error
    };
  }
}

/**
 * Helper to synchronously get a value back with try catch: This helps not to have to try/catch everything, and getting problems with const assignments
 *
 * @param function, which returns sth. sync
 * @returns object, that reflects success/error and contains the result (on success) or error (on failure)
 */
function tryGet<T>(getter: () => T):
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      error: Error;
    } {
  try {
    return {
      success: true,
      value: getter()
    };
  } catch (error) {
    return {
      success: false,
      error: error as Error
    };
  }
}

export {
  getEnv,
  sendMessageToTelegram,
  tryGet,
  tryGetAsync,
  exitApp,
  isStringNullOrEmpty,
  logErrorTelegram,
  printConfig,
  printWalletInfo,
  sendVaultRatioToTelegram,
  shortID
};
