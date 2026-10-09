'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface SelectionState {
  ids: Set<string>;
  anchor: string | null;
  focus: string | null;
}

export const EMPTY_SELECTION: SelectionState = { ids: new Set(), anchor: null, focus: null };

export interface ClickMods {
  ctrl?: boolean;
  shift?: boolean;
}

/** Pure reducer-style helpers so selection behavior is unit-testable. `order` is the visible sort order. */
export function selectClick(
  s: SelectionState,
  order: string[],
  id: string,
  mods: ClickMods = {},
): SelectionState {
  if (mods.shift && s.anchor && order.includes(s.anchor)) {
    const a = order.indexOf(s.anchor);
    const b = order.indexOf(id);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const range = new Set(order.slice(lo, hi + 1));
    // shift without ctrl replaces the selection with the range; with ctrl it extends it
    const ids = mods.ctrl ? new Set([...s.ids, ...range]) : range;
    return { ids, anchor: s.anchor, focus: id };
  }
  if (mods.ctrl) {
    const ids = new Set(s.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id, focus: id };
  }
  return { ids: new Set([id]), anchor: id, focus: id };
}

export function selectAll(order: string[]): SelectionState {
  return { ids: new Set(order), anchor: order[0] ?? null, focus: order[order.length - 1] ?? null };
}

/** Arrow/Home/End movement. Shift extends from the anchor. Returns unchanged state for empty lists. */
export function moveFocus(
  s: SelectionState,
  order: string[],
  dir: 'up' | 'down' | 'home' | 'end' | 'left' | 'right',
  mods: ClickMods & { step?: number } = {},
): SelectionState {
  if (order.length === 0) return s;
  const cur = s.focus && order.includes(s.focus) ? order.indexOf(s.focus) : -1;
  const step = mods.step ?? 1;
  let next: number;
  if (dir === 'home') next = 0;
  else if (dir === 'end') next = order.length - 1;
  else if (dir === 'down' || dir === 'right')
    next = cur < 0 ? 0 : Math.min(order.length - 1, cur + (dir === 'down' ? step : 1));
  else next = cur < 0 ? 0 : Math.max(0, cur - (dir === 'up' ? step : 1));
  const id = order[next]!;
  if (mods.ctrl && !mods.shift) return { ...s, focus: id }; // move focus without changing selection
  return selectClick(s, order, id, { shift: mods.shift });
}

export function useSelection(order: string[]) {
  const [state, setState] = useState<SelectionState>(EMPTY_SELECTION);

  // Drop ids that vanished from the visible list (deleted/moved/paged away).
  const orderKey = order.join('|');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prune ids that left the visible list
    setState((s) => {
      const visible = new Set(order);
      const ids = new Set([...s.ids].filter((i) => visible.has(i)));
      if (ids.size === s.ids.size && (s.focus === null || visible.has(s.focus))) return s;
      return {
        ids,
        anchor: s.anchor && visible.has(s.anchor) ? s.anchor : null,
        focus: s.focus && visible.has(s.focus) ? s.focus : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const click = useCallback(
    (id: string, mods?: ClickMods) => setState((s) => selectClick(s, order, id, mods)),
    [order],
  );
  const all = useCallback(() => setState(selectAll(order)), [order]);
  const clear = useCallback(() => setState(EMPTY_SELECTION), []);
  const move = useCallback(
    (dir: Parameters<typeof moveFocus>[2], mods?: Parameters<typeof moveFocus>[3]) =>
      setState((s) => moveFocus(s, order, dir, mods)),
    [order],
  );
  const setOnly = useCallback(
    (id: string) => setState({ ids: new Set([id]), anchor: id, focus: id }),
    [],
  );
  const setMany = useCallback(
    (ids: string[]) =>
      setState({ ids: new Set(ids), anchor: ids[0] ?? null, focus: ids[ids.length - 1] ?? null }),
    [],
  );

  return useMemo(
    () => ({ ...state, click, all, clear, move, setOnly, setMany }),
    [state, click, all, clear, move, setOnly, setMany],
  );
}
