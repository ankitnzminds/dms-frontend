'use client';

import { FileSignature } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { SignatureStateBadge } from '@/components/signatures/request-card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { formatDateTime } from '@/lib/format';
import { isAdminRole } from '@/lib/permissions';
import { useSignatureCapabilities, useSignatureRequests } from './hooks';

const PAGE = 25;

export function SignaturesView() {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const caps = useSignatureCapabilities();
  const [scope, setScope] = useState<'to_sign' | 'mine' | 'all'>('to_sign');
  const [status, setStatus] = useState<'active' | 'finished' | 'any'>('active');
  const [offset, setOffset] = useState(0);
  const q = useSignatureRequests(scope, PAGE, offset, status);

  return (
    <>
      <PageHeader
        title="Signatures"
        description="Documents waiting for your signature, and requests you sent."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="sig-scope" className="text-[13px]">
              Show
            </label>
            <Select
              id="sig-scope"
              className="w-64"
              value={scope}
              onChange={(e) => (setScope(e.target.value as typeof scope), setOffset(0))}
            >
              <option value="to_sign">Waiting for my signature</option>
              <option value="mine">Requests I sent</option>
              {admin && <option value="all">All requests (admin)</option>}
            </Select>
            <label htmlFor="sig-status" className="text-[13px]">
              Status
            </label>
            <Select
              id="sig-status"
              className="w-36"
              value={status}
              onChange={(e) => (setStatus(e.target.value as typeof status), setOffset(0))}
            >
              <option value="active">Active</option>
              <option value="finished">History</option>
              <option value="any">All</option>
            </Select>
          </div>
        }
      />
      {caps.data &&
        ((!caps.data.available && !caps.data.builtin_available) || !caps.data.enabled) && (
          <p role="status" className="mb-3 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            {!caps.data.available && !caps.data.builtin_available
              ? 'No signing provider is configured for this service, so new signature requests cannot be sent.'
              : 'E-signature is turned off for your organization. Existing requests are still listed.'}
          </p>
        )}
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={4} label="Loading signature requests" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={
              status === 'finished'
                ? 'No finished signature requests'
                : scope === 'to_sign'
                  ? 'Nothing is waiting for your signature'
                  : 'No signature requests'
            }
            description="To request one, open a document and choose Request signature."
          />
        ) : (
          <>
            <ul className="divide-y divide-line" aria-label="Signature requests">
              {q.data.items.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  data-testid="signature-row"
                  data-state={r.state}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      <Link
                        className="hover:text-accent hover:underline"
                        href={`/signatures/${r.id}`}
                      >
                        {r.title}
                      </Link>
                      <SignatureStateBadge state={r.state} />
                      {r.my_signing_available && <Badge tone="accent">Your turn to sign</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {r.document_name} · from {r.requested_by.display_name ?? r.requested_by.email}{' '}
                      · {formatDateTime(r.created_at)} ·{' '}
                      {r.signers.filter((s) => s.status === 'signed').length}/{r.signers.length}{' '}
                      signed
                    </p>
                  </div>
                  <Link
                    className="text-[13px] text-accent hover:underline"
                    href={`/signatures/${r.id}`}
                  >
                    {r.my_signing_available ? 'Review and sign' : 'View details'}
                  </Link>
                </li>
              ))}
            </ul>
            <PaginationBar
              total={q.data.total}
              limit={PAGE}
              offset={offset}
              count={q.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>
    </>
  );
}
