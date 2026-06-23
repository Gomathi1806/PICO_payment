import { base, baseSepolia } from 'wagmi/chains';

// USDC on Base Mainnet (official Circle address)
export const USDC_MAINNET_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

// USDC on Base Sepolia Testnet (official Circle address)
export const USDC_TESTNET_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

// Minimal ERC-20 ABI — only what we need for transfer & balance
export const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export const getUSDCConfig = (chainId?: number) => {
  if (chainId === baseSepolia.id) {
    return {
      address: USDC_TESTNET_ADDRESS,
      decimals: 6,
      name: 'Base Sepolia Testnet',
      faucetUrl: 'https://faucet.circle.com/',
    };
  }
  return {
    address: USDC_MAINNET_ADDRESS,
    decimals: 6,
    name: 'Base Mainnet',
    faucetUrl: null,
  };
};
