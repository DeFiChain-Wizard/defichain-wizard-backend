import { DFIWallet } from '../../blockchain/dfiWallet';
import { getWalletAddress, loadConfig } from '../../config/configuration';
import 'dotenv/config';
import { ActionFactory } from '.';

describe('Compounding Tests', () => {
  // These Tests only work with real funds on the wallet
  // Test 1: Add Collateral
  // Test 2: Swap Token
  // Test 3: Swap Token + Add swapped Token

  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  const testMode: number = 3;

  // Make sure that there is enough runtime for the tests in case DeFiChain produces blocks slowly
  jest.setTimeout(120000);

  switch (testMode) {
    case 1:
      it('Test: Add DFI to Collateral', async () => {
        loadConfig();
        const myWallet = await DFIWallet.build(getWalletAddress());

        const myPredifinedRuleFabric = new ActionFactory(
          myWallet,
          '46d2315fc4b203fd5f6cfafa0bcb421dfd4ab0a2b3f90f670826914a28766905'
        );

        // get ActionSet and run actions
        await myPredifinedRuleFabric['getCompoundingActionSet'](1).run();

        expect(1).toBe(1);
      });

      break;

    case 2:
      it('Test: Swap DFI into dBTC', async () => {
        loadConfig();
        const myWallet = await DFIWallet.build(getWalletAddress());

        const myPredifinedRuleFabric = new ActionFactory(
          myWallet,
          '46d2315fc4b203fd5f6cfafa0bcb421dfd4ab0a2b3f90f670826914a28766905'
        );

        const myActionSet = myPredifinedRuleFabric['getCompoundingActionSet'](
          2,
          'BTC'
        );

        console.log(myActionSet);

        await myActionSet.run();

        expect(1).toBe(1);
      });
      break;

    case 3:
      it('Test: Swap DFI into dBTC and add dBTC as Collateral', async () => {
        loadConfig();
        const myWallet = await DFIWallet.build(getWalletAddress());

        const myPredifinedRuleFabric = new ActionFactory(
          myWallet,
          '46d2315fc4b203fd5f6cfafa0bcb421dfd4ab0a2b3f90f670826914a28766905'
        );

        await myPredifinedRuleFabric['getCompoundingActionSet'](3, 'BTC').run();

        expect(1).toBe(1);
      });
      break;
  }
});

// describe('Liquidity Mining Tests', () => {
//   // These Tests only work with real funds on the wallet
//   // Test 1: Remove Liquidity

//   // Make sure that there is enough runtime for the tests in case DeFiChain produces blocks slowly
//   jest.setTimeout(120000);

//   it('Test: Remove Liquidity', async () => {
//     loadConfig();
//     const myWallet = await DFIWallet.build(getWalletAddress());

//     const myPredifinedRuleFabric = new PredefinedRuleFabric(
//       myWallet,
//       '46d2315fc4b203fd5f6cfafa0bcb421dfd4ab0a2b3f90f670826914a28766905'
//     );

//     // get ActionSet and run actions
//     await myPredifinedRuleFabric['getDecreaseVaultRatioActionSet'](1).run();

//     expect(1).toBe(1);
//   });
// });
