import { describe, expect, it } from 'vitest';
import { auditToCsv } from '@/features/admin/audit-view';
import { itemAvailability } from '@/features/files/availability';
import { notificationHref } from '@/features/notifications/links';
import {
  actionsFor,
  buildShareRequest,
  expiryIso,
  shareFormSchema,
  type ShareFormValues,
} from '@/features/sharing/schemas';
import { formatBytes, formatExpiry } from '@/lib/format';
import { hasNextPage, pageCount } from '@/lib/api-client/pagination';

const base: ShareFormValues = {
  emails: [],
  groupIds: [],
  preset: 'viewer_download',
  customActions: [],
  expiry: '30',
  customDate: '',
  message: '',
};

describe('share form', () => {
  it('requires a recipient', () => {
    const r = shareFormSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ['emails'],
      message: 'Add at least one person or group',
    });
  });

  it('requires a future custom date and at least one custom permission', () => {
    const r = shareFormSchema.safeParse({
      ...base,
      emails: ['a@b.co'],
      preset: 'custom',
      expiry: 'custom',
      customDate: '2001-01-01',
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toContain('customActions');
    expect(paths).toContain('customDate');
  });

  it('builds the request: presets, lowercase emails, groups, expiry, message', () => {
    const now = Date.UTC(2026, 0, 1);
    const body = buildShareRequest(
      { ...base, emails: ['Bob@Acme.test'], groupIds: ['g1'], message: '  hi  ' },
      now,
    );
    expect(body.recipients).toEqual([
      { type: 'user', email: 'bob@acme.test' },
      { type: 'group', id: 'g1' },
    ]);
    expect(body.actions).toEqual(['view', 'preview', 'download']);
    expect(body.expires_at).toBe(new Date(now + 30 * 86400000).toISOString());
    expect(body.message).toBe('hi');
  });

  it('presets and "none" expiry', () => {
    expect(actionsFor({ preset: 'viewer', customActions: [] })).toEqual(['view', 'preview']);
    expect(actionsFor({ preset: 'editor', customActions: [] })).toContain('upload_version');
    expect(actionsFor({ preset: 'custom', customActions: ['download'] })).toEqual([
      'view',
      'download',
    ]);
    expect(expiryIso({ expiry: 'none', customDate: '' })).toBeNull();
  });
});

describe('row action availability (permissions-driven)', () => {
  const doc = (permissions: string[], status = 'available') => ({
    kind: 'document' as const,
    id: 'd',
    name: 'n',
    permissions,
    status,
    content_type: 'application/pdf',
  });

  it('enables only what the permissions array grants', () => {
    const a = itemAvailability(doc(['view', 'preview', 'download']));
    expect(a.download.enabled).toBe(true);
    expect(a.preview.enabled).toBe(true);
    expect(a.rename.enabled).toBe(false);
    expect(a.delete.enabled).toBe(false);
    expect(a.share.enabled).toBe(false);
    expect(a.access.enabled).toBe(false);
    expect(a.rename.reason).toMatch(/permission/);
  });

  it('never offers download/preview/share for non-available documents', () => {
    const all = ['view', 'preview', 'download', 'share', 'copy'];
    for (const status of ['processing', 'quarantined', 'failed']) {
      const a = itemAvailability(doc(all, status));
      expect(a.download.enabled).toBe(false);
      expect(a.preview.enabled).toBe(false);
      expect(a.share.enabled).toBe(false);
    }
    expect(itemAvailability(doc(all, 'processing')).download.reason).toMatch(/scanned/);
  });

  it('does not preview non-previewable types', () => {
    const a = itemAvailability({
      ...doc(['view', 'preview', 'download']),
      content_type: 'application/zip',
    });
    expect(a.preview.enabled).toBe(false);
    expect(a.download.enabled).toBe(true);
  });

  it('folders: no download/preview/copy/star', () => {
    const a = itemAvailability({
      kind: 'folder',
      id: 'f',
      name: 'f',
      permissions: ['view', 'create_child', 'rename'],
    });
    expect(a.download.enabled || a.preview.enabled || a.copy.enabled || a.star.enabled).toBe(false);
    expect(a.rename.enabled).toBe(true);
  });
});

describe('helpers', () => {
  it('formats bytes and expiry', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(null)).toBe('-');
    const now = Date.UTC(2026, 0, 1);
    expect(formatExpiry(null)).toBe('No expiry');
    expect(formatExpiry(new Date(now + 6 * 86400000 - 1000).toISOString(), now)).toBe(
      'Expires in 6 days',
    );
    expect(formatExpiry(new Date(now - 86400000).toISOString(), now)).toMatch(/^Expired/);
  });

  it('pagination helpers', () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(101, 50)).toBe(3);
    expect(hasNextPage({ total: 120, limit: 50, offset: 100 })).toBe(false);
    expect(hasNextPage({ total: 120, limit: 50, offset: 50 })).toBe(true);
  });

  it('notification deep links', () => {
    expect(
      notificationHref({ type: 'share.received', resource_type: 'document', resource_id: 'abc' }),
    ).toBe('/documents/abc');
    expect(notificationHref({ type: 'x', resource_type: 'folder', resource_id: 'abc' })).toBe(
      '/files/abc',
    );
    expect(notificationHref({ type: 'x', resource_type: null, resource_id: null })).toBeNull();
  });

  it('exports the loaded audit page as valid CSV', () => {
    const csv = auditToCsv([
      {
        id: '1',
        created_at: '2026-01-01T00:00:00Z',
        action: 'share.created',
        outcome: 'success',
        actor_email: 'a@b.c',
        actor_user_id: 'u',
        resource_type: 'document',
        resource_id: 'r',
        request_id: 'q',
        metadata: { note: 'has, comma and "quote"' },
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'time,action,outcome,actor_email,actor_user_id,resource_type,resource_id,request_id,metadata',
    );
    expect(lines[1]).toContain('share.created');
    expect(lines[1]).toContain('"{""note"":""has, comma and \\""quote\\""""}"');
  });
});
