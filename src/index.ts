/**
 *
 *  /$$$$$$$            /$$$$$$$$ /$$  /$$$$$$  /$$                 /$$                 /$$      /$$ /$$                                     /$$
 * | $$__  $$          | $$_____/|__/ /$$__  $$| $$                |__/                | $$  /$ | $$|__/                                    | $$
 * | $$  \ $$  /$$$$$$ | $$       /$$| $$  \__/| $$$$$$$   /$$$$$$  /$$ /$$$$$$$       | $$ /$$$| $$ /$$ /$$$$$$$$  /$$$$$$   /$$$$$$   /$$$$$$$
 * | $$  | $$ /$$__  $$| $$$$$   | $$| $$      | $$__  $$ |____  $$| $$| $$__  $$      | $$/$$ $$ $$| $$|____ /$$/ |____  $$ /$$__  $$ /$$__  $$
 * | $$  | $$| $$$$$$$$| $$__/   | $$| $$      | $$  \ $$  /$$$$$$$| $$| $$  \ $$      | $$$$_  $$$$| $$   /$$$$/   /$$$$$$$| $$  \__/| $$  | $$
 * | $$  | $$| $$_____/| $$      | $$| $$    $$| $$  | $$ /$$__  $$| $$| $$  | $$      | $$$/ \  $$$| $$  /$$__/   /$$__  $$| $$      | $$  | $$
 * | $$$$$$$/|  $$$$$$$| $$      | $$|  $$$$$$/| $$  | $$|  $$$$$$$| $$| $$  | $$      | $$/   \  $$| $$ /$$$$$$$$|  $$$$$$$| $$      |  $$$$$$$
 * |_______/  \_______/|__/      |__/ \______/ |__/  |__/ \_______/|__/|__/  |__/      |__/     \__/|__/|________/ \_______/|__/       \_______/
 *
 *
 * Root application for the Defichain Wizard.
 *
 * Don't put any specific function logic into this file. It will just be a central component to manage the application and to act as entry point.
 *
 * Pretty much no error should ever stop the bot...
 *
 * BTW: We're glad that you are looking into our code. Since the DeFiChain Wizard is open source, we'd love to see you joining us! :)
 *
 */

import { loadConfig } from './config/configuration';
import 'dotenv/config';
import { Wizard } from './wizard';
import { logTitle } from '@defichainwizard/custom-logging';
import { logInfo } from '@defichainwizard/custom-logging';
import { printConfig } from './utils/helpers';

// Loading config and printing out some debug information
logTitle();
logInfo('Wizard starting up....');
loadConfig();
printConfig();

// start the wizard :)
Wizard.doYourMagic();
