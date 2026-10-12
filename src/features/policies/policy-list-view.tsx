'use client';

import { BookOpen, Plus, RefreshCw, ScrollText, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PaginationBar } from '@/components/file-browser/pagination-bar';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatDateTime } from '@/lib/format';
import { usePolicies, useTemplates, type PolicyOut, type PolicyStatus } from './api';
import { label } from './policy-model';

const PAGE = 25;
const SELECT =
  'h-9 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-text focus-visible:outline-2 focus-visible:outline-accent';

const STATUS_TONE: Record<PolicyStatus, 'neutral' | 'ok' | 'warn' | 'outline'> = {
  draft: 'neutral',
  published: 'ok',
  disabled: 'warn',
  archived: 'outline',
};
const EFFECT_TONE = { DENY: 'danger', ALLOW: 'info', REQUIRE_APPROVAL: 'warn' } as const;

export function enforcement(p: PolicyOut): {
  text: string;
  tone: 'ok' | 'info' | 'neutral' | 'warn';
} {
  if (p.status === 'published') {
    return p.mode === 'enforce'
      ? { text: 'Enforcing', tone: 'ok' }
      : { text: 'Observing only', tone: 'info' };
  }
  if (p.status === 'disabled') return { text: 'Not enforced (disabled)', tone: 'warn' };
  if (p.status === 'archived') return { text: 'Not enforced (archived)', tone: 'neutral' };
  return { text: 'Not enforced (draft)', tone: 'neutral' };
}

function TemplateLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTemplates();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Start from a template"
        description="Templates always open as a draft. Nothing is published or enforced until you validate and publish it."
        className="max-w-2xl"
      >
        <DialogBody className="max-h-[60vh] space-y-2 overflow-y-auto">
          <Link
            href="/admin/policies/new"
            className="block rounded-md border border-dashed border-line-strong p-3 text-[13px] hover:bg-surface-2"
          >
            <span className="font-medium">Blank policy</span>
            <span className="block text-muted">Build your own rule from scratch.</span>
          </Link>
          {t.isPending && <SkeletonRows rows={3} label="Loading templates" />}
          {t.isError && <ErrorState error={t.error} onRetry={() => t.refetch()} />}
          {t.data?.map((x) => (
            <Link
              key={x.key}
              href={`/admin/policies/new?template=${x.key}`}
              className="block rounded-md border border-line p-3 text-[13px] hover:bg-surface-2"
            >
              <span className="flex items-center gap-2 font-medium">
                {x.name}
                <Badge tone="outline">{label(x.category)}</Badge>
                {x.mandatory && <Badge tone="danger">Mandatory</Badge>}
              </span>
              <span className="mt-1 block text-muted">{x.purpose}</span>
              {x.requires.length > 0 && (
                <span className="mt-1 block text-warn">Needs: {x.requires.join('; ')}</span>
              )}
              {x.limitations.length > 0 && (
                <span className="mt-1 block text-xs text-faint">{x.limitations.join(' ')}</span>
              )}
            </Link>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function PolicyListView() {
  const [status, setStatus] = useState<PolicyStatus | ''>('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [lib, setLib] = useState(false);
  const list = usePolicies(status, q, PAGE, offset);
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Policies"
        description="Rules that restrict what people can do, evaluated by the server on every request. A policy only takes effect once it is validated, published and set to enforce; drafts, disabled and observe-only policies never block anyone."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setLib(true)}>
              <BookOpen /> Templates
            </Button>
            <Button size="sm" asChild>
              <Link href="/admin/policies/new">
                <Plus /> New policy
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh"
              onClick={() => void list.refetch()}
            >
              <RefreshCw className={list.isFetching ? 'animate-spin' : ''} />
            </Button>
          </>
        }
      />
      <Panel className="mb-3 grid gap-3 p-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search policies"
            placeholder="Search by name"
            className="pl-8"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <select
          aria-label="Status"
          className={SELECT}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PolicyStatus | '');
            setOffset(0);
          }}
        >
          <option value="">Status: any</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="disabled">Disabled</option>
          <option value="archived">Archived</option>
        </select>
      </Panel>
      <Panel className="min-w-0">
        {list.isPending ? (
          <SkeletonRows rows={5} label="Loading policies" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={q || status ? 'No policies match' : 'No policies yet'}
            description="Start from a template or build a rule of your own."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-[13px]">
                <caption className="sr-only">Policies</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Effect</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Enforcement</th>
                    <th className="px-2 py-2 font-medium">Revision</th>
                    <th className="px-2 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const e = enforcement(p);
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-line last:border-0 hover:bg-surface-2"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/policies/${p.id}`}
                            className="font-medium text-accent hover:underline"
                          >
                            {p.name}
                          </Link>
                          {p.mandatory && (
                            <Badge tone="danger" className="ml-2">
                              Mandatory
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {p.effect && (
                            <Badge
                              tone={EFFECT_TONE[p.effect as keyof typeof EFFECT_TONE] ?? 'neutral'}
                            >
                              {label(p.effect.toLowerCase())}
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2 text-muted">{p.actions.map(label).join(', ')}</td>
                        <td className="px-2 py-2">
                          <Badge tone={STATUS_TONE[p.status]}>{label(p.status)}</Badge>
                        </td>
                        <td className="px-2 py-2">
                          <Badge tone={e.tone}>{e.text}</Badge>
                        </td>
                        <td className="px-2 py-2 text-muted">
                          {p.published_revision ? `Live v${p.published_revision}` : '—'}
                          {p.latest_revision_status === 'draft' ||
                          p.latest_revision_status === 'validated'
                            ? ` · draft v${p.latest_revision}`
                            : ''}
                        </td>
                        <td className="px-2 py-2 text-muted">{formatDateTime(p.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              total={list.data?.total ?? 0}
              limit={PAGE}
              offset={offset}
              count={items.length}
              onOffsetChange={setOffset}
            />
          </>
        )}
      </Panel>
      <TemplateLibrary open={lib} onClose={() => setLib(false)} />
    </>
  );
}
