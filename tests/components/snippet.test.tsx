import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Snippet, snippetParts } from '@/features/search/snippet';

describe('search snippet rendering', () => {
  it('wraps [[matches]] in <mark> and keeps the rest as plain text', () => {
    const { container } = render(<Snippet text="the quick [[brown]] fox and [[dog]]" />);
    const marks = container.querySelectorAll('mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['brown', 'dog']);
    expect(screen.getByTestId('snippet')).toHaveTextContent('the quick brown fox and dog');
  });

  it('never interprets HTML: payloads are escaped text, no elements are created', () => {
    const evil = '<img src=x onerror="alert(1)"> [[<script>alert(2)</script>]] <b>bold</b>';
    const { container } = render(<Snippet text={evil} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')!.textContent).toBe('<script>alert(2)</script>');
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('tolerates unbalanced or empty markers', () => {
    expect(snippetParts('a [[b')).toEqual([{ text: 'a [[b', match: false }]);
    expect(snippetParts('[[]]x')).toEqual([{ text: 'x', match: false }]);
    expect(snippetParts('')).toEqual([]);
  });
});
