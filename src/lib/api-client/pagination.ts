import type { Page } from './types';

export const DEFAULT_PAGE_SIZE = 50;

export function pageToOffset(pageIndex: number, pageSize: number): number {
  return Math.max(0, pageIndex) * pageSize;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function hasNextPage(p: Pick<Page<unknown>, 'total' | 'limit' | 'offset'>): boolean {
  return p.offset + p.limit < p.total;
}

/** "1-50 of 123" */
export function rangeLabel(p: Pick<Page<unknown>, 'total' | 'offset' | 'items'>): string {
  if (p.total === 0) return '0 results';
  return `${p.offset + 1}-${p.offset + p.items.length} of ${p.total}`;
}
