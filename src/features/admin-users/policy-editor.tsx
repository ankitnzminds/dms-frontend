'use client';

import { Loader2, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { friendlyMessage } from '@/lib/api-client';
import {
  useEffectivePolicy,
  usePolicyCatalog,
  useSavePolicy,
  useStoredPolicy,
  type PolicyOverrides,
  type PolicyScope,
} from './api';
import { BYTE_UNITS, joinBytes, POLICY_TABS, splitBytes, type PolicyField } from './policy-fields';

type Value = string | number | boolean;

function sourceLabel(s: string | undefined): string {
  if (!s || s === 'default') return 'Default';
  if (s === 'organization') return 'Organization policy';
  if (s.startsWith('group:')) return `Group “${s.slice(6)}”`;
  return 'User policy';
}

function BytesInput({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id: string;
}) {
  const { amount, unit } = splitBytes(value);
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="number"
        min={0}
        className="w-28"
        value={amount}
        onChange={(e) => onChange(joinBytes(Number(e.target.value) || 0, unit))}
      />
      <Select
        aria-label="Unit"
        className="w-20"
        value={unit}
        onChange={(e) => onChange(joinBytes(amount, e.target.value))}
      >
        {BYTE_UNITS.map((u) => (
          <option key={u.label}>{u.label}</option>
        ))}
      </Select>
    </div>
  );
}

