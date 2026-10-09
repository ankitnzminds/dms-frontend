/** What kind of viewer a file needs. Single source of truth (listing availability + the viewer). */
export type PreviewKind = 'pdf' | 'office' | 'image' | 'text' | 'csv' | 'unsupported';

const OFFICE_EXT = new Set([
  'doc',
  'docx',
  'dot',
  'dotx',
  'xls',
  'xlsx',
  'xlt',
  'xltx',
  'ppt',
  'pptx',
  'pot',
  'potx',
  'pps',
  'ppsx',
  'odt',
  'ods',
  'odp',
  'rtf',
]);
const TEXT_TYPES = /^(text\/(plain|markdown)|application\/json)$/i;
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)$/i;

export const extensionOf = (name: string | null | undefined) =>
  (name ?? '').split('.').pop()?.toLowerCase() ?? '';

/** Extension wins for Office files (browsers often send a generic type); the MIME type decides the rest. */
export function previewKind(
  contentType: string | null | undefined,
  name?: string | null,
): PreviewKind {
  const ct = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  if (
    OFFICE_EXT.has(extensionOf(name)) ||
    /officedocument|ms-(word|excel|powerpoint)|msword|opendocument|rtf/.test(ct)
  )
    return 'office';
  if (ct === 'application/pdf') return 'pdf';
  if (IMAGE_TYPES.test(ct)) return 'image';
  if (ct === 'text/csv') return 'csv';
  if (TEXT_TYPES.test(ct) || ct.startsWith('text/')) return 'text';
  return 'unsupported';
}

export const isPreviewable = (contentType: string | null | undefined, name?: string | null) =>
  previewKind(contentType, name) !== 'unsupported';
