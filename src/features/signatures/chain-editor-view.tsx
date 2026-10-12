'use client';

import { ArrowDown, ArrowUp, Plus, Trash2, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useAdminUsers } from '@/features/admin-users/api';
import { useAdminGroups } from '@/features/admin/hooks';
import { friendlyMessage } from '@/lib/api-client';
import { useApprovalChain, useSetApprovalChain } from '@/features/workflows/hooks';
import { signatureErrorMessage, useSetSignatureChain, useSignatureChain } from './hooks';

export type ChainKind = 'signature' | 'approval';

const LABELS = {
  signature: {
    title: 'Signature chains',
    description:
      'Choose a folder and the people who must sign documents in it, level by level. Documents in a folder without a chain use manual signer selection.',
    parallel: 'Everyone below signs in parallel at this step.',
    addPerson: 'Add signer to this level...',
    addPersonAria: 'Add signer to level',
    superLabel: 'Super signer - signing fast-forwards remaining levels',
    empty: 'No chain configured - documents in this folder use manual signer selection.',
    saved: 'Signature chain saved.',
  },
  approval: {
    title: 'Approval chains',
    description:
      'Choose a folder and the people who must approve files submitted from it, level by level. Files in a folder without a chain are submitted to a workflow you choose.',
    parallel: 'Everyone below approves in parallel at this step.',
    addPerson: 'Add approver to this level...',
    addPersonAria: 'Add approver to level',
    superLabel: 'Super approver - approving fast-forwards remaining levels',
    empty: 'No chain configured - files in this folder are submitted to a workflow you choose.',
    saved: 'Approval chain saved.',
  },
} as const;

interface AnySigner {
  user_id: string;
  name: string;
  optional: boolean;
  is_super_signer?: boolean;
  is_super_approver?: boolean;
}

const SELECT =
  'h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-text focus-visible:outline-2 focus-visible:outline-accent';

interface Signer {
  userId: string;
  name: string;
  optional: boolean;
  isSuper: boolean;
}
interface Level {
  signers: Signer[];
  groupIds: string[];
}

