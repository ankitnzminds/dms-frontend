import Link from 'next/link';
import { ChevronRight, Lock } from 'lucide-react';
import type { Breadcrumb } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Renders a canonical path. SECURITY: a segment is a link ONLY when the API marks it
 * `navigable` AND supplies a `folder_id`; everything else is plain, non-interactive text
 * (display context only - it does not imply access to the parent or siblings).
 * Masked segments (name null) render as an ellipsis.
 */
export function PathTrail({
  segments,
  current,
  className,
  size = 'md',
  linkClassName,
}: {
  segments: Breadcrumb[];
  /** Final, non-link label (e.g. the current folder or document name). */
  current?: string;
  className?: string;
  size?: 'sm' | 'md';
  linkClassName?: string;
}) {
  const nodes: React.ReactNode[] = [];
  segments.forEach((s, i) => {
    const label = s.name ?? '…';
    const isLink = s.navigable && !!s.folder_id;
    nodes.push(
      isLink ? (
        <Link
          key={`s${i}`}
          href={`/files/${s.folder_id}`}
          className={cn(
            'rounded-sm text-muted underline-offset-2 hover:text-text hover:underline',
            linkClassName,
          )}
        >
          {label}
        </Link>
      ) : (
        <span
          key={`s${i}`}
          data-navigable="false"
          title={s.name ? 'You do not have access to this folder' : 'Hidden by your organization'}
          className="inline-flex items-center gap-1 text-faint"
        >
          {label}
          <Lock className="size-3 opacity-70" aria-hidden />
          <span className="sr-only">(no access)</span>
        </span>
      ),
    );
  });
  if (current) {
    nodes.push(
      <span key="current" aria-current="page" className="font-medium text-text">
        {current}
      </span>,
    );
  }
  return (
    <nav
      aria-label="Location"
      data-path={[...segments.map((s) => s.name ?? '…'), ...(current ? [current] : [])].join(' > ')}
      className={className}
    >
      <ol
        className={cn(
          'flex flex-wrap items-center gap-x-1 gap-y-0.5',
          size === 'sm' ? 'text-xs' : 'text-[13px]',
        )}
      >
        {nodes.map((n, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-faint" aria-hidden />}
            {n}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Plain-text form for tooltips / copy: "Organization Files > dir1 > dirB". */
export function pathText(segments: Breadcrumb[]) {
  return segments.map((s) => s.name ?? '…').join(' > ');
}
