import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PathTrail, pathText } from '@/components/navigation/path-trail';

const segs = [
  { folder_id: 'root', name: 'Organization Files', navigable: true },
  { folder_id: null, name: 'dir1', navigable: false },
  { folder_id: 'x', name: 'dirB', navigable: false }, // even with an id, non-navigable must not link
];

describe('PathTrail', () => {
  it('renders navigable segments as links and non-navigable ones as plain text', () => {
    render(<PathTrail segments={segs} current="report.pdf" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/files/root');
    expect(links[0]).toHaveTextContent('Organization Files');

    for (const name of ['dir1', 'dirB']) {
      expect(screen.queryByRole('link', { name: new RegExp(name) })).toBeNull();
      expect(screen.getByText(name).closest('[data-navigable="false"]')).not.toBeNull();
    }
    expect(screen.getByText('report.pdf')).toHaveAttribute('aria-current', 'page');
  });

  it('never links a segment that has no folder_id even if flagged navigable', () => {
    render(<PathTrail segments={[{ folder_id: null, name: 'weird', navigable: true }]} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders masked segment names as an ellipsis and exposes a plain-text path', () => {
    const masked = [{ folder_id: null, name: null, navigable: false }];
    const { container } = render(<PathTrail segments={masked} current="x" />);
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(container.querySelector('nav')).toHaveAttribute('data-path', '… > x');
    expect(pathText(segs)).toBe('Organization Files > dir1 > dirB');
  });
});
