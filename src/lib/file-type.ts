/**
 * The single place that decides what kind of file something is. Every list, tree, preview and share view
 * shows icons through this, so the same file always gets the same icon.
 *
 * The file extension wins when it is one we know (case-insensitive, last dot only, so
 * "Report.FINAL.v2.XLSX" is a spreadsheet); otherwise the MIME type decides.
 */

export type FileKind =
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'image'
  | 'archive'
  | 'text'
  | 'code'
  | 'audio'
  | 'video'
  | 'generic';

const BY_EXTENSION: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  docm: 'doc',
  dot: 'doc',
  dotx: 'doc',
  odt: 'doc',
  rtf: 'doc',
  xls: 'sheet',
  xlsx: 'sheet',
  xlsm: 'sheet',
  ods: 'sheet',
  csv: 'sheet',
  tsv: 'sheet',
  ppt: 'slide',
  pptx: 'slide',
  pptm: 'slide',
  odp: 'slide',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  bmp: 'image',
  tif: 'image',
  tiff: 'image',
  ico: 'image',
  heic: 'image',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  log: 'text',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
  gz: 'archive',
  tgz: 'archive',
  tar: 'archive',
  bz2: 'archive',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  flac: 'audio',
  ogg: 'audio',
  aac: 'audio',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',
  wmv: 'video',
  json: 'code',
  xml: 'code',
  yml: 'code',
  yaml: 'code',
  html: 'code',
  htm: 'code',
  css: 'code',
  js: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  py: 'code',
  sql: 'code',
  sh: 'code',
};

/** Lower-case extension after the last dot ("" when there is none; a leading-dot name has none). */
export function extensionOf(name?: string | null): string {
  const n = (name ?? '').trim();
  const i = n.lastIndexOf('.');
  return i > 0 && i < n.length - 1 ? n.slice(i + 1).toLowerCase() : '';
}

function byMime(raw?: string | null): FileKind {
  const ct = (raw ?? '').split(';')[0]!.trim().toLowerCase();
  if (!ct) return 'generic';
  if (ct === 'application/pdf') return 'pdf';
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('audio/')) return 'audio';
  if (ct.startsWith('video/')) return 'video';
  if (ct.includes('spreadsheet') || ct.includes('excel') || ct === 'text/csv') return 'sheet';
  if (ct.includes('presentation') || ct.includes('powerpoint')) return 'slide';
  if (ct.includes('wordprocessing') || ct.includes('msword') || ct === 'application/rtf')
    return 'doc';
  if (ct === 'application/zip' || ct.includes('compressed') || ct.endsWith('/x-tar')) return 'archive';
  if (ct.includes('7z') || ct.includes('rar') || ct.includes('gzip')) return 'archive';
  if (
    ct === 'application/json' ||
    ct.endsWith('+json') ||
    ct.endsWith('/xml') ||
    ct.endsWith('+xml') ||
    ct.includes('yaml') ||
    ct.includes('javascript')
  )
    return 'code';
  if (ct === 'text/html' || ct === 'text/css') return 'code';
  if (ct.startsWith('text/')) return 'text';
  return 'generic';
}

export function fileKind(contentType?: string | null, name?: string | null): FileKind {
  return BY_EXTENSION[extensionOf(name)] ?? byMime(contentType);
}

/** Short label shown inside large icons. */
export const FILE_KIND_LABEL: Record<FileKind, string> = {
  pdf: 'PDF',
  doc: 'DOC',
  sheet: 'XLS',
  slide: 'PPT',
  image: 'IMG',
  archive: 'ZIP',
  text: 'TXT',
  code: 'CODE',
  audio: 'AUDIO',
  video: 'VIDEO',
  generic: 'FILE',
};
