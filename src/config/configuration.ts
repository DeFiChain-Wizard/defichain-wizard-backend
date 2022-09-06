/**
 * Configuration utility in order to provide some helper functions for some config settings.
 */

import { Network, MainNet, TestNet } from '@defichain/jellyfish-network';
import { DfiVaultBotConfig } from '../interfaces';
import {
  getEnv,
  isStringNullOrEmpty,
  logErrorTelegram,
  sendMessageToTelegram
} from '../utils/helpers';
import {
  CustomMessage,
  isCustomMessage,
  isVersionMessage
} from '@defichainwizard/custom-transactions';
import { Version } from '@defichainwizard/custom-transactions/dist/transactions/version';
import {
  logDebug,
  logInfo,
  logWarn,
  Telegram
} from '@defichainwizard/custom-logging';

// config data for running the bot
let configData: DfiVaultBotConfig;

// config data from the frontend
let botConfig: CustomMessage;

// version data to communicate from/to the frontend
let versionConfig: Version;

// prefix for the environment variables
const DEFAULT_ENV_PREFIX = 'WIZ';

// default bot name if no other name was set
const DEFAULT_BOT_NAME = 'DeFiChain Wizard';

const loadConfig = (): void => {
  logInfo('Loading Configuration...');
  configData = getConfigFromEnv();
};

/**
 * Reads all config data from the environment.
 * @returns the fully prepared config data object that contains all needed config data
 */
const getConfigFromEnv = (): DfiVaultBotConfig => {
  // just to check it before we start - should fail immediately if not set.
  getEnv(`${DEFAULT_ENV_PREFIX}_SEED_PHRASE`);
  return {
    bot: {
      name: getEnv(`${DEFAULT_ENV_PREFIX}_BOT_NAME`, 'Defichain Wizard'),
      address: getEnv(`${DEFAULT_ENV_PREFIX}_BOT_ADDRESS`)
    },
    dfichain: {
      url: getEnv(
        `${DEFAULT_ENV_PREFIX}_DFICHAIN_URL`,
        'https://ocean.defichain.com'
      ),
      timeout: parseInt(
        getEnv(`${DEFAULT_ENV_PREFIX}_DFICHAIN_TIMEOUT`, '60000')
      ),
      version: getEnv(`${DEFAULT_ENV_PREFIX}_DFICHAIN_VERSION`, 'v0'),
      network: getEnv(`${DEFAULT_ENV_PREFIX}_DFICHAIN_NETWORK`, 'mainnet') as
        | 'mainnet'
        | 'testnet'
        | 'regtest'
        | undefined
    },
    telegram: new Telegram({
      botname: getBotName(),
      botversion: getBotVersion(),
      token: getEnv(`${DEFAULT_ENV_PREFIX}_TELEGRAM_TOKEN`),
      chatid: getEnv(`${DEFAULT_ENV_PREFIX}_TELEGRAM_CHATID`)
    })
  };
};

/**
 * Returns the bot's configuration.
 *
 * @returns The bot's configuration
 */
const getConfig = () => {
  if (!configData) {
    loadConfig();
  }
  return configData;
};

/**
 * Returns the name of the bot from the config
 * @returns the name of the bot
 */
const getBotName = () => configData?.bot.name || DEFAULT_BOT_NAME;

/**
 * Returns the version of the bot from package.json
 * @returns the version of the bot
 */
const getBotVersion = (): string => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let botVersion = require('../../package.json').version;
  if (typeof botVersion === 'undefined') botVersion = 'n.a.';
  return botVersion;
};

/**
 * Returns the wallet address the bot is analyzing.
 * @returns the wallet address
 */
const getWalletAddress = () => configData?.bot.address;

/**
 * Returns the Telegram object for end user messaging.
 * @returns the Telegram config
 */
const getTelegram = () => configData?.telegram;

/**
 * Returns the defichain config of the bot from the config
 * @returns the defichain config of the bot
 */
const getDFIChainConfig = () => configData?.dfichain;

/**
 * Returns the network config of the bot from the config
 * @returns the network config of the bot
 */
const getDFINetwork = (): Network =>
  getDFIChainConfig()?.network === 'testnet' ? TestNet : MainNet;

/**
 * Returns the SEED information from the environment.
 *
 * @param prefix optional, by default it's already set
 * @returns The seed as 24 word string array
 */
const getSEEDFromEnv = (prefix = DEFAULT_ENV_PREFIX): string[] => {
  const envPhrase = getEnv(`${prefix}_SEED_PHRASE`);
  if (envPhrase && !isStringNullOrEmpty(envPhrase)) {
    return envPhrase.split(' ');
  } else {
    throw new Error(
      `SEED could not be extracted from environment variable. Please add it like this (separated by space): ${prefix}_SEED_PHRASE = car tree sleep ...`
    );
  }
};

/**
 * This will make sure that only one pool pair was accepted.
 *
 * If two poolpairs are provided, it will will take the first one and will set it to 100%.
 *
 * This will change in future releases where more than one pool pairs are available.
 *
 * @param message The custom message to check for the pool pairs.
 */
