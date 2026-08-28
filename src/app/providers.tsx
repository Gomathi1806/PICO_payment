'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { base } from 'wagmi/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import '@coinbase/onchainkit/styles.css';
import { config } from '@/lib/wagmi';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          {/*
            projectId, not apiKey. OnchainKitProvider takes both, and they
            are different credentials: apiKey wants a CDP *Client API Key*
            (only needed for OnchainKit's API-backed features — swap quotes,
            token search — none of which we import), while projectId wants
            the CDP Project ID. We were passing the project ID as apiKey,
            which authenticated nothing.
          */}
          <OnchainKitProvider
            projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID}
            chain={base}
            config={{
              appearance: { mode: 'dark', theme: 'default' },
              wallet: { display: 'modal' },
            }}
          >
            {children}
          </OnchainKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SessionProvider>
  );
}
