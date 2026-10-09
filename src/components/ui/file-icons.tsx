import { cn } from '@/lib/utils';

export type FileKind =
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'image'
  | 'archive'
  | 'text'
  | 'code'
  | 'media'
  | 'generic';

const META: Record<FileKind, { color: string; label: string }> = {
  pdf: { color: 'var(--ft-pdf)', label: 'PDF' },
  doc: { color: 'var(--ft-doc)', label: 'DOC' },
  sheet: { color: 'var(--ft-sheet)', label: 'XLS' },
  slide: { color: 'var(--ft-slide)', label: 'PPT' },
  image: { color: 'var(--ft-image)', label: 'IMG' },
  archive: { color: 'var(--ft-archive)', label: 'ZIP' },
  text: { color: 'var(--ft-text)', label: 'TXT' },
  code: { color: 'var(--ft-code)', label: 'CODE' },
  media: { color: 'var(--ft-image)', label: 'MEDIA' },
  generic: { color: 'var(--ft-generic)', label: 'FILE' },
};

/** Classify a file by content type and (as a fallback) extension. */
export function fileKind(contentType?: string | null, name?: string | null): FileKind {
  const ct = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = (name ?? '').includes('.') ? name!.split('.').pop()!.toLowerCase() : '';
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ct.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (ct.includes('spreadsheet') || ct.includes('excel') || ct === 'text/csv' || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'sheet';
  if (ct.includes('presentation') || ct.includes('powerpoint') || ['ppt', 'pptx', 'odp'].includes(ext)) return 'slide';
  if (ct.includes('word') || ct.includes('msword') || ct.includes('opendocument.text') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (ct.includes('zip') || ct.includes('compressed') || ct.includes('tar') || ['zip', 'gz', 'tar', '7z', 'rar'].includes(ext)) return 'archive';
  if (ct.startsWith('audio/') || ct.startsWith('video/') || ['mp3', 'mp4', 'mov', 'wav'].includes(ext)) return 'media';
  if (ct === 'application/json' || ct.includes('xml') || ct.includes('javascript') || ['json', 'xml', 'js', 'ts', 'py', 'html', 'css', 'yml', 'yaml'].includes(ext)) return 'code';
  if (ct.startsWith('text/') || ['txt', 'md', 'log'].includes(ext)) return 'text';
  return 'generic';
}

export const fileKindLabel = (k: FileKind) => META[k].label;

/** Two-tone amber folder. Decorative: always pair it with the item's name. */
export function FolderGlyph({ size = 20, className, shared }: { size?: number; className?: string; shared?: boolean }) {
  return (
    <svg width={size} height={(size * 28) / 32} viewBox="0 0 32 28" aria-hidden className={cn('shrink-0', className)}>
      <path d="M2 5a3 3 0 0 1 3-3h7.2a2 2 0 0 1 1.5.7L16 5h11a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5Z" fill="var(--ft-folder-back)" />
      <rect x="2" y="9" width="28" height="17" rx="3" fill="var(--ft-folder)" />
      <path d="M2 12.5C2 10.6 3.6 9 5.5 9h21c1.9 0 3.5 1.6 3.5 3.5V13H2v-.5Z" fill="#fff" opacity=".22" />
      {shared && <circle cx="24" cy="18.5" r="3.2" fill="#fff" opacity=".9" />}
    </svg>
  );
}

/** Document glyph: a page with a folded corner and a colour band that names the type. */
export function FileGlyph({
  kind,
  size = 20,
  className,
  showLabel,
}: {
  kind: FileKind;
  size?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const m = META[kind];
  const label = showLabel ?? size >= 36;
  return (
    <svg width={(size * 32) / 40} height={size} viewBox="0 0 32 40" aria-hidden className={cn('shrink-0', className)}>
      <path d="M5 2h14l9 9v25a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="var(--surface)" stroke={m.color} strokeWidth="2" />
      <path d="M19 2v7a2 2 0 0 0 2 2h7" fill="none" stroke={m.color} strokeWidth="2" strokeLinejoin="round" />
      <rect x="3" y="21" width="25" height="12" rx="1" fill={m.color} />
      {label && (
        <text x="15.5" y="30" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="var(--font-sans), system-ui, sans-serif">
          {m.label}
        </text>
      )}
    </svg>
  );
}

export function TypeIcon({
  kind,
  contentType,
  name,
  size = 20,
  className,
  shared,
}: {
  kind: 'folder' | 'document';
  contentType?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  shared?: boolean;
}) {
  return kind === 'folder' ? (
    <FolderGlyph size={size} className={className} shared={shared} />
  ) : (
    <FileGlyph kind={fileKind(contentType, name)} size={size} className={className} />
  );
}