const checkConfig = (
  message: CustomMessage,
  vaultMinCollateralRatio: number
): CustomMessage => {
  logDebug('Checking config!');
  logDebug(message);
  // checking pool pairs
  if (Object.keys(message.poolpairs).length > 1) {
    logWarn(
      'Found more than one pool pair. Will strip it down to one! Multiple pool pairs will come in future versions.'
    );
  }

  const returnMessage = JSON.parse(JSON.stringify(message));

  // do this as long as we only support one pool pair - just remove it, once we can deal with 1+
  let count = 0;
  for (const key in message.poolpairs) {
    returnMessage.poolpairs[key] = 100;
    if (count > 0) delete returnMessage.poolpairs[key];
    count++;
  }

  // limit the minRatio to minimum of 151%
  if (message.rules.keepMinRatio < vaultMinCollateralRatio) {
    logWarn(
      `Your min ratio (${message.rules.keepMinRatio}) was below ${vaultMinCollateralRatio}, which is too low... we set it to ${vaultMinCollateralRatio}.`
    );

    // check the spread between min and max ratio - if too low, set it to 2
    const spread = message.rules.keepMaxRatio - message.rules.keepMinRatio;
    returnMessage.rules.keepMinRatio = vaultMinCollateralRatio;
    returnMessage.rules.keepMaxRatio =
      vaultMinCollateralRatio + (spread > 2 ? spread : 2);
    logWarn(
      `New min/max ratio: ${returnMessage.rules.keepMinRatio}/${returnMessage.rules.keepMaxRatio}.`
    );
  } else if (message.rules.keepMaxRatio < message.rules.keepMinRatio) {
    logWarn(
      `Your min ratio (${message.rules.keepMinRatio}) was larger than your max-ratio (${message.rules.keepMaxRatio}). Exchanged the values...`
    );
    returnMessage.rules.keepMaxRatio = message.rules.keepMinRatio;
    returnMessage.rules.keepMinRatio = message.rules.keepMaxRatio;
    logWarn(
      `New min/max ratio: ${returnMessage.rules.keepMinRatio}/${returnMessage.rules.keepMaxRatio}.`
    );
  } else if (message.rules.keepMaxRatio === message.rules.keepMinRatio) {
    logWarn('Your min and max ratio were the same. Added some spread of 2.');
    returnMessage.rules.keepMaxRatio = message.rules.keepMaxRatio + 2;
    logWarn(
      `New min/max ratio: ${returnMessage.rules.keepMinRatio}/${returnMessage.rules.keepMaxRatio}.`
    );
  }
  return returnMessage;
};

/**
 * Stores the bot config sent by the user.
 * @param config the config sent by the user
 */
const setBotConfig = (
  config: CustomMessage | Version,
  vaultMinCollateralRatio: number
) => {
  const customConfig = checkConfig(
    config as CustomMessage,
    vaultMinCollateralRatio
  );

  logDebug('Storing received bot configuration...');
  logDebug(customConfig);

  logDebug(`Current Poolpairs`);
  for (const key in customConfig.poolpairs) {
    logDebug(key, customConfig.poolpairs[key]);
  }

  // do not send configuration on telegram if pause is activated
  if (customConfig.pause === -1) {
    logDebug(
      `Currently the Bot is put to sleep and won't do anything. Pause = ${customConfig.pause}`
    );
  } else {
    sendMessageToTelegram(
      `I'm going to use *${customConfig.rules.keepMinRatio}%* as minimum and *${customConfig.rules.keepMaxRatio}%* as maximum ratio.

I'll make sure to keep your vault ratio in this range. 🪄

☝️ _Don't worry when your vault occasionaly has a higher ratio than your configured maximum ratio. I'm looking into the future and know when the ratio will drop within the next hour._`
    );

    sendMessageToTelegram(
      `*Here is your configured pool pair*:
   
${Object.keys(customConfig.poolpairs)
  .map((poolpair) => `${poolpair}-DUSD`)
  .join('\n')}`
    );
  }

  if (isCustomMessage(customConfig)) botConfig = customConfig;
  else if (isVersionMessage(config)) versionConfig = config;
};

/**
 * Returns the bot config.
 * @returns the bot config
 */
const getBotConfig = (
  sendMissingConfigInfoToTelegram?: boolean
): CustomMessage | undefined => {
  if (botConfig) return botConfig;
  // don't send it to the user via Telegram
  if (sendMissingConfigInfoToTelegram) {
    logErrorTelegram(
      'Your wizard tried to find a bot config, but did not find anything! Please use the DeFiChain Wizard app to configure your Wizard.'
    );
  }
  return undefined;
};

/**
 * Returns the version config.
 * @returns the version that has been stored
 */
const getVersionConfig = (): Version | undefined => {
  if (versionConfig) return versionConfig;
  logErrorTelegram(
    'Your wizard tried to find a version config, but did not find anything! Please use the DeFiChain Wizard app to configure your Wizard.'
  );
  return undefined;
};

export {
  loadConfig,
  getConfig,
  getTelegram,
  getBotName,
  getDFIChainConfig,
  getDFINetwork,
  getWalletAddress,
  getSEEDFromEnv,
  setBotConfig,
  getBotConfig,
  getVersionConfig
};
