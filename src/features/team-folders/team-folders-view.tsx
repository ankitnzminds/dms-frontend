'use client';

import { FolderPlus, RefreshCw, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ContextMenuContent,
  ContextMenuRoot,
  ContextMenuTrigger,
} from '@/components/explorer/menu-render';
import { ResourceActionsProvider } from '@/components/explorer/resource-actions';
import { NewFolderDialog } from '@/components/file-browser/name-dialogs';
import { ItemsTable } from '@/components/file-browser/items-table';
import { ItemIcon } from '@/components/file-browser/file-bits';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { SharedBadge } from '@/components/sharing/shared-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { useMe } from '@/features/auth/session';
import { useChildren, useRootFolder, type SortKey, type SortOrder } from '@/features/files/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { isAdminRole } from '@/lib/permissions';
import { teamFolderToTreeItem, useSetTeamFolder, useTeamFolders } from './api';

/**
 * Manage Team Folders: top-level folders an administrator has marked as shared team spaces. Listing here
 * grants nothing; a person sees a team folder only if permissions or shares already let them discover it.
 * The page chrome and the list are the same components My Files, Recent and Starred use, so rows behave
 * identically (hover toolbar, right-click menu, actions); only presentation lives here.
 */
export function TeamFoldersView() {
  return (
    <ResourceActionsProvider>
      <Body />
    </ResourceActionsProvider>
  );
}

function Body() {
  const { data: me } = useMe();
  const admin = isAdminRole(me?.role);
  const q = useTeamFolders();
  const unmark = useSetTeamFolder();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; order: SortOrder }>({
    key: 'name',
    order: 'asc',
  });
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const root = useRootFolder();
  const markTeam = useSetTeamFolder();
  const [msg, setMsg] = useState<string | null>(null);

  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = (q.data ?? [])
      .filter((t) => !f || t.name.toLowerCase().includes(f))
      .map(teamFolderToTreeItem);
    const dir = sort.order === 'asc' ? 1 : -1;
    return list.sort((a, b) =>
      sort.key === 'updated_at'
        ? (a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0) * dir
        : a.name.localeCompare(b.name) * dir,
    );
  }, [q.data, filter, sort]);
  const shared = useMemo(
    () => new Set((q.data ?? []).filter((t) => t.shared).map((t) => t.id)),
    [q.data],
  );
  const total = q.data?.length ?? 0;

  return (
    <>
      <PageHeader
        trail={
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <Link href="/dashboard" className="hover:underline">
              Home
            </Link>{' '}
            / <span aria-current="page">Team Folders</span>
          </nav>
        }
        title="Team Folders"
        description={`${total} item${total === 1 ? '' : 's'}`}
        actions={
          <div className="flex items-center gap-2">
            {admin && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <FolderPlus /> Add Files and Folders
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh"
              onClick={() => void q.refetch()}
            >
              <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>
        }
      />
      {/* Right-click anywhere on the empty area gives the page menu; rows keep their own menu. */}
      <ContextMenuRoot>
        <ContextMenuTrigger asChild>
          <div className="min-h-[calc(100dvh-14rem)]" data-testid="team-folders-area">
            <div className="mt-3 flex min-h-11 items-center justify-end gap-1 rounded-lg border border-line bg-surface px-2 py-1.5">
              <div className="relative w-full max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
                  aria-hidden
                />
                <Input
                  aria-label="Filter Items"
                  placeholder="Filter Items"
                  className="pl-8"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>
            {msg && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {msg}
              </p>
            )}
            <Panel className="mt-3">
              <ItemsTable
                caption="Team folders"
                items={items}
                isLoading={q.isPending}
                error={q.error}
                onRetry={() => q.refetch()}
                fit
                hideSize
                sort={sort}
                onSortChange={(key) =>
                  setSort((s) => ({
                    key,
                    order: s.key === key && s.order === 'asc' ? 'desc' : 'asc',
                  }))
                }
                emptyState={
                  <EmptyState
                    icon={Users}
                    title={filter ? 'No team folders match' : 'No team folders yet'}
                    description={
                      admin
                        ? 'Use "Add Files and Folders" to list a top-level folder here.'
                        : 'An administrator can list shared top-level folders here.'
                    }
                  />
                }
                nameExtra={(t) =>
                  shared.has(t.id) ? <SharedBadge kind="folder" id={t.id} /> : null
                }
                actionsExtra={(t) =>
                  admin ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        unmark.mutate(
                          { id: t.id, enabled: false },
                          { onError: (e) => setMsg(friendlyMessage(e)) },
                        )
                      }
                    >
                      Remove from list
                    </Button>
                  ) : null
                }
              />
            </Panel>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          entries={[
            ...(admin
              ? [{ id: 'new-folder' as const, label: 'Add Files and Folders', enabled: true }]
              : []),
            { id: 'refresh' as const, label: 'Refresh', shortcut: 'F5', enabled: true },
          ]}
          onRun={(a) => (a === 'refresh' ? void q.refetch() : setAdding(true))}
        />
      </ContextMenuRoot>
      {adding && (
        <AddDialog
          onClose={() => setAdding(false)}
          onNew={() => {
            setAdding(false);
            setCreating(true);
          }}
        />
      )}
      {root.data && (
        <NewFolderDialog
          parentId={root.data.id}
          open={creating}
          onOpenChange={setCreating}
          onCreated={(f) =>
            markTeam.mutate(
              { id: f.id, enabled: true },
              { onError: (e) => setMsg(friendlyMessage(e)) },
            )
          }
        />
      )}
    </>
  );
}

function AddDialog({ onClose, onNew }: { onClose: () => void; onNew: () => void }) {
  const root = useRootFolder();
  const kids = useChildren(
    root.data?.id,
    { limit: 100, offset: 0, sort: 'name', order: 'asc', kind: 'folder' },
    { enabled: !!root.data },
  );
  const listed = new Set((useTeamFolders().data ?? []).map((t) => t.id));
  const set = useSetTeamFolder();
  const [err, setErr] = useState<string | null>(null);
  const choices = (kids.data?.items ?? []).filter((i) => i.kind === 'folder' && !listed.has(i.id));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Add Files and Folders"
        description="Only folders directly under the organization root can be listed as team folders."
      >
        <DialogBody>
          {kids.isPending ? (
            <SkeletonRows rows={3} label="Loading folders" />
          ) : choices.length === 0 ? (
            <p className="text-[13px] text-muted">
              There are no more top-level folders to list. Use &quot;New folder&quot; to create one.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {choices.map((f) => (
                <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <ItemIcon kind="folder" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <Button
                    size="sm"
                    disabled={set.isPending}
                    onClick={() =>
                      set.mutate(
                        { id: f.id, enabled: true },
                        { onError: (e) => setErr(friendlyMessage(e)) },
                      )
                    }
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {err && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {err}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onNew} data-testid="team-new-folder">
            <FolderPlus /> New folder
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
