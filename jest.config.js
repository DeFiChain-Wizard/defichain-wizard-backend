/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
const { defaults } = require('jest-config');
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [...defaults.testMatch, '**/?(*.)+(spec|test).invasive.[jt]s?(x)']
};