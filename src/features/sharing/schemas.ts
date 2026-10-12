import { z } from 'zod';
import type { ActionName, ShareCreate } from '@/lib/api-client';

export const PRESETS = {
  viewer: {
    label: 'Viewer',
    hint: 'Can view, preview and download. Cannot comment',
    actions: ['view', 'preview', 'download'],
  },
  commenter: {
    label: 'Commenter',
    hint: 'Viewer, and can comment',
    actions: ['view', 'preview', 'download', 'comment'],
  },
  editor: {
    label: 'Editor',
    hint: 'Commenter, and can upload new versions, edit details and rename',
    actions: [
      'view',
      'preview',
      'download',
      'comment',
      'upload_version',
      'edit_metadata',
      'rename',
    ],
  },
  custom: { label: 'Custom', hint: 'Pick individual permissions', actions: [] as ActionName[] },
} as const;
export type PresetKey = keyof typeof PRESETS;

export const EXPIRY_PRESETS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'custom', label: 'Pick a date' },
  { value: 'none', label: 'No expiry' },
] as const;

const emailSchema = z.string().email();
export const isEmail = (s: string) => emailSchema.safeParse(s.trim()).success;

export const shareFormSchema = z
  .object({
    emails: z.array(z.string()),
    groupIds: z.array(z.string()),
    preset: z.enum(['viewer', 'commenter', 'editor', 'custom']),
    customActions: z.array(z.string()),
    expiry: z.enum(['7', '30', '90', 'custom', 'none']),
    customDate: z.string(),
    message: z.string().max(1000, 'Use 1000 characters or fewer'),
  })
  .superRefine((v, ctx) => {
    if (v.emails.length + v.groupIds.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['emails'],
        message: 'Add at least one person or group',
      });
    if (v.preset === 'custom' && v.customActions.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['customActions'],
        message: 'Choose at least one permission',
      });
    if (v.expiry === 'custom') {
      if (!v.customDate)
        ctx.addIssue({ code: 'custom', path: ['customDate'], message: 'Choose an expiry date' });
      else if (endOfLocalDay(v.customDate).getTime() <= Date.now())
        ctx.addIssue({
          code: 'custom',
          path: ['customDate'],
          message: 'Choose a date in the future',
        });
    }
  });
export type ShareFormValues = z.infer<typeof shareFormSchema>;

export function endOfLocalDay(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
}

export function actionsFor(v: Pick<ShareFormValues, 'preset' | 'customActions'>): ActionName[] {
  const base: ActionName[] =
    v.preset === 'custom' ? (v.customActions as ActionName[]) : [...PRESETS[v.preset].actions];
  // view is required for any access to be meaningful
  return base.length && !base.includes('view') ? ['view', ...base] : base;
}

export function expiryIso(
  v: Pick<ShareFormValues, 'expiry' | 'customDate'>,
  now = Date.now(),
): string | null {
  if (v.expiry === 'none') return null;
  if (v.expiry === 'custom') return endOfLocalDay(v.customDate).toISOString();
  return new Date(now + Number(v.expiry) * 86400000).toISOString();
}

/** Pure mapping from form state to the API request body. */
export function buildShareRequest(v: ShareFormValues, now = Date.now()): ShareCreate {
  return {
    recipients: [
      ...v.emails.map((email) => ({ type: 'user' as const, email: email.trim().toLowerCase() })),
      ...v.groupIds.map((id) => ({ type: 'group' as const, id })),
    ],
    actions: actionsFor(v),
    expires_at: expiryIso(v, now),
    message: v.message.trim() || null,
  };
}

/** Human access level for a set of granted actions: the highest preset fully contained, else Custom. */
export function accessLevel(
  actions: readonly string[],
): 'Editor' | 'Commenter' | 'Viewer' | 'Custom' {
  const has = (a: readonly string[]) => a.every((x) => actions.includes(x));
  if (has(PRESETS.editor.actions)) return 'Editor';
  if (has(PRESETS.commenter.actions)) return 'Commenter';
  if (has(PRESETS.viewer.actions)) return 'Viewer';
  return 'Custom';
}
