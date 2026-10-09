'use client';

import {
  Bot,
  ClipboardPaste,
  Columns3,
  Copy,
  Download,
  FilePlus2,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Scissors,
  Search,
  Share2,
  Trash2,
  X,
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
import {
  ALL_COLUMNS,
  type ColumnId,
  type ViewMode,
  type ViewPrefs,
} from '@/features/explorer/prefs';
import type { SortKey } from '@/features/files/hooks';
import { cn } from '@/lib/utils';

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

export type ToolbarAction =
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
  | 'properties'
  | 'clear-selection';

const VIEWS: [ViewMode, string, typeof List][] = [
  ['details', 'List', List],
  ['compact', 'Compact list', Rows3],
  ['tiles', 'Medium grid', LayoutGrid],
  ['grid', 'Large grid', LayoutGrid],
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
        <span className="hidden lg:inline">{label}</span>
      </Button>
    </DisabledReason>
  );
}

function ViewMenu({
  prefs,
  onPrefs,
}: {
  prefs: ViewPrefs;
  onPrefs: (p: Partial<ViewPrefs>) => void;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="View and sort" data-testid="tb-view">
            <LayoutGrid />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>View</DropdownMenuLabel>
          {VIEWS.map(([v, l, Icon]) => (
            <DropdownMenuItem
              key={v}
              onSelect={() => onPrefs({ view: v })}
              role="menuitemradio"
              aria-checked={prefs.view === v}
              className={cn(prefs.view === v && 'font-medium text-accent')}
            >
              <Icon /> {l}
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
              <span className="w-4 text-center">
                {prefs.sort === k ? (prefs.order === 'asc' ? '↑' : '↓') : ''}
              </span>
              {l}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Choose columns" data-testid="tb-columns">
            <Columns3 />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Columns (list view)</DropdownMenuLabel>
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
                <span className="w-4 text-center">{on ? '✓' : ''}</span> {c.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * Page header and command bar of the file manager: title + item count, the primary "Add" menu, view /
 * columns / details toggles, and (only while something is selected) a selection bar with bulk actions.
 * Every button is wired to a real operation; unavailable ones are disabled with a reason.
 */
export function ExplorerHeader({
  title,
  trail,
  badges,
  itemCount,
  st,
  prefs,
  onPrefs,
  onAction,
  onSearch,
  propertiesOpen,
  selectionCount,
  hasClipboard,
  onAsk,
}: {
  title: React.ReactNode;
  trail?: React.ReactNode;
  badges?: React.ReactNode;
  itemCount: number | null;
  st: ToolbarState;
  prefs: ViewPrefs;
  onPrefs: (p: Partial<ViewPrefs>) => void;
  onAction: (a: ToolbarAction) => void;
  onSearch: (q: string) => void;
  propertiesOpen: boolean;
  selectionCount: number;
  hasClipboard: boolean;
  /** Opens the assistant about this folder (only passed when the assistant is enabled). */
  onAsk?: () => void;
}) {
  const [q, setQ] = useState('');
  return (
    <header className="mb-3">
      {trail && <div className="mb-1.5 text-[13px]">{trail}</div>}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 truncate text-2xl font-semibold tracking-tight">
            {title} {badges}
          </h1>
          <p className="mt-0.5 text-xs text-muted" data-testid="item-count">
            {itemCount === null ? ' ' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DisabledReason reason={st.createReason}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="primary"
                  disabled={!!st.createReason}
                  aria-label="Add files and folders"
                  data-testid="tb-upload"
                >
                  <Plus /> Add files and folders
                </Button>
              </DropdownMenuTrigger>
            </DisabledReason>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => onAction('upload-files')}
                data-testid="tb-upload-files"
              >
                <FilePlus2 /> Upload files
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onAction('upload-folder')}
                data-testid="tb-upload-folder"
              >
                <FolderUp /> Upload folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onAction('new-folder')}
                data-testid="tb-new-folder"
              >
                <FolderPlus /> New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onAsk && (
            <Button variant="secondary" onClick={onAsk} data-testid="tb-ask" aria-label="Ask about this folder">
              <Bot /> <span className="hidden sm:inline">Ask</span>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Refresh"
            onClick={() => onAction('refresh')}
            data-testid="tb-refresh"
          >
            <RefreshCw />
          </Button>
          <ViewMenu prefs={prefs} onPrefs={onPrefs} />
          <Button
            size="icon"
            variant={propertiesOpen ? 'secondary' : 'ghost'}
            aria-pressed={propertiesOpen}
            aria-label="Details pane"
            onClick={() => onAction('properties')}
            data-testid="tb-properties"
          >
            <PanelRight />
          </Button>
        </div>
      </div>

      <div
        role="toolbar"
        aria-label="File manager toolbar"
        className={cn(
          'mt-3 flex min-h-11 flex-wrap items-center gap-1 rounded-lg border px-2 py-1.5',
          selectionCount > 0 ? 'border-accent/40 bg-accent-soft' : 'border-line bg-surface',
        )}
      >
        {selectionCount > 0 ? (
          <>
            <span
              className="px-2 text-[13px] font-semibold text-accent-soft-fg"
              aria-live="polite"
              data-testid="selection-count"
            >
              {selectionCount} selected
            </span>
            <Btn reason={st.download} icon={Download} label="Download" onClick={() => onAction('download')} testId="tb-download" />
            <Btn reason={st.share} icon={Share2} label="Share" onClick={() => onAction('share')} testId="tb-share" />
            <Btn reason={st.copy} icon={Copy} label="Copy" onClick={() => onAction('copy')} testId="tb-copy" />
            <Btn reason={st.cut} icon={Scissors} label="Cut" onClick={() => onAction('cut')} testId="tb-cut" />
            <Btn reason={st.rename} icon={Pencil} label="Rename" onClick={() => onAction('rename')} testId="tb-rename" />
            <Btn reason={st.del} icon={Trash2} label="Delete" onClick={() => onAction('delete')} testId="tb-delete" />
            {hasClipboard && (
              <Btn reason={st.paste} icon={ClipboardPaste} label="Paste" onClick={() => onAction('paste')} testId="tb-paste" />
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="ml-auto"
              aria-label="Clear selection"
              onClick={() => onAction('clear-selection')}
            >
              <X />
            </Button>
          </>
        ) : (
          <>
            {hasClipboard && (
              <Btn reason={st.paste} icon={ClipboardPaste} label="Paste" onClick={() => onAction('paste')} testId="tb-paste" variant="secondary" />
            )}
            <form
              role="search"
              className="relative ml-auto w-full sm:w-72"
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
          </>
        )}
      </div>
    </header>
  );
}
