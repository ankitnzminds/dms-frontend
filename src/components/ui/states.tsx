import { AlertTriangle, Inbox, Lock, RefreshCw, SearchX } from 'lucide-react';
import * as React from 'react';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="grid size-10 place-items-center rounded-lg bg-surface-2 text-muted">
        <Icon className="size-5" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Neutral state for 403 / 404: never reveals whether the item exists. */
export function NotFoundState({ what = 'item' }: { what?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`This ${what} was not found, or you do not have access`}
      description="It may have been moved, deleted, or never shared with you."
    />
  );
}

export function ForbiddenState({ message }: { message?: string }) {
  return (
    <EmptyState
      icon={Lock}
      title="You do not have permission to view this"
      description={message ?? 'Ask the owner to share it with you.'}
    />
  );
}

/** Error with Retry and an expandable "technical details" block carrying the request id. */
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  if (isApiError(error) && (error.status === 404 || error.status === 403)) {
    return <NotFoundState />;
  }
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}
    >
      <div className="grid size-10 place-items-center rounded-lg bg-danger-soft text-danger">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="text-sm font-semibold">Could not load this</h3>
      <p className="max-w-sm text-[13px] text-muted">{friendlyMessage(error)}</p>
      <TechnicalDetails error={error} />
      {onRetry && (
        <Button className="mt-1" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function TechnicalDetails({ error }: { error: unknown }) {
  if (!isApiError(error)) return null;
  return (
    <details className="max-w-md text-left text-xs text-muted">
      <summary className="cursor-pointer select-none text-center">Technical details</summary>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md bg-surface-2 p-2 font-mono">
        <dt>status</dt>
        <dd>{error.status}</dd>
        <dt>code</dt>
        <dd>{error.code}</dd>
        {error.requestId && (
          <>
            <dt>request_id</dt>
            <dd className="break-all select-all">{error.requestId}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
