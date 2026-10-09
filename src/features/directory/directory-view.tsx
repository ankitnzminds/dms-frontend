'use client';

import { Database, Loader2, Play, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { formatDateTime, titleCase } from '@/lib/format';
import {
  parseSnapshot,
  SECRET_REF_RE,
  splitStats,
  useCreateSource,
  useDeleteSource,
  useDirectorySources,
  useRun,
  useSourceRuns,
  useStartSync,
  useUpdateSource,
  useUploadSnapshot,
  type DirectorySource,
  type SyncRun,
} from './hooks';

const DIR_ERRORS: Record<string, string> = {
  invalid_secret_ref:
    'The secret reference must look like env:DMS_DIR_<NAME> (capital letters, digits, underscores).',
  insecure_ldap: 'LDAP must use ldaps://, or ldap:// together with STARTTLS.',
  sync_running: 'A sync is already running for this source.',
  source_disabled: 'This source is disabled. Enable it first.',
};
const dirError = (e: unknown) => (isApiError(e) && DIR_ERRORS[e.code]) || friendlyMessage(e);

/* ------------------------------ source form ------------------------------ */

function SourceDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateSource();
  const [kind, setKind] = useState<'static' | 'entra' | 'ldap'>('static');
  const [name, setName] = useState('');
  const [secretRef, setSecretRef] = useState('');
  const [interval, setInterval_] = useState('');
  const [cfg, setCfg] = useState({
    tenant_id: '',
    client_id: '',
    server_uri: '',
    start_tls: false,
    bind_dn: '',
    base_dn_users: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Give the source a name';
    if (kind !== 'static') {
      if (!secretRef) errs.secretRef = 'Enter the environment reference that holds the secret';
      else if (!SECRET_REF_RE.test(secretRef)) errs.secretRef = 'Use the form env:DMS_DIR_<NAME>';
    }
    if (kind === 'entra') {
      if (!cfg.tenant_id.trim()) errs.tenant_id = 'Tenant ID is required';
      if (!cfg.client_id.trim()) errs.client_id = 'Client ID is required';
    }
    if (kind === 'ldap') {
      if (
        !/^ldaps:\/\//.test(cfg.server_uri) &&
        !(/^ldap:\/\//.test(cfg.server_uri) && cfg.start_tls)
      )
        errs.server_uri = 'Use ldaps://, or ldap:// with STARTTLS enabled';
      if (!cfg.bind_dn.trim()) errs.bind_dn = 'Bind DN is required';
      if (!cfg.base_dn_users.trim()) errs.base_dn_users = 'Users base DN is required';
    }
    if (interval && !/^[1-9]\d*$/.test(interval)) errs.interval = 'Whole minutes, 1 or more';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const config =
      kind === 'entra'
        ? { tenant_id: cfg.tenant_id.trim(), client_id: cfg.client_id.trim() }
        : kind === 'ldap'
          ? {
              server_uri: cfg.server_uri.trim(),
              start_tls: cfg.start_tls,
              bind_dn: cfg.bind_dn.trim(),
              base_dn_users: cfg.base_dn_users.trim(),
            }
          : {};
    create.mutate(
      {
        kind,
        name: name.trim(),
        config,
        secret_ref: kind === 'static' ? null : secretRef,
        sync_interval_minutes: interval ? Number(interval) : null,
      },
      {
        onSuccess: () => (toast.success(`Added source "${name.trim()}"`), onClose()),
        onError: (er) => setErrors({ server: dirError(er) }),
      },
    );
  }
  const set = (k: keyof typeof cfg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Add a provisioning source"
        description="Users and groups are created and updated from this source when you sync."
      >
        <form noValidate onSubmit={submit}>
          <DialogBody className="grid gap-3">
            <Field id="ds-kind" label="Type">
              {(p) => (
                <Select
                  {...p}
                  value={kind}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  <option value="static">Static (upload a JSON snapshot)</option>
                  <option value="entra">Microsoft Entra ID</option>
                  <option value="ldap">LDAP / Active Directory</option>
                </Select>
              )}
            </Field>
            <Field id="ds-name" label="Name" error={errors.name}>
              {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            {kind === 'entra' && (
              <>
                <Field id="ds-tenant" label="Tenant ID" error={errors.tenant_id}>
                  {(p) => <Input {...p} value={cfg.tenant_id} onChange={set('tenant_id')} />}
                </Field>
                <Field id="ds-client" label="Client (application) ID" error={errors.client_id}>
                  {(p) => <Input {...p} value={cfg.client_id} onChange={set('client_id')} />}
                </Field>
              </>
            )}
            {kind === 'ldap' && (
              <>
                <Field
                  id="ds-uri"
                  label="Server URI"
                  hint="ldaps://directory.example.com:636"
                  error={errors.server_uri}
                >
                  {(p) => <Input {...p} value={cfg.server_uri} onChange={set('server_uri')} />}
                </Field>
                <div className="flex items-center gap-2">
                  <input
                    id="ds-tls"
                    type="checkbox"
                    checked={cfg.start_tls}
                    onChange={set('start_tls')}
                  />
                  <Label htmlFor="ds-tls" className="font-normal">
                    Use STARTTLS (needed for ldap://)
                  </Label>
                </div>
                <Field id="ds-bind" label="Bind DN" error={errors.bind_dn}>
                  {(p) => <Input {...p} value={cfg.bind_dn} onChange={set('bind_dn')} />}
                </Field>
                <Field id="ds-base" label="Users base DN" error={errors.base_dn_users}>
                  {(p) => (
                    <Input {...p} value={cfg.base_dn_users} onChange={set('base_dn_users')} />
                  )}
                </Field>
              </>
            )}
            {kind !== 'static' && (
              <Field
                id="ds-secret"
                label="Secret reference"
                hint="Name of a server environment variable that holds the secret, e.g. env:DMS_DIR_ENTRA_PROD. The secret itself is never entered here."
                error={errors.secretRef}
              >
                {(p) => (
                  <Input
                    {...p}
                    autoComplete="off"
                    value={secretRef}
                    onChange={(e) => setSecretRef(e.target.value)}
                  />
                )}
              </Field>
            )}
            <Field
              id="ds-interval"
              label="Automatic sync every (minutes, optional)"
              error={errors.interval}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={interval}
                  onChange={(e) => setInterval_(e.target.value)}
                />
              )}
            </Field>
            {errors.server && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
                {errors.server}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />} Add source
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ snapshot upload ------------------------------ */

function SnapshotDialog({ source, onClose }: { source: DirectorySource; onClose: () => void }) {
  const upload = useUploadSnapshot();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseSnapshot> | null>(null);
  const [fileName, setFileName] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`Snapshot for "${source.name}"`}
        description="A JSON file with users and (optionally) groups. It replaces the previous snapshot."
      >
        <DialogBody className="grid gap-3">
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            aria-label="Choose snapshot JSON file"
            data-testid="snapshot-input"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              setServerError(null);
              setParsed(parseSnapshot(await f.text()));
              e.target.value = '';
            }}
          />
          <Button onClick={() => input.current?.click()}>
            <Upload /> Choose JSON file
          </Button>
          {fileName && <p className="text-xs text-muted">File: {fileName}</p>}
          {parsed?.ok === false && (
            <ul
              role="alert"
              className="list-disc rounded-md bg-danger-soft py-2 pl-6 pr-3 text-xs text-danger"
              data-testid="snapshot-errors"
            >
              {parsed.errors.map((er) => (
                <li key={er}>{er}</li>
              ))}
            </ul>
          )}
          {parsed?.ok && (
            <p
              role="status"
              className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok"
              data-testid="snapshot-ok"
            >
              Valid: {parsed.data.users.length} user{parsed.data.users.length === 1 ? '' : 's'},{' '}
              {(parsed.data.groups ?? []).length} group
              {(parsed.data.groups ?? []).length === 1 ? '' : 's'}.
            </p>
          )}
          {serverError && (
            <p role="alert" className="text-xs text-danger">
              {serverError}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!parsed?.ok || upload.isPending}
            onClick={() =>
              parsed?.ok &&
              upload.mutate(
                { id: source.id, body: parsed.data },
                {
                  onSuccess: () => (toast.success('Snapshot uploaded'), onClose()),
                  onError: (er) => setServerError(dirError(er)),
                },
              )
            }
          >
            {upload.isPending && <Loader2 className="animate-spin" aria-hidden />} Upload snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ runs ------------------------------ */

function RunSummary({ run }: { run: SyncRun }) {
  const { counters, notes } = splitStats(run.stats ?? {});
  const tone = run.state === 'succeeded' ? 'ok' : run.state === 'running' ? 'info' : 'danger';
  return (
    <div
      className="grid gap-1.5 rounded-md border border-line p-3"
      data-testid="run-summary"
      data-state={run.state}
    >
      <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
        {run.dry_run ? 'Preview (dry run)' : 'Sync'}{' '}
        <Badge tone={tone}>{titleCase(run.state)}</Badge>
        {run.state === 'running' && (
          <Loader2 className="size-3.5 animate-spin" aria-label="Running" />
        )}
        <span className="text-xs font-normal text-muted">
          started {formatDateTime(run.started_at)}
        </span>
      </p>
      {run.state === 'aborted' && (
        <p role="alert" className="rounded-md bg-warn-soft px-2 py-1.5 text-xs text-warn">
          Safety stop: {run.error ?? 'the sync was aborted before changing anything.'} No changes
          were applied.
        </p>
      )}
      {run.state === 'failed' && run.error && (
        <p role="alert" className="text-xs text-danger">
          {run.error}
        </p>
      )}
      {counters.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
          {counters.map(([k, n]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt className="text-muted">{titleCase(k)}</dt>
              <dd className="font-medium tabular">{n}</dd>
            </div>
          ))}
        </dl>
      )}
      {notes.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActiveRun({ id }: { id: string }) {
  const q = useRun(id);
  if (!q.data)
    return (
      <p className="text-xs text-muted" role="status">
        Starting…
      </p>
    );
  return <RunSummary run={q.data} />;
}

function SourceRow({ s }: { s: DirectorySource }) {
  const update = useUpdateSource();
  const del = useDeleteSource();
  const sync = useStartSync();
  const runs = useSourceRuns(s.id);
  const [dry, setDry] = useState(true);
  const [activeRun, setActiveRun] = useState<string | null>(null);
  const [snap, setSnap] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmReal, setConfirmReal] = useState(false);

  function start() {
    sync.mutate(
      { id: s.id, dryRun: dry },
      {
        onSuccess: (r) => (setActiveRun(r.id), setConfirmReal(false)),
        onError: (er) => (toast.error(dirError(er)), setConfirmReal(false)),
      },
    );
  }

  return (
    <li className="grid gap-3 px-4 py-4" data-testid="source-row">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">
            {s.name} <Badge tone="outline">{s.kind}</Badge>{' '}
            {!s.enabled && <Badge tone="warn">Disabled</Badge>}
          </p>
          <p className="text-xs text-muted">
            Last sync: {s.last_sync_at ? formatDateTime(s.last_sync_at) : 'never'}
            {s.sync_interval_minutes ? ` · every ${s.sync_interval_minutes} min` : ''}
            {s.secret_ref ? ` · secret: ${s.secret_ref}` : ''}
            {s.kind === 'static'
              ? ` · ${s.has_snapshot ? 'snapshot uploaded' : 'no snapshot yet'}`
              : ''}
          </p>
        </div>
        <Switch
          aria-label={`${s.name} enabled`}
          checked={s.enabled}
          disabled={update.isPending}
          onCheckedChange={(c) =>
            update.mutate(
              { id: s.id, body: { enabled: c } },
              { onError: (er) => toast.error(dirError(er)) },
            )
          }
        />
        <Button
          size="sm"
          variant="danger-ghost"
          aria-label={`Delete source ${s.name}`}
          onClick={() => setConfirmDel(true)}
        >
          <Trash2 /> Delete
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {s.kind === 'static' && (
          <Button size="sm" onClick={() => setSnap(true)}>
            <Upload /> {s.has_snapshot ? 'Replace snapshot' : 'Upload snapshot'}
          </Button>
        )}
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={dry} onChange={(e) => setDry(e.target.checked)} /> Preview
          only (dry run)
        </label>
        <Button
          size="sm"
          variant="primary"
          disabled={sync.isPending || !s.enabled || (s.kind === 'static' && !s.has_snapshot)}
          onClick={() => (dry ? start() : setConfirmReal(true))}
        >
          {sync.isPending ? <Loader2 className="animate-spin" /> : <Play />}{' '}
          {dry ? 'Preview sync' : 'Sync now'}
        </Button>
        {s.kind === 'static' && !s.has_snapshot && (
          <span className="text-xs text-muted">Upload a snapshot first.</span>
        )}
      </div>
      {activeRun && <ActiveRun id={activeRun} />}
      {runs.data && runs.data.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Recent runs ({runs.data.length})</summary>
          <ul className="mt-2 grid gap-2">
            {runs.data.slice(0, 8).map((r) => (
              <li key={r.id}>
                <RunSummary run={r} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {snap && <SnapshotDialog source={s} onClose={() => setSnap(false)} />}
      <ConfirmDialog
        open={confirmReal}
        onOpenChange={setConfirmReal}
        title={`Apply the sync for "${s.name}"?`}
        description="This creates, updates and may suspend users and groups in this organization. Run a preview first if you have not."
        confirmLabel="Sync now"
        pending={sync.isPending}
        onConfirm={start}
      />
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={`Remove "${s.name}"?`}
        description="Users and groups it already provisioned are kept."
        confirmLabel="Remove source"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(s.id, {
            onSuccess: () => (toast.success('Source removed'), setConfirmDel(false)),
            onError: (er) => (toast.error(dirError(er)), setConfirmDel(false)),
          })
        }
      />
    </li>
  );
}

export function DirectoryView() {
  const q = useDirectorySources();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        title="Directory provisioning"
        description="Keep users and groups in sync with your directory. Sign-in itself is handled by your authentication provider, not here."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus /> Add source
          </Button>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={2} label="Loading sources" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No sources yet"
            description="Add a static snapshot, Microsoft Entra ID or LDAP source."
          />
        ) : (
          <ul className="divide-y divide-line" aria-label="Provisioning sources">
            {q.data.map((s) => (
              <SourceRow key={s.id} s={s} />
            ))}
          </ul>
        )}
      </Panel>
      {adding && <SourceDialog onClose={() => setAdding(false)} />}
    </>
  );
}
