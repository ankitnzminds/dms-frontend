'use client';

import {
  Bot,
  ClipboardPaste,
  Copy,
  Download,
  FolderPlus,
  FolderUp,
  Info,
  LayoutGrid,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { DisabledReason } from '@/components/ui/tooltip';
import type { MenuEntry } from '@/features/explorer/menu';
import {
  ALL_COLUMNS,
  type ColumnId,
  type ViewMode,
  type ViewPrefs,
} from '@/features/explorer/prefs';
import type { SortKey } from '@/features/files/hooks';

export interface ToolbarState {
  canCreate: boolean;
  hasSelection: boolean;
  single: boolean;
  /** Reasons (null = enabled) */
  cut: string | null;
  copy: string | null;
  paste: string | null;
  rename: string | null;
  share: string | null;
  download: string | null;
  del: string | null;
  createReason: string | null;
}

const VIEWS: [ViewMode, string][] = [
  ['details', 'Details'],
  ['compact', 'Compact list'],
  ['tiles', 'Tiles'],
  ['grid', 'Large icons'],
];
const SORTS: [SortKey, string][] = [
  ['name', 'Name'],
  ['type', 'Type'],
  ['updated_at', 'Modified'],
  ['modified_by', 'Modified by'],
  ['size', 'Size'],
];

function Btn({
  reason,
  icon: Icon,
  label,
  onClick,
  testId,
  variant = 'ghost',
}: {
  reason: string | null;
  icon: React.ComponentType;
  label: string;
  onClick: () => void;
  testId: string;
  variant?: 'ghost' | 'secondary' | 'primary';
}) {
  return (
    <DisabledReason reason={reason}>
      <Button
        size="sm"
        variant={variant}
        disabled={!!reason}
        onClick={onClick}
        data-testid={testId}
        aria-label={label}
      >
        <Icon />
        <span className="hidden xl:inline">{label}</span>
      </Button>
    </DisabledReason>
  );
}

/** Toolbar: every button is wired to a real operation; unavailable ones are disabled with a reason. */
export function ExplorerToolbar({
  st,
  prefs,
  onPrefs,
  onAction,
  onSearch,
  propertiesOpen,
  selectionCount,
  onAsk,
}: {
  st: ToolbarState;
  prefs: ViewPrefs;
  onPrefs: (p: Partial<ViewPrefs>) => void;
  onAction: (
    a:
      | 'new-folder'
      | 'upload-files'
      | 'upload-folder'
      | 'cut'
      | 'copy'
      | 'paste'
      | 'rename'
      | 'share'
      | 'download'
      | 'delete'
      | 'refresh'
      | 'properties',
  ) => void;
  onSearch: (q: string) => void;
  propertiesOpen: boolean;
  selectionCount: number;
  /** Opens the assistant about this folder (only passed when the assistant is enabled). */
  onAsk?: () => void;
}) {
  const [q, setQ] = useState('');
  return (
    <div
      role="toolbar"
      aria-label="File manager toolbar"
      className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1.5"
    >
      <Btn
        reason={st.createReason}
        icon={FolderPlus}
        label="New folder"
        onClick={() => onAction('new-folder')}
        testId="tb-new-folder"
      />
      <DropdownMenu>
        <DisabledReason reason={st.createReason}>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="primary"
              disabled={!!st.createReason}
              aria-label="Upload"
              data-testid="tb-upload"
            >
              <Upload /> Upload
            </Button>
          </DropdownMenuTrigger>
        </DisabledReason>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onAction('upload-files')} data-testid="tb-upload-files">
            <Upload /> Files…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onAction('upload-folder')}
            data-testid="tb-upload-folder"
          >
            <FolderUp /> Folder…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Btn
        reason={st.cut}
        icon={Scissors}
        label="Cut"
        onClick={() => onAction('cut')}
        testId="tb-cut"
      />
      <Btn
        reason={st.copy}
        icon={Copy}
        label="Copy"
        onClick={() => onAction('copy')}
        testId="tb-copy"
      />
      <Btn
        reason={st.paste}
        icon={ClipboardPaste}
        label="Paste"
        onClick={() => onAction('paste')}
        testId="tb-paste"
      />
      <Btn
        reason={st.rename}
        icon={Pencil}
        label="Rename"
        onClick={() => onAction('rename')}
        testId="tb-rename"
      />
      <Btn
        reason={st.share}
        icon={Share2}
        label="Share"
        onClick={() => onAction('share')}
        testId="tb-share"
      />
      <Btn
        reason={st.download}
        icon={Download}
        label="Download"
        onClick={() => onAction('download')}
        testId="tb-download"
      />
      <Btn
        reason={st.del}
        icon={Trash2}
        label="Delete"
        onClick={() => onAction('delete')}
        testId="tb-delete"
      />
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <Btn
        reason={null}
        icon={RefreshCw}
        label="Refresh"
        onClick={() => onAction('refresh')}
        testId="tb-refresh"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="View options" data-testid="tb-view">
            <LayoutGrid /> <span className="hidden xl:inline">View</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>View</DropdownMenuLabel>
          {VIEWS.map(([v, l]) => (
            <DropdownMenuItem
              key={v}
              onSelect={() => onPrefs({ view: v })}
              role="menuitemradio"
              aria-checked={prefs.view === v}
            >
              <span className="w-4">{prefs.view === v ? '•' : ''}</span> {l}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          {SORTS.map(([k, l]) => (
            <DropdownMenuItem
              key={k}
              onSelect={() =>
                onPrefs(
                  prefs.sort === k
                    ? { order: prefs.order === 'asc' ? 'desc' : 'asc' }
                    : { sort: k, order: 'asc' },
                )
              }
              role="menuitemradio"
              aria-checked={prefs.sort === k}
            >
              <span className="w-4">
                {prefs.sort === k ? (prefs.order === 'asc' ? '↑' : '↓') : ''}
              </span>{' '}
              {l}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Columns (Details)</DropdownMenuLabel>
          {ALL_COLUMNS.map((c) => {
            const on = prefs.columns.includes(c.id);
            return (
              <DropdownMenuItem
                key={c.id}
                onSelect={(e) => {
                  e.preventDefault();
                  const next: ColumnId[] = on
                    ? prefs.columns.filter((x) => x !== c.id)
                    : [...prefs.columns, c.id];
                  onPrefs({ columns: next });
                }}
                role="menuitemcheckbox"
                aria-checked={on}
              >
                <span className="w-4">{on ? '✓' : ''}</span> {c.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        variant={propertiesOpen ? 'secondary' : 'ghost'}
        aria-pressed={propertiesOpen}
        aria-label="Properties"
        onClick={() => onAction('properties')}
        data-testid="tb-properties"
      >
        <Info /> <span className="hidden xl:inline">Properties</span>
      </Button>

      {onAsk && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onAsk}
          aria-label="Ask about this folder"
          data-testid="tb-ask"
        >
          <Bot /> <span className="hidden xl:inline">Ask</span>
        </Button>
      )}
      <form
        role="search"
        className="relative ml-auto w-full sm:w-56"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onSearch(q.trim());
        }}
      >
        <Search
          className="pointer-events-none absolute left-2 top-2 size-4 text-faint"
          aria-hidden
        />
        <Input
          aria-label="Search in this folder"
          placeholder="Search in this folder"
          className="h-8 pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      {selectionCount > 0 && (
        <span
          className="px-2 text-[13px] font-medium text-accent-soft-fg"
          aria-live="polite"
          data-testid="selection-count"
        >
          {selectionCount} selected
        </span>
      )}
    </div>
  );
}

export type { MenuEntry };
