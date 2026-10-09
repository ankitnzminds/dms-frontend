'use client';

import { Download, History, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DisabledReason } from '@/components/ui/tooltip';
import { downloadDocument } from '@/features/files/download';
import { useRestoreVersion, useVersions } from '@/features/files/hooks';
import { friendlyMessage, type Version } from '@/lib/api-client';
import { formatBytes, formatDateTime } from '@/lib/format';
import { can } from '@/lib/permissions';

function ScanBadge({ s }: { s: Version['scan_status'] }) {
  if (s === 'clean') return <Badge tone="ok">Clean</Badge>;
  if (s === 'pending') return <Badge tone="warn">Scanning…</Badge>;
  if (s === 'infected') return <Badge tone="danger">Infected</Badge>;
  return <Badge tone="danger">Scan error</Badge>;
}

export function VersionsPanel({
  documentId,
  permissions,
}: {
  documentId: string;
  permissions: readonly string[];
}) {
  const q = useVersions(documentId);
  const restore = useRestoreVersion(documentId);
  const [target, setTarget] = useState<Version | null>(null);

  if (q.isPending) return <SkeletonRows rows={3} label="Loading versions" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <EmptyState icon={History} title="No versions yet" />;

  const versions = [...q.data].sort((a, b) => b.version_number - a.version_number);
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[40rem] border-collapse text-[13px]">
          <caption className="sr-only">Versions of this document, newest first</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                Version
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Size
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                SHA-256
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Created
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Scan
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const dlReason = !can(permissions, 'download')
                ? 'You do not have permission to download this file.'
                : v.scan_status !== 'clean'
                  ? 'Only clean versions can be downloaded.'
                  : null;
              const restoreReason = !can(permissions, 'upload_version')
                ? 'You do not have permission to add versions.'
                : v.is_current
                  ? 'This is already the current version.'
                  : v.scan_status !== 'clean'
                    ? 'Only clean versions can be restored.'
                    : null;
              return (
                <tr
                  key={v.id}
                  className="border-b border-line last:border-0"
                  data-testid="version-row"
                >
                  <td className="px-3 py-2 font-medium">
                    v{v.version_number} {v.is_current && <Badge tone="accent">Current</Badge>}
                    {v.restored_from_version_number != null && (
                      <span className="ml-1 text-xs text-muted">
                        (restored from v{v.restored_from_version_number})
                      </span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2 text-muted">{formatBytes(v.size_bytes)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted" title={v.sha256}>
                    {v.sha256.slice(0, 12)}…
                  </td>
                  <td className="px-3 py-2 text-muted">{formatDateTime(v.created_at)}</td>
                  <td className="px-3 py-2">
                    <ScanBadge s={v.scan_status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex gap-1">
                      <DisabledReason reason={dlReason}>
                        <Button
                          size="sm"
                          disabled={!!dlReason}
                          aria-label={`Download version ${v.version_number}`}
                          onClick={() =>
                            downloadDocument(documentId, v.version_number).catch((e) =>
                              toast.error(friendlyMessage(e)),
                            )
                          }
                        >
                          <Download /> Download
                        </Button>
                      </DisabledReason>
                      <DisabledReason reason={restoreReason}>
                        <Button
                          size="sm"
                          disabled={!!restoreReason}
                          aria-label={`Restore version ${v.version_number} as a new version`}
                          onClick={() => setTarget(v)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                      </DisabledReason>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={`Restore version ${target?.version_number}?`}
        description={`This creates a new version with the contents of v${target?.version_number}. Existing versions are never changed or deleted.`}
        confirmLabel="Restore as new version"
        pending={restore.isPending}
        onConfirm={() =>
          restore.mutate(target!.version_number, {
            onSuccess: (nv) => {
              toast.success(`Restored as version ${nv.version_number}`);
              setTarget(null);
            },
            onError: (e) => toast.error(friendlyMessage(e)),
          })
        }
      >
        {restore.isPending && <Loader2 className="mt-2 animate-spin" aria-hidden />}
      </ConfirmDialog>
    </>
  );
}
