import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({ 
      appName: 'Pico',
      preference: 'smartWalletOnly', // This forces the "Invisible Wallet" / FaceID experience
    }),
  ],
  transports: {
    [base.id]: http(),
  },
});