/** Per-folder signature chain: levels run in order, everyone inside a level signs in parallel. */
export function SignatureChainEditorView({ kind = 'signature' }: { kind?: ChainKind }) {
  const [folder, setFolder] = useState<PickedFolder | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  return (
    <>
      <PageHeader title={LABELS[kind].title} description={LABELS[kind].description} />
      <Panel className="mb-3 flex flex-wrap items-center gap-3 p-3">
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
          {folder ? 'Change folder' : 'Select a folder...'}
        </Button>
        <span className="text-[13px]">{folder ? folder.name : 'No folder selected'}</span>
      </Panel>
      {folder && <ChainEditor key={folder.id} folderId={folder.id} kind={kind} />}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent
          title="Select a folder"
          description="The chain applies to documents directly in this folder."
        >
          <DialogBody className="max-h-[50vh]">
            <FolderPicker onChange={setPicked} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPicking(false)}>
              Cancel
            </Button>
            <Button
              disabled={!picked}
              onClick={() => {
                setFolder(picked);
                setPicking(false);
              }}
            >
              Use this folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const toLevels = (c: { levels: AnySigner[][] }): Level[] =>
  c.levels.map((lv) => ({
    groupIds: [],
    signers: lv.map((s) => ({
      userId: s.user_id,
      name: s.name,
      optional: s.optional,
      isSuper: !!(s.is_super_signer ?? s.is_super_approver),
    })),
  }));

export function ChainEditor({
  folderId,
  kind = 'signature',
}: {
  folderId: string;
  kind?: ChainKind;
}) {
  const sig = useSignatureChain(kind === 'signature' ? folderId : undefined);
  const apr = useApprovalChain(kind === 'approval' ? folderId : undefined);
  const chain = kind === 'signature' ? sig : apr;
  if (chain.isError) return <ErrorState error={chain.error} onRetry={() => chain.refetch()} />;
  if (chain.isPending || !chain.data) return <Skeleton className="h-40 w-full" />;
  return <ChainForm folderId={folderId} kind={kind} initial={toLevels(chain.data)} />;
}

function ChainForm({
  folderId,
  initial,
  kind,
}: {
  folderId: string;
  initial: Level[];
  kind: ChainKind;
}) {
  const t = LABELS[kind];
  const saveSig = useSetSignatureChain();
  const saveApr = useSetApprovalChain();
  const saving = saveSig.isPending || saveApr.isPending;
  const users = useAdminUsers({
    q: '',
    status: 'all',
    sort: 'display_name',
    descending: false,
    limit: 100,
    offset: 0,
  });
  const groups = useAdminGroups();
  const [levels, setLevels] = useState<Level[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const people = useMemo(
    () =>
      (users.data?.items ?? [])
        .filter((u) => u.state === 'active')
        .map((u) => ({ id: u.user_id, name: u.display_name ?? u.email })),
    [users.data],
  );
  const used = new Set((levels ?? []).flatMap((l) => l.signers.map((s) => s.userId)));

  const edit = (i: number, fn: (l: Level) => Level) => {
    setLevels(levels.map((l, j) => (j === i ? fn(l) : l)));
    setMessage(null);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= levels.length) return;
    const next = [...levels];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setLevels(next);
    setMessage(null);
  };

  function onSave() {
    setError(null);
    const handlers = {
      onSuccess: (c: { levels: AnySigner[][] }) => {
        setLevels(toLevels(c));
        setMessage(t.saved);
        toast.success(t.saved);
      },
      onError: (e: unknown) => setError(signatureErrorMessage(e) ?? friendlyMessage(e)),
    };
    const group_ids = levels.map((l) => l.groupIds);
    if (kind === 'signature') {
      saveSig.mutate(
        {
          folderId,
          body: {
            levels: levels.map((l) =>
              l.signers.map((s) => ({
                user_id: s.userId,
                optional: s.optional,
                is_super_signer: s.isSuper,
              })),
            ),
            group_ids,
          },
        },
        handlers,
      );
    } else {
      saveApr.mutate(
        {
          folderId,
          body: {
            levels: levels.map((l) =>
              l.signers.map((s) => ({
                user_id: s.userId,
                optional: s.optional,
                is_super_approver: s.isSuper,
              })),
            ),
            group_ids,
          },
        },
        handlers,
      );
    }
  }

  return (
    <div className="space-y-3">
      {levels.length === 0 && (
        <p className="rounded-md border border-dashed border-line-strong p-4 text-[13px] text-muted">
          {t.empty}
        </p>
      )}
      {levels.map((lv, i) => (
        <Panel key={i} className="p-3" data-testid="chain-level">
          <div className="mb-2 flex items-center gap-2">
            <Badge tone="accent">Level {i + 1}</Badge>
            <span className="text-xs text-muted">{t.parallel}</span>
            <span className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move level ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Move level ${i + 1} down`}
                disabled={i === levels.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete level ${i + 1}`}
                onClick={() => {
                  setLevels(levels.filter((_, j) => j !== i));
                  setMessage(null);
                }}
              >
                <Trash2 />
              </Button>
            </span>
          </div>
          {lv.signers.length === 0 && (
            <p className="text-xs text-muted">No signers in this level yet.</p>
          )}
          <ul className="grid gap-1.5">
            {lv.signers.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className="min-w-40 font-medium">{s.name}</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={s.optional}
                    onCheckedChange={(v) =>
                      edit(i, (l) => ({
                        ...l,
                        signers: l.signers.map((x) =>
                          x.userId === s.userId ? { ...x, optional: v === true } : x,
                        ),
                      }))
                    }
                  />
                  Optional - doesn&apos;t block this level
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={s.isSuper}
                    onCheckedChange={(v) =>
                      edit(i, (l) => ({
                        ...l,
                        signers: l.signers.map((x) =>
                          x.userId === s.userId ? { ...x, isSuper: v === true } : x,
                        ),
                      }))
                    }
                  />
                  <Zap className="size-3" aria-hidden /> {t.superLabel}
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${s.name}`}
                  onClick={() =>
                    edit(i, (l) => ({
                      ...l,
                      signers: l.signers.filter((x) => x.userId !== s.userId),
                    }))
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              aria-label={`${t.addPersonAria} ${i + 1}`}
              className={SELECT}
              value=""
              onChange={(e) => {
                const p = people.find((x) => x.id === e.target.value);
                if (p)
                  edit(i, (l) => ({
                    ...l,
                    signers: [
                      ...l.signers,
                      { userId: p.id, name: p.name, optional: false, isSuper: false },
                    ],
                  }));
              }}
            >
              <option value="">{t.addPerson}</option>
              {people
                .filter((p) => !used.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <select
              aria-label={`Add a group to level ${i + 1}`}
              className={SELECT}
              value=""
              onChange={(e) => {
                if (e.target.value && !lv.groupIds.includes(e.target.value))
                  edit(i, (l) => ({ ...l, groupIds: [...l.groupIds, e.target.value] }));
              }}
            >
              <option value="">Add a group...</option>
              {(groups.data?.items ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          {lv.groupIds.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {lv.groupIds.map((gid) => (
                <li key={gid}>
                  <Badge tone="info" className="gap-1.5">
                    {(groups.data?.items ?? []).find((g) => g.id === gid)?.name ?? 'Group'}
                    <button
                      type="button"
                      aria-label="Remove group"
                      onClick={() =>
                        edit(i, (l) => ({ ...l, groupIds: l.groupIds.filter((x) => x !== gid) }))
                      }
                    >
                      ×
                    </button>
                  </Badge>
                </li>
              ))}
              <li className="text-xs text-muted">
                Group members are added to this level when you save (a snapshot).
              </li>
            </ul>
          )}
        </Panel>
      ))}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-xs text-ok">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setLevels([...levels, { signers: [], groupIds: [] }]);
            setMessage(null);
          }}
        >
          <Plus /> Add level
        </Button>
        <Button variant="primary" disabled={saving} onClick={onSave}>
          {saving ? 'Saving...' : 'Save chain'}
        </Button>
      </div>
    </div>
  );
}
