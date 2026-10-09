import type { Me, Role } from './api-client/types';

export type Perms = readonly string[] | null | undefined;

/** True when the server-provided `permissions` array contains the action. UI hint only. */
export function can(perms: Perms, action: string): boolean {
  return !!perms && perms.includes(action);
}

export const isAdminRole = (role: Role | null | undefined) => role === 'owner' || role === 'admin';
export const canReadAudit = (me: Me | undefined) =>
  !!me && (me.capabilities.includes('read_audit') || isAdminRole(me.role) || me.role === 'auditor');

export const SHAREABLE_ACTIONS = [
  'view',
  'preview',
  'download',
  'upload_version',
  'edit_metadata',
  'rename',
  'comment',
] as const;

export const ACTION_LABELS: Record<string, string> = {
  view: 'View',
  preview: 'Preview',
  download: 'Download',
  upload_version: 'Upload versions',
  edit_metadata: 'Edit details',
  rename: 'Rename',
  comment: 'Comment',
  create_child: 'Create items inside',
  delete: 'Delete',
  move: 'Move',
  copy: 'Copy',
  share: 'Share',
  manage_access: 'Manage access',
  administer: 'Administer',
};

export function actionLabel(a: string) {
  return ACTION_LABELS[a] ?? a.replace(/_/g, ' ');
}
