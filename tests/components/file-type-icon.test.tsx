import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceActionsProvider } from '@/components/explorer/resource-actions';
import { ItemsTable } from '@/components/file-browser/items-table';
import { SidebarPreview } from '@/components/navigation/folder-tree';
import { ItemIcon } from '@/components/file-browser/file-bits';
import type { TreeItem } from '@/lib/api-client';
import { renderApp } from './test-utils';

const svgOf = (ui: React.ReactElement) => render(ui).container.querySelector('svg')!.outerHTML;

describe('file type icons are the same everywhere', () => {
  it('same type → identical icon; different types → different icons', () => {
    const a = svgOf(<ItemIcon kind="document" name="a.docx" />);
    const b = svgOf(<ItemIcon kind="document" name="Quarterly.Report.DOC" />);
    const c = svgOf(
      <ItemIcon
        kind="document"
        name="x"
        contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />,
    );
    expect(a).toBe(b);
    expect(a).toBe(c);
    const kinds = [
      'a.pdf',
      'a.docx',
      'a.xlsx',
      'a.pptx',
      'a.png',
      'a.txt',
      'a.zip',
      'a.mp3',
      'a.mp4',
      'a.json',
      'a.bin',
    ].map((n) => svgOf(<ItemIcon kind="document" name={n} />));
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(svgOf(<ItemIcon kind="folder" />)).not.toBe(kinds[0]);
  });

  it('a list, a sidebar preview and a table render the same icon for the same file', () => {
    const t = {
      id: 'x1',
      kind: 'document',
      name: 'Budget.v3.XLSX',
      content_type: 'application/vnd.ms-excel',
      updated_at: new Date().toISOString(),
      permissions: ['view'],
      starred: false,
      locked: false,
      locked_by_me: false,
      is_team_folder: false,
      status: 'available',
      size_bytes: 10,
    } as TreeItem;
    const expected = svgOf(
      <ItemIcon kind="document" name={t.name} contentType={t.content_type} size={16} />,
    );

    const side = render(
      <SidebarPreview items={[t]} total={1} label="x" testId="x" viewAllHref="/x" />,
    );
    expect(side.container.querySelector('svg')!.outerHTML).toBe(expected);

    const tbl = renderApp(
      <ResourceActionsProvider>
        <ItemsTable caption="t" items={[t]} isLoading={false} emptyState={null} />
      </ResourceActionsProvider>,
    );
    const nameSvg = tbl.container.querySelector('tbody td svg')!;
    // the table uses the default 20px size; compare the colour band instead of the pixel size
    expect(nameSvg.innerHTML).toBe(
      render(<ItemIcon kind="document" name={t.name} />).container.querySelector('svg')!.innerHTML,
    );
  });
});
