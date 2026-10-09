import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Citation } from './hooks';

/** A route is only followed when it is an in-app absolute path (never a URL, never protocol-relative). */
export function safeRoute(route: string | null | undefined): string | null {
  return route && route.startsWith('/') && !route.startsWith('//') && !/[\\\s]/.test(route)
    ? route
    : null;
}

/** Split one line into text / bold / citation tokens. */
export type Token =
  { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'cite'; ref: string };

export function tokenizeLine(line: string): Token[] {
  const out: Token[] = [];
  const re = /\*\*([^*\n]+)\*\*|\[(S\d{1,3})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ t: 'text', v: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] });
    else out.push({ t: 'cite', ref: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ t: 'text', v: line.slice(last) });
  return out;
}

function CitationChip({ c, label }: { c: Citation | undefined; label: string }) {
  const base =
    'mx-0.5 inline-flex items-center rounded-sm border px-1 align-baseline text-[11px] font-semibold leading-4';
  if (!c)
    return (
      <span className={`${base} border-line text-faint`} title="Source not available">
        {label}
      </span>
    );
  const href = c.accessible ? safeRoute(c.route) : null;
  const name = c.document_name ?? 'a source you cannot open';
  if (!href)
    return (
      <span
        className={`${base} cursor-not-allowed border-line text-faint`}
        aria-disabled="true"
        title={
          c.accessible ? 'Source link unavailable' : 'You no longer have access to this source'
        }
        data-testid="citation-chip"
        data-accessible="false"
      >
        {label}
        <span className="sr-only">: {name} (not accessible)</span>
      </span>
    );
  return (
    <Link
      href={href}
      className={`${base} border-accent/40 bg-accent-soft text-accent-soft-fg hover:underline`}
      title={`${name}, version ${c.version_number}`}
      data-testid="citation-chip"
      data-accessible="true"
    >
      {label}
      <span className="sr-only">
        : {name}, version {c.version_number}
      </span>
    </Link>
  );
}

/**
 * Model text is untrusted: rendered as plain React text nodes (never HTML). Supports **bold**, line breaks,
 * "- " bullets and [S#] citation chips.
 */
export function MessageText({
  text,
  citations = [],
}: {
  text: string;
  citations?: Citation[];
}): ReactNode {
  const byRef = new Map(citations.map((c) => [c.ref, c]));
  const lines = text.split(/\r?\n/);
  return (
    <div className="grid gap-1 break-words" data-testid="message-text">
      {lines.map((line, i) => {
        if (line.trim() === '') return <div key={i} className="h-1" aria-hidden />;
        const bullet = /^\s*[-•*]\s+/.test(line);
        const body = bullet ? line.replace(/^\s*[-•*]\s+/, '') : line;
        return (
          <p key={i} className={bullet ? 'flex gap-2 pl-2' : undefined}>
            {bullet && <span aria-hidden>•</span>}
            <span>
              {tokenizeLine(body).map((tk, j) =>
                tk.t === 'text' ? (
                  <span key={j}>{tk.v}</span>
                ) : tk.t === 'bold' ? (
                  <strong key={j}>{tk.v}</strong>
                ) : (
                  <CitationChip key={j} c={byRef.get(tk.ref)} label={tk.ref} />
                ),
              )}
            </span>
          </p>
        );
      })}
    </div>
  );
}
