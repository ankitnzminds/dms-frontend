'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { api, call, type UserRef } from '@/lib/api-client';

export const MIN_LOOKUP_CHARS = 2;

/** GET /members/lookup?q= (>= 2 chars). Open to every role. */
export function useMemberLookup(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['members-lookup', term],
    enabled: term.length >= MIN_LOOKUP_CHARS,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      call<UserRef[]>(
        api.GET('/api/v1/members/lookup', { params: { query: { q: term } }, signal }),
      ),
  });
}

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Typeahead for organization members. Calls `onSelect` with the chosen person and clears itself.
 * Accessible combobox: arrow keys + Enter, listbox with option roles, live result count.
 */
export function MemberPicker({
  label,
  onSelect,
  excludeIds = [],
  placeholder = 'Search by name or email',
  inputId,
}: {
  label: string;
  onSelect: (u: UserRef) => void;
  excludeIds?: string[];
  placeholder?: string;
  inputId?: string;
}) {
  const auto = useId();
  const id = inputId ?? auto;
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(text);
  const q = useMemberLookup(debounced);
  const items = (q.data ?? []).filter((u) => !excludeIds.includes(u.id));
  const open = text.trim().length >= MIN_LOOKUP_CHARS;
  const listId = `${id}-list`;

  function choose(u: UserRef) {
    onSelect(u);
    setText('');
    setActive(0);
  }

  return (
    <div className="relative grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${id}-opt-${items[active]!.id}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            choose(items[active]!);
          } else if (e.key === 'Escape') {
            setText('');
          }
        }}
      />
      {!open && <p className="text-xs text-muted">Type at least {MIN_LOOKUP_CHARS} characters.</p>}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} results`}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-line bg-surface shadow-pop"
        >
          {q.isPending || debounced !== text ? (
            <li role="presentation" className="px-3 py-2 text-xs text-muted">
              Searching…
            </li>
          ) : q.isError ? (
            <li role="presentation" className="px-3 py-2 text-xs text-danger">
              Lookup failed. Try again.
            </li>
          ) : items.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-xs text-muted">
              No matching members.
            </li>
          ) : (
            items.map((u, i) => (
              <li
                key={u.id}
                id={`${id}-opt-${u.id}`}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-3 py-1.5 text-[13px] ${i === active ? 'bg-accent-soft text-accent-soft-fg' : 'hover:bg-surface-2'}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(u);
                }}
              >
                <span className="font-medium">{u.display_name ?? u.email}</span>
                {u.display_name && <span className="ml-2 text-xs text-muted">{u.email}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
