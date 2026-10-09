import { isPreviewable } from '@/features/preview/kinds';
import { can } from '@/lib/permissions';

export type ItemAction =
  | 'open'
  | 'preview'
  | 'download'
  | 'rename'
  | 'move'
  | 'copy'
  | 'star'
  | 'share'
  | 'access'
  | 'delete';

export interface ActionItem {
  kind: 'folder' | 'document';
  id: string;
  name: string;
  permissions: readonly string[];
  starred?: boolean;
  status?: string | null;
  content_type?: string | null;
}

export interface Availability {
  enabled: boolean;
  /** Shown as a tooltip when disabled. */
  reason?: string;
}

/** Kept for existing callers; Office files are previewable too (the viewer decides how). */
export const isPreviewableType = (ct: string | null | undefined, name?: string | null) =>
  isPreviewable(ct, name);

const NO = (reason: string): Availability => ({ enabled: false, reason });
const YES: Availability = { enabled: true };

/** Single source of truth for which row actions are usable. Driven by the API `permissions` array. */
export function itemAvailability(item: ActionItem): Record<ItemAction, Availability> {
  const p = item.permissions;
  const isDoc = item.kind === 'document';
  const ready = !isDoc || item.status === 'available';
  const notReady = isDoc
    ? item.status === 'processing'
      ? 'This file is still being scanned.'
      : item.status === 'quarantined'
        ? 'This file was quarantined by the malware scan.'
        : 'This file is not available.'
    : '';
  return {
    open: can(p, 'view') || can(p, 'discover') ? YES : NO('You do not have access to open this.'),
    preview: !isDoc
      ? NO('Folders cannot be previewed.')
      : !can(p, 'preview')
        ? NO('You do not have permission to preview this file.')
        : !ready
          ? NO(notReady)
          : item.content_type && !isPreviewableType(item.content_type, item.name)
            ? NO('This file type cannot be previewed. Download it instead.')
            : YES,
    download: !isDoc
      ? NO('Folder download is not available.')
      : !can(p, 'download')
        ? NO('You do not have permission to download this file.')
        : !ready
          ? NO(notReady)
          : YES,
    rename: can(p, 'rename') ? YES : NO('You do not have permission to rename this.'),
    move: can(p, 'move') ? YES : NO('You do not have permission to move this.'),
    copy: !isDoc
      ? NO('Copying folders is not available.')
      : can(p, 'copy')
        ? ready
          ? YES
          : NO(notReady)
        : NO('You do not have permission to copy this file.'),
    star: YES,
    share: can(p, 'share')
      ? ready
        ? YES
        : NO(notReady)
      : NO('You do not have permission to share this.'),
    access: can(p, 'manage_access') ? YES : NO('You need the manage access permission.'),
    delete: can(p, 'delete') ? YES : NO('You do not have permission to delete this.'),
  };
}
