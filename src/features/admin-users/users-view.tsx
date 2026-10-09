'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Download,
  FileUp,
  Pencil,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage } from '@/lib/api-client';
import { formatDateTime, formatRelative, titleCase } from '@/lib/format';
import {
  downloadBlob,
  exportUsers,
  useAdminUsers,
  type AdminUser,
  type SortField,
  type SourceFilter,
  type StatusFilter,
} from './api';
import { AddUserDialog } from './add-user-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';
import { ImportUsersDialog } from './import-dialog';
import { PolicyEditor } from './policy-editor';
import { STATE_TONE, UserDetailsDialog } from './user-details-dialog';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'guest', label: 'Guest Access' },
  { value: 'full', label: 'Full Access' },
  { value: 'external', label: 'External Access' },
  { value: 'disabled', label: 'Disabled' },
];
const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'invitation', label: 'Invitation' },
  { value: 'csv_import', label: 'CSV import' },
  { value: 'directory', label: 'Directory' },
];
const PAGE_SIZES = [10, 25, 50, 100];

function SortHeader({
  field,
  label,
  sort,
  descending,
  onSort,
  className,
}: {
  field: SortField;
  label: string;
  sort: SortField;
  descending: boolean;
  onSort: (f: SortField) => void;
  className?: string;
}) {
  const active = sort === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}
      className={`px-3 py-2 font-medium ${className ?? ''}`}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-text"
        onClick={() => onSort(field)}
      >
        {label}
        {active && (descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </th>
  );
}

function statusLabel(u: AdminUser): string {
  return u.state === 'active' || u.state === 'invited'
    ? `${titleCase(u.access_level)} Access`
    : titleCase(u.state);
}

