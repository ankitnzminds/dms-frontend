'use client';

import { Check, Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface Choice {
  key: string;
  label: string;
  description?: string;
  group?: string;
  /** When set the option cannot be picked; the text says why. */
  disabledReason?: string | null;
}

/**
 * A searchable, grouped, scrollable list of options shown inline (instead of a native drop-down that
 * can run off the screen). Single choice; each option shows its name, a one-line description and, when
 * unavailable, the reason.
 */
export function ChoiceList({
  choices,
  value,
  onChange,
  label,
  placeholder = 'Search…',
}: {
  choices: Choice[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const id = useId();
  const term = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      term
        ? choices.filter((c) => `${c.label} ${c.description ?? ''}`.toLowerCase().includes(term))
        : choices,
    [choices, term],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Choice[]>();
    for (const c of shown) m.set(c.group ?? '', [...(m.get(c.group ?? '') ?? []), c]);
    return [...m.entries()];
  }, [shown]);

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
          aria-hidden
        />
        <Input
          type="search"
          aria-label={`Search ${label}`}
          placeholder={placeholder}
          className="pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="sidebar-scroll max-h-[min(22rem,48vh)] overflow-y-auto rounded-md border border-line"
      >
        {groups.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted">Nothing matches “{q}”.</p>
        )}
        {groups.map(([group, items]) => (
          <div key={group || 'all'}>
            {group && (
              <p className="sticky top-0 z-[1] border-b border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
                {group}
              </p>
            )}
            <ul>
              {items.map((c) => {
                const checked = c.key === value;
                const off = !!c.disabledReason;
                return (
                  <li key={c.key} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      aria-disabled={off}
                      aria-describedby={`${id}-${c.key}`}
                      disabled={off}
                      onClick={() => onChange(c.key)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none transition-colors',
                        'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]',
                        checked && 'bg-accent-soft hover:bg-accent-soft',
                        off && 'cursor-not-allowed opacity-55 hover:bg-transparent',
                      )}
                      data-testid={`choice-${c.key}`}
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                          checked ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong',
                        )}
                        aria-hidden
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1" id={`${id}-${c.key}`}>
                        <span
                          className={cn(
                            'block text-[13px] font-medium',
                            checked && 'text-accent-soft-fg',
                          )}
                        >
                          {c.label}
                        </span>
                        {c.disabledReason ? (
                          <span className="mt-0.5 block text-xs text-warn">{c.disabledReason}</span>
                        ) : (
                          c.description && (
                            <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                              {c.description}
                            </span>
                          )
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
