'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). Bounded: callers cap rows. */
export function parseCsv(text: string, maxRows = MAX_ROWS): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') ((cell += '"'), i++);
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if ((cell || row.length) && rows.length < maxRows) rows.push([...row, cell]);
  return rows;
}

/** Plain text, Markdown source, JSON and CSV. Text is rendered as TEXT (React-escaped), never as HTML. */
export function TextViewer({
  url,
  kind,
  name,
}: {
  url: string;
  kind: 'text' | 'csv';
  name: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error('fetch failed');
        const buf = await r.arrayBuffer();
        if (cancelled) return;
        setTruncated(buf.byteLength > MAX_BYTES);
        setText(new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_BYTES)));
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error)
    return (
      <p role="alert" className="p-6 text-center text-sm text-danger">
        The file could not be loaded.
      </p>
    );
  if (text === null) return <Skeleton className="h-96 w-full" />;

  const note = truncated ? (
    <p className="px-3 py-1 text-xs text-muted">Showing the first {MAX_BYTES / 1024 / 1024} MB.</p>
  ) : null;

  if (kind === 'csv') {
    const rows = parseCsv(text);
    return (
      <div
        className="max-h-[72vh] overflow-auto rounded-md border border-line bg-surface"
        data-testid="csv-viewer"
        aria-label={`Table preview of ${name}`}
      >
        {note}
        <table className="min-w-full border-collapse text-[13px]">
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={
                  i === 0 ? 'sticky top-0 bg-surface-2 font-medium' : 'odd:bg-surface-2/40'
                }
              >
                <td className="w-10 border border-line px-2 py-1 text-right text-xs text-faint">
                  {i + 1}
                </td>
                {r.map((c, j) => (
                  <td key={j} className="border border-line px-2 py-1 whitespace-pre-wrap">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length >= MAX_ROWS && (
          <p className="px-3 py-1 text-xs text-muted">Showing the first {MAX_ROWS} rows.</p>
        )}
      </div>
    );
  }

  const lines = text.split('\n');
  return (
    <div
      className="max-h-[72vh] overflow-auto rounded-md border border-line bg-surface"
      data-testid="text-viewer"
      aria-label={`Text preview of ${name}`}
    >
      {note}
      <pre className="grid grid-cols-[auto_1fr] gap-x-3 p-3 font-mono text-[13px] leading-5">
        {lines.map((l, i) => (
          <span key={i} className="contents">
            <span className="text-right text-faint select-none">{i + 1}</span>
            <span className="whitespace-pre-wrap break-words">{l || ' '}</span>
          </span>
        ))}
      </pre>
    </div>
  );
}