export function UsersView() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter | ''>('');
  const [sort, setSort] = useState<SortField>('email');
  const [descending, setDescending] = useState(false);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [exporting, setExporting] = useState(false);

  const filters = { q, status, source: source || undefined, sort, descending, limit, offset };
  const list = useAdminUsers(filters);

  const onSort = (f: SortField) => {
    if (f === sort) setDescending((d) => !d);
    else (setSort(f), setDescending(false));
    setOffset(0);
  };

  async function runExport() {
    setExporting(true);
    try {
      downloadBlob(await exportUsers(filters), 'users.csv');
      toast.success('Exported the users that match the current filters');
    } catch (e) {
      toast.error(friendlyMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts in this organization: profile, access level, policy and activity."
        actions={
          <>
            <Button variant="primary" onClick={() => setAdding(true)}>
              <UserPlus /> Add user
            </Button>
            <Button onClick={() => setImporting(true)}>
              <FileUp /> Import
            </Button>
            <Button onClick={runExport} disabled={exporting}>
              <Download /> Export
            </Button>
          </>
        }
      />
      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        role="search"
        aria-label="Filter users"
        onSubmit={(e) => e.preventDefault()}
      >
        <Field id="usr-q" label="Search" className="w-64">
          {(p) => (
            <Input
              {...p}
              type="search"
              placeholder="User name, email, name or notes"
              value={q}
              onChange={(e) => (setQ(e.target.value), setOffset(0))}
            />
          )}
        </Field>
        <Field id="usr-status" label="Status">
          {(p) => (
            <Select
              {...p}
              value={status}
              onChange={(e) => (setStatus(e.target.value as StatusFilter), setOffset(0))}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="usr-source" label="Source">
          {(p) => (
            <Select
              {...p}
              value={source}
              onChange={(e) => (setSource(e.target.value as SourceFilter | ''), setOffset(0))}
            >
              <option value="">All sources</option>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id="usr-size" label="Per page">
          {(p) => (
            <Select
              {...p}
              value={limit}
              onChange={(e) => (setLimit(Number(e.target.value)), setOffset(0))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>

      <Panel>
        {list.isPending ? (
          <SkeletonRows rows={6} label="Loading users" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users match"
            description="Change the search or filters, or add a user."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-[13px]">
                <caption className="sr-only">Users</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th scope="col" className="w-8 px-2 py-2">
                      <span className="sr-only">Expand</span>
                    </th>
                    <SortHeader
                      field="username"
                      label="User name"
                      {...{ sort, descending, onSort }}
                    />
                    <SortHeader
                      field="display_name"
                      label="Display name"
                      {...{ sort, descending, onSort }}
                    />
                    <SortHeader field="email" label="Email" {...{ sort, descending, onSort }} />
                    <SortHeader
                      field="last_login_at"
                      label="Last login"
                      className="hidden lg:table-cell"
                      {...{ sort, descending, onSort }}
                    />
                    <th scope="col" className="px-3 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((u) => {
                    const open = expanded === u.user_id;
                    return (
                      <FragmentRow key={u.user_id}>
                        <tr className="border-b border-line last:border-0" data-testid="user-row">
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={`${open ? 'Hide' : 'Show'} details for ${u.email}`}
                              onClick={() => setExpanded(open ? null : u.user_id)}
                              className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-2"
                            >
                              <ChevronRight
                                className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`}
                              />
                            </button>
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {u.username ?? <span className="text-faint">--</span>}
                          </td>
                          <td className="px-3 py-2">
                            {u.display_name ?? <span className="text-faint">--</span>}
                          </td>
                          <td className="px-3 py-2 text-muted">{u.email}</td>
                          <td className="hidden px-3 py-2 text-muted lg:table-cell">
                            {u.last_login_at ? formatRelative(u.last_login_at) : '--'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={STATE_TONE[u.state]}>{statusLabel(u)}</Badge>
                            {u.account_locked && u.state !== 'locked' && (
                              <Badge tone="warn" className="ml-1">
                                Locked
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-0.5">
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Edit ${u.email}`}
                                title="Edit"
                                onClick={() => setDetails(u.user_id)}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Manage policy for ${u.email}`}
                                title="Manage user policy"
                                onClick={() => setPolicy(u)}
                              >
                                <ShieldCheck />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="danger-ghost"
                                aria-label={`Delete ${u.email}`}
                                title="Delete account"
                                onClick={() => setDeleting(u)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-b border-line bg-surface-2/40">
                            <td />
                            <td colSpan={6} className="px-3 py-3">
                              <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                <Info label="Role" value={titleCase(u.role)} />
                                <Info
                                  label="Authentication"
                                  value={
                                    u.authentication === 'default' ? 'Default' : u.authentication
                                  }
                                />
                                <Info label="Created via" value={titleCase(u.creation_source)} />
                                <Info label="Secondary email" value={u.secondary_email} />
                                <Info
                                  label="Account expires"
                                  value={
                                    u.account_expires_at
                                      ? formatDateTime(u.account_expires_at)
                                      : null
                                  }
                                />
                                <Info
                                  label="Last login"
                                  value={u.last_login_at ? formatDateTime(u.last_login_at) : null}
                                />
                                <Info
                                  label="Groups"
                                  value={u.group_ids.length ? `${u.group_ids.length}` : '0'}
                                />
                                <Info
                                  label="Email verified"
                                  value={u.email_verified ? 'Yes' : 'No'}
                                />
                              </dl>
                            </td>
                          </tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              total={list.data.total}
              limit={limit}
              offset={offset}
              count={list.data.items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>

      <AddUserDialog open={adding} onOpenChange={setAdding} />
      <ImportUsersDialog open={importing} onOpenChange={setImporting} />
      <UserDetailsDialog userId={details} onClose={() => setDetails(null)} />
      <DeleteAccountDialog user={deleting} onClose={() => setDeleting(null)} />
      <Dialog open={!!policy} onOpenChange={(o) => !o && setPolicy(null)}>
        <DialogContent
          className="h-[85vh] max-w-3xl"
          title={`Effective policy: ${policy?.display_name ?? policy?.email ?? ''}`}
          description="Overrides apply to this person only; other values come from the organization and their groups."
        >
          {policy && (
            <PolicyEditor
              scope={{ kind: 'user', id: policy.user_id }}
              title={`Policy for ${policy.email}`}
              onClose={() => setPolicy(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value || '--'}</dd>
    </div>
  );
}
