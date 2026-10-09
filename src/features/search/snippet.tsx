import type { ReactNode } from 'react';

/**
 * Search snippets are PLAIN TEXT with matched terms wrapped in [[ ]]. We split on the markers and
 * render matches as <mark>; everything else is a React text node (escaped by React). Never innerHTML.
 */
export function snippetParts(text: string): Array<{ text: string; match: boolean }> {
  const parts: Array<{ text: string; match: boolean }> = [];
  let rest = text;
  while (rest.length) {
    const open = rest.indexOf('[[');
    if (open === -1) {
      parts.push({ text: rest, match: false });
      break;
    }
    const close = rest.indexOf(']]', open + 2);
    if (close === -1) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), match: false });
    const inner = rest.slice(open + 2, close);
    if (inner) parts.push({ text: inner, match: true });
    rest = rest.slice(close + 2);
  }
  return parts;
}

export function Snippet({ text }: { text: string }): ReactNode {
  return (
    <span data-testid="snippet">
      {snippetParts(text).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-warn-soft px-0.5 text-warn">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