function Control({
  field,
  value,
  onChange,
  id,
}: {
  field: PolicyField;
  value: Value;
  onChange: (v: Value) => void;
  id: string;
}) {
  switch (field.kind) {
    case 'bool':
      return (
        <Switch
          id={id}
          checked={value === true}
          onCheckedChange={onChange}
          aria-label={field.label}
        />
      );
    case 'select':
      return (
        <Select
          id={id}
          className="w-48"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case 'days':
    case 'count':
      return (
        <Input
          id={id}
          type="number"
          min={0}
          className="w-28"
          value={Number(value)}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
      );
    case 'bytes':
      return <BytesInput id={id} value={Number(value)} onChange={onChange} />;
    case 'xml':
      return (
        <Textarea
          id={id}
          rows={10}
          spellCheck={false}
          className="w-full font-mono text-xs"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="<configuration>…</configuration>"
        />
      );
  }
}

/**
 * Policy editor for one scope (organization, group or user). It edits only the keys explicitly
 * overridden at that scope; everything else shows the inherited value and where it came from.
 * Validation, precedence and enforcement live on the server: this form only collects values.
 */
export function PolicyEditor({
  scope,
  title,
  subtitle,
  initialTab,
  onClose,
}: {
  scope: PolicyScope;
  title: string;
  subtitle?: string;
  initialTab?: string;
  onClose: () => void;
}) {
  const catalog = usePolicyCatalog();
  const stored = useStoredPolicy(scope);
  const effective = useEffectivePolicy(scope.kind === 'user' ? scope.id : undefined);
  const orgStored = useStoredPolicy({ kind: 'organization' });
  const save = useSavePolicy(scope);

  if (catalog.isPending || stored.isPending || (scope.kind === 'user' && effective.isPending))
    return <Skeleton className="m-5 h-64" />;
  const failed = catalog.error ?? stored.error ?? effective.error;
  if (failed || !catalog.data || !stored.data)
    return <ErrorState error={failed} onRetry={() => void stored.refetch()} />;

  return (
    <Editor
      key={`${stored.data.version}`}
      title={title}
      subtitle={subtitle}
      initialTab={initialTab}
      scope={scope}
      defaults={catalog.data.defaults}
      enforced={new Set(catalog.data.enforced)}
      stored={stored.data}
      inherited={
        scope.kind === 'user' && effective.data
          ? { values: effective.data.inherited, source: effective.data.inherited_provenance }
          : {
              values: mergeOverrides(
                catalog.data.defaults,
                scope.kind === 'group' ? (orgStored.data?.overrides ?? {}) : {},
              ),
              source: {},
            }
      }
      save={save}
      onClose={onClose}
    />
  );
}

function mergeOverrides(base: PolicyOverrides, over: PolicyOverrides): PolicyOverrides {
  const out: PolicyOverrides = {};
  for (const tab of Object.keys(base)) out[tab] = { ...base[tab], ...(over[tab] ?? {}) };
  return out;
}

function Editor({
  title,
  subtitle,
  initialTab,
  scope,
  defaults,
  enforced,
  stored,
  inherited,
  save,
  onClose,
}: {
  title: string;
  subtitle?: string;
  initialTab?: string;
  scope: PolicyScope;
  defaults: PolicyOverrides;
  enforced: Set<string>;
  stored: { overrides: PolicyOverrides; version: number };
  inherited: { values: PolicyOverrides; source: Record<string, string> };
  save: ReturnType<typeof useSavePolicy>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PolicyOverrides>(() => structuredClone(stored.overrides));
  const [tab, setTab] = useState(initialTab ?? POLICY_TABS[0]!.id);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(stored.overrides),
    [draft, stored.overrides],
  );

  const valueOf = (t: string, k: string): Value =>
    (draft[t]?.[k] ?? inherited.values[t]?.[k] ?? defaults[t]?.[k]) as Value;
  const overridden = (t: string, k: string) => draft[t] !== undefined && k in draft[t]!;

  function set(t: string, k: string, v: Value) {
    setError(null);
    setDraft((d) => ({ ...d, [t]: { ...(d[t] ?? {}), [k]: v } }));
  }
  function unset(t: string, k: string) {
    setDraft((d) => {
      const { [k]: _gone, ...rest } = d[t] ?? {};
      void _gone;
      const next = { ...d, [t]: rest };
      if (Object.keys(rest).length === 0) delete next[t];
      return next;
    });
  }

  function persist(overrides: PolicyOverrides, okMessage: string) {
    save.mutate(
      { overrides, expectedVersion: stored.version },
      {
        onSuccess: () => {
          toast.success(okMessage);
          setConfirmReset(false);
        },
        onError: (e) => {
          setConfirmReset(false);
          setError(friendlyMessage(e));
        },
      },
    );
  }

  const groupHint =
    scope.kind === 'user'
      ? 'Applied from'
      : scope.kind === 'group'
        ? 'Inherited from'
        : 'Built-in default';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-5 py-2.5">
        <p className="text-[13px] font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-3">
          {POLICY_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="watermark">Watermark</TabsTrigger>
        </TabsList>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {POLICY_TABS.map((t) => (
            <TabsContent key={t.id} value={t.id}>
              {t.intro && (
                <p className="mb-3 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
                  {t.intro}
                </p>
              )}
              <ul className="divide-y divide-line">
                {t.fields.map((f) => {
                  const id = `pol-${t.id}-${f.key}`;
                  const isEnforced = enforced.has(`${t.id}.${f.key}`);
                  const own = overridden(t.id, f.key);
                  const src = own
                    ? scope.kind === 'user'
                      ? 'User policy'
                      : scope.kind === 'group'
                        ? 'This group'
                        : 'Organization policy'
                    : scope.kind === 'user'
                      ? sourceLabel(inherited.source[`${t.id}.${f.key}`])
                      : groupHint;
                  return (
                    <li
                      key={f.key}
                      className={`grid gap-1.5 py-3 ${f.kind === 'xml' ? '' : 'sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4'}`}
                    >
                      <div className="min-w-0">
                        <label htmlFor={id} className="text-[13px] font-medium">
                          {f.label}
                        </label>
                        <p className="text-xs text-muted">{f.help}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                          <span>{own ? `Set by: ${src}` : `${groupHint}: ${src}`}</span>
                          {isEnforced ? (
                            <Badge tone="ok">Enforced</Badge>
                          ) : (
                            <Badge
                              tone="outline"
                              title="Saved and audited, but nothing in DMS acts on it yet."
                            >
                              Stored, not enforced yet
                            </Badge>
                          )}
                          {own && (
                            <button
                              type="button"
                              className="text-accent underline-offset-2 hover:underline"
                              onClick={() => unset(t.id, f.key)}
                            >
                              Use inherited value
                            </button>
                          )}
                        </p>
                      </div>
                      <Control
                        id={id}
                        field={f}
                        value={valueOf(t.id, f.key)}
                        onChange={(v) => set(t.id, f.key, v)}
                      />
                    </li>
                  );
                })}
              </ul>
            </TabsContent>
          ))}
          <TabsContent value="watermark">
            <p className="rounded-md bg-surface-2 px-4 py-6 text-center text-[13px] text-muted">
              No watermark rules apply to this policy. Watermarking is not available in DMS yet.
            </p>
          </TabsContent>
        </div>
      </Tabs>

      {error && (
        <p
          role="alert"
          className="border-t border-line bg-danger-soft px-5 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
        <span className="mr-auto text-xs text-muted">
          {dirty ? 'Unsaved changes' : `Version ${stored.version}`}
        </span>
        <Button variant="secondary" onClick={() => (dirty ? setConfirmDiscard(true) : onClose())}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={save.isPending || Object.keys(stored.overrides).length === 0}
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw /> Reset
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || save.isPending}
          onClick={() => persist(draft, 'Policy saved')}
        >
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset this policy?"
        description="Every override at this level is removed and the inherited values apply again. Other account details are not affected."
        confirmLabel="Reset"
        destructive
        pending={save.isPending}
        onConfirm={() => persist({}, 'Policy reset')}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="Your edits to this policy have not been saved."
        confirmLabel="Discard"
        destructive
        onConfirm={onClose}
      />
    </div>
  );
}
