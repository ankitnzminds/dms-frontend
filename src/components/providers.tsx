'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isApiError } from '@/lib/api-client';
import { SessionProvider } from '@/features/auth/session';
import { UploadProvider } from '@/features/upload/upload-manager';
import { ThemeProvider, useTheme } from './theme';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          if (isApiError(err) && err.status >= 400 && err.status < 500) return false;
          return count < 1;
        },
      },
    },
  });
}

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" closeButton richColors />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <SessionProvider>
            <UploadProvider>{children}</UploadProvider>
          </SessionProvider>
        </TooltipProvider>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
