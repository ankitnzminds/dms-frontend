'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useQuarantine } from './hooks';

const PAGE = 25;

export function QuarantineView() {
  const [offset, setOffset] = useState(0);
  const q = useQuarantine(PAGE, offset);
  return (
    <>
      <PageHeader
        title="Quarantine"
        description="Files the malware scanner blocked. They cannot be downloaded or previewed by anyone."
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={4} label="Loading quarantine" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing in quarantine"
            description="Files that fail the malware scan will be listed here."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-[13px]">
                <caption className="sr-only">Quarantined files</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="px-3 py-2 font-medium">
                      File
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Scan result
                    </th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                      Scanned
                    </th>
                    <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                      Size
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((i) => (
                    <tr
                      key={i.version_id}
                      className="border-b border-line last:border-0"
                      data-testid="quarantine-row"
                    >
                      <td className="px-3 py-2">
                        <Link
                          className="font-medium hover:text-accent hover:underline"
                          href={`/documents/${i.document_id}`}
                        >
                          {i.document_name}
                        </Link>
                        <p className="text-xs text-muted">Version {i.version_number}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone="danger">{i.scan_status}</Badge>
                        <p className="mt-0.5 text-xs text-muted">
                          {[i.scan_engine, i.scan_detail].filter(Boolean).join(': ')}
                        </p>
                      </td>
                      <td className="hidden px-3 py-2 text-muted md:table-cell">
                        {formatDateTime(i.scanned_at)}
                      </td>
                      <td className="tabular hidden px-3 py-2 text-muted sm:table-cell">
                        {formatBytes(i.size_bytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
