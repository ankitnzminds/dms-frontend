import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UploadProvider } from '@/features/upload/upload-manager';
import type { UploadEngine } from '@/features/upload/upload-engine';

export function renderApp(ui: React.ReactElement, opts: { engine?: UploadEngine } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <UploadProvider engine={opts.engine}>{ui}</UploadProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    ),
  };
}

export const apiError = (
  status: number,
  code: string,
  message = code,
  details: unknown = null,
) => ({ error: { code, message, request_id: 'req-test', details } });
