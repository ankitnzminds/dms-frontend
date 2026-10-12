'use client';

import { Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { Grammar } from './api';
import { ACTION_GROUPS, label, type CondRow, type CondValue } from './policy-model';

export const SELECT =
  'h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60';

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-[13px] font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Add-from-a-list with removable chips. Used for users, groups, roles and access levels. */
export function MultiPick({
  ariaLabel,
  options,
  value,
  onChange,
  disabled,
  empty,
}: {
  ariaLabel: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  empty: string;
}) {
  const name = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div>
      <select
        aria-label={ariaLabel}
        className={SELECT}
        disabled={disabled}
        value=""
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
      >
        <option value="">{value.length ? `Add another…` : empty}</option>
        {options
          .filter((o) => !value.includes(o.value))
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <li key={v}>
              <Badge tone="accent" className="gap-1.5 py-1">
                {name(v)}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${name(v)}`}
                    onClick={() => onChange(value.filter((x) => x !== v))}
                  >
                    <X />
                  </button>
                )}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActionPicker({
  grammar,
  value,
  onChange,
  disabled,
}: {
  grammar: Grammar;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const known = new Set(grammar.actions);
  const toggle = (a: string) =>
    onChange(value.includes(a) ? value.filter((x) => x !== a) : [...value, a]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ACTION_GROUPS.map((g) => (
        <fieldset key={g.title} className="rounded-md border border-line p-2.5">
          <legend className="px-1 text-xs font-medium text-muted">{g.title}</legend>
          {g.actions
            .filter((a) => known.has(a))
            .map((a) => (
              <label key={a} className="flex items-center gap-2 py-0.5 text-[13px]">
                <Checkbox
                  checked={value.includes(a)}
                  onCheckedChange={() => toggle(a)}
                  disabled={disabled}
                />
                {label(a)}
              </label>
            ))}
        </fieldset>
      ))}
    </div>
  );
}

export function ConditionRows({
  grammar,
  rows,
  resourceTypes,
  onChange,
  disabled,
}: {
  grammar: Grammar;
  rows: CondRow[];
  resourceTypes: string[];
  onChange: (r: CondRow[]) => void;
  disabled?: boolean;
}) {
  const usable = (name: string) =>
    resourceTypes.every((t) =>
      grammar.attributes.find((a) => a.name === name)?.resource_types.includes(t),
    );
  const set = (i: number, patch: Partial<CondRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const first = grammar.attributes.find((a) => usable(a.name)) ?? grammar.attributes[0]!;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const attr = grammar.attributes.find((a) => a.name === r.attribute);
        const needsValue = r.operator !== 'EXISTS' && r.operator !== 'NOT_EXISTS';
        const multi = r.operator === 'IN' || r.operator === 'NOT_IN';
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1.6fr_auto]">
            <select
              aria-label="Attribute"
              className={SELECT}
              disabled={disabled}
              value={r.attribute}
              onChange={(e) => {
                const a = grammar.attributes.find((x) => x.name === e.target.value)!;
                set(i, {
                  attribute: a.name,
                  operator: a.operators[0]!,
                  value: a.kind === 'bool' ? true : '',
                });
              }}
            >
              {grammar.attributes.map((a) => (
                <option key={a.name} value={a.name} disabled={!usable(a.name)}>
                  {label(a.name.split('.')[1]!)} ({a.name.split('.')[0]})
                  {usable(a.name) ? '' : ' — not for the chosen item types'}
                </option>
              ))}
            </select>
            <select
              aria-label="Operator"
              className={SELECT}
              disabled={disabled}
              value={r.operator}
              onChange={(e) =>
                set(i, {
                  operator: e.target.value,
                  value: e.target.value === 'IN' || e.target.value === 'NOT_IN' ? [] : '',
                })
              }
            >
              {(attr?.operators ?? []).map((o) => (
                <option key={o} value={o}>
                  {label(o.toLowerCase())}
                </option>
              ))}
            </select>
            <div>
              {!needsValue ? (
                <span className="text-xs text-muted">No value needed</span>
              ) : attr?.kind === 'bool' ? (
                <select
                  aria-label="Value"
                  className={SELECT}
                  disabled={disabled}
                  value={String(r.value)}
                  onChange={(e) => set(i, { value: e.target.value === 'true' })}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : attr?.kind === 'enum' && !multi ? (
                <select
                  aria-label="Value"
                  className={SELECT}
                  disabled={disabled}
                  value={String(r.value)}
                  onChange={(e) => set(i, { value: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {attr.choices.map((c) => (
                    <option key={c} value={c}>
                      {label(c)}
                    </option>
                  ))}
                </select>
              ) : attr?.kind === 'enum' ? (
                <MultiPick
                  ariaLabel="Values"
                  empty="Choose values…"
                  disabled={disabled}
                  options={attr.choices.map((c) => ({ value: c, label: label(c) }))}
                  value={Array.isArray(r.value) ? r.value : []}
                  onChange={(v) => set(i, { value: v })}
                />
              ) : (
                <Input
                  aria-label="Value"
                  disabled={disabled}
                  placeholder={multi ? 'pdf, docx' : 'pdf'}
                  value={Array.isArray(r.value) ? r.value.join(', ') : String(r.value)}
                  onChange={(e) =>
                    set(i, {
                      value: multi
                        ? e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        : e.target.value,
                    } as { value: CondValue })
                  }
                />
              )}
            </div>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove condition"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            )}
          </div>
        );
      })}
      {!disabled && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([
              ...rows,
              {
                attribute: first.name,
                operator: first.operators[0]!,
                value: first.kind === 'bool' ? true : '',
              },
            ])
          }
        >
          <Plus /> Add condition
        </Button>
      )}
    </div>
  );
}
