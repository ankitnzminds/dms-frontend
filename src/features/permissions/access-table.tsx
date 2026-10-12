import { FileText, Folder, Link2, Share2, Shield, User, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import type { AccessEntry } from './api';

const SUBJECT_ICON = { user: User, group: Users, organization: Users, link: Link2 } as const;

/** Read-only list of live grants/shares. Enforcement lives on the server; this only explains it. */
export function AccessTable({
  items,
  showSubject = true,
  caption,
}: {
  items: AccessEntry[];
  showSubject?: boolean;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[52rem] text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="px-3 py-2 font-medium">Item</th>
            {showSubject && <th className="px-2 py-2 font-medium">Who has access</th>}
            <th className="px-2 py-2 font-medium">Permissions</th>
            <th className="px-2 py-2 font-medium">Source</th>
            <th className="px-2 py-2 font-medium">Granted by</th>
            <th className="px-2 py-2 font-medium">Expires</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => {
            const SubjectIcon = SUBJECT_ICON[e.subject_type];
            const ResIcon = e.resource_type === 'folder' ? Folder : FileText;
            return (
              <tr
                key={`${e.source}:${e.id}:${e.subject_id ?? e.subject_type}`}
                className="border-b border-line last:border-0"
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 font-medium">
                    <ResIcon className="size-4 text-muted" aria-hidden />
                    {e.resource_name}
                  </span>
                </td>
                {showSubject && (
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1.5">
                      <SubjectIcon className="size-3.5 text-muted" aria-hidden />
                      {e.subject_label}
                    </span>
                  </td>
                )}
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {e.permissions.length > 0 ? (
                      e.permissions.map((p) => (
                        <Badge key={p} tone="neutral">
                          {p}
                        </Badge>
                      ))
                    ) : (
                      <Badge tone="outline">{e.actions.length} custom</Badge>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <Badge tone={e.source === 'share' ? 'info' : 'accent'}>
                    {e.source === 'share' ? <Share2 /> : <Shield />}
                    {e.source === 'share'
                      ? 'Share'
                      : e.inherited
                        ? 'Permission (inherits)'
                        : 'Permission'}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-muted">{e.granted_by ?? '—'}</td>
                <td className="px-2 py-2">
                  {e.expires_at ? (
                    <span className={e.expiring_soon ? 'font-medium text-warn' : 'text-muted'}>
                      {formatDateTime(e.expires_at)}
                    </span>
                  ) : (
                    <span className="text-muted">Never</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
