import { describe, expect, it } from 'vitest';
import { parseSnapshot, SECRET_REF_RE, splitStats } from '@/features/directory/hooks';
import { numericEntries, topActions } from '@/features/admin/reports-view';
import { deleteBlockReason } from '@/components/file-browser/protection-badges';
import { purgeErrorMessage } from '@/features/governance/hooks';
import { notificationHref } from '@/features/notifications/links';
import {
  metadataErrorsFrom,
  toFormValues,
  toMetadataPayload,
  validateMeta,
  type MetadataDefinition,
} from '@/features/metadata/hooks';
import { signatureErrorMessage, signatureUnavailableReason } from '@/features/signatures/hooks';
import { describeCondition, type StepSpec } from '@/features/workflows/hooks';
import { draftsToSteps, emptyStep, validateDrafts } from '@/features/workflows/steps-editor';
import { ApiError, CLASSIFICATIONS } from '@/lib/api-client';
import { fmtCount } from '@/lib/format';

const def = (over: Partial<MetadataDefinition>): MetadataDefinition => ({
  id: 'd',
  key: 'k',
  label: 'K',
  field_type: 'text',
  required: false,
  options: null,
  archived: false,
  schema_version: 1,
  ...over,
});

describe('metadata form logic', () => {
  const defs = [
    def({ key: 'client', label: 'Client', required: true }),
    def({ key: 'amount', label: 'Amount', field_type: 'number' }),
    def({ key: 'due', label: 'Due', field_type: 'date' }),
    def({ key: 'signed', label: 'Signed', field_type: 'boolean' }),
    def({ key: 'tier', label: 'Tier', field_type: 'select', options: ['gold', 'silver'] }),
  ];

  it('validates required, number, date and select values', () => {
    const bad = validateMeta(defs, {
      client: ' ',
      amount: 'abc',
      due: '12/31/2026',
      signed: false,
      tier: 'bronze',
    });
    expect(bad).toEqual({
      client: 'Client is required',
      amount: 'Enter a number',
      due: 'Use YYYY-MM-DD',
      tier: 'Choose one of the options',
    });
    expect(
      validateMeta(defs, {
        client: 'Acme',
        amount: '12.5',
        due: '2026-01-31',
        signed: true,
        tier: 'gold',
      }),
    ).toEqual({});
  });

  it('round-trips values: numbers become numbers, empty optionals are omitted, booleans kept', () => {
    const payload = toMetadataPayload(defs, {
      client: 'Acme',
      amount: '12.5',
      due: '',
      signed: true,
      tier: '',
    });
    expect(payload).toEqual({ client: 'Acme', amount: 12.5, signed: true });
    expect(toFormValues(defs, { client: 'Acme', amount: 12.5, signed: true })).toMatchObject({
      client: 'Acme',
      amount: '12.5',
      signed: true,
      due: '',
    });
  });

  it('maps server metadata_invalid details to field errors', () => {
    expect(
      metadataErrorsFrom([
        { field: 'client', msg: 'is required' },
        { field: 'x', msg: 'unknown metadata field' },
        { nope: 1 },
      ]),
    ).toEqual({
      client: 'is required',
      x: 'unknown metadata field',
    });
    expect(metadataErrorsFrom(null)).toEqual({});
  });
});

describe('directory snapshot validation', () => {
  it('accepts a valid snapshot', () => {
    const r = parseSnapshot(
      JSON.stringify({
        users: [{ external_id: 'u1', email: 'a@b.co', display_name: 'A' }],
        groups: [{ external_id: 'g1', name: 'Eng', member_ids: ['u1'] }],
      }),
    );
    expect(r.ok).toBe(true);
  });
  it('rejects bad JSON, bad shapes and duplicate ids with readable messages', () => {
    expect(parseSnapshot('{nope')).toEqual({ ok: false, errors: ['The file is not valid JSON.'] });
    const shape = parseSnapshot(JSON.stringify({ users: [{ external_id: '', email: 'x' }] }));
    expect(shape.ok).toBe(false);
    if (!shape.ok) expect(shape.errors.join(' ')).toMatch(/email must be a valid address/);
    expect(parseSnapshot(JSON.stringify({ users: [] })).ok).toBe(false);
    const dup = parseSnapshot(
      JSON.stringify({
        users: [
          { external_id: 'u', email: 'a@b.co' },
          { external_id: 'u', email: 'c@d.co' },
        ],
      }),
    );
    expect(dup).toMatchObject({ ok: false });
  });
  it('only env:DMS_DIR_ secret references are accepted (never the secret itself)', () => {
    expect(SECRET_REF_RE.test('env:DMS_DIR_ENTRA_PROD')).toBe(true);
    for (const bad of ['hunter2', 'env:OTHER', 'env:DMS_DIR_lower', 'vault:x'])
      expect(SECRET_REF_RE.test(bad)).toBe(false);
  });
  it('splits run stats into counters and notes', () => {
    expect(splitStats({ created: 2, updated: 1, notes: ['x', 'y'], other: 'ignored' })).toEqual({
      counters: [
        ['created', 2],
        ['updated', 1],
      ],
      notes: ['x', 'y'],
    });
  });
});

describe('workflow builder logic', () => {
  it('validates steps', () => {
    expect(validateDrafts([])._).toBeTruthy();
    const s = emptyStep();
    expect(validateDrafts([s])[s.key]).toMatch(/name/);
    s.name = 'Legal';
    expect(validateDrafts([s])[s.key]).toMatch(/reviewer/);
    s.assignees = [{ type: 'role', role: 'admin', label: 'Role: admin' }];
    expect(validateDrafts([s])).toEqual({});
    s.dueDays = '0';
    expect(validateDrafts([s])[s.key]).toMatch(/Due days/);
    s.dueDays = '3';
    s.condEnabled = true;
    s.condField = 'metadata';
    expect(validateDrafts([s])[s.key]).toMatch(/metadata key/);
  });

  it('builds API steps incl. conditions with typed values', () => {
    const s = emptyStep();
    Object.assign(s, {
      name: 'Big files',
      rule: 'any',
      dueDays: '5',
      assignees: [
        { type: 'user', id: 'u1', label: 'U' },
        { type: 'group', id: 'g1', label: 'G' },
        { type: 'role', role: 'admin', label: 'R' },
      ],
      escalate: { id: 'boss', label: 'Boss' },
      condEnabled: true,
      condField: 'size_bytes',
      condOp: 'gte',
      condValue: '1000',
    });
    const [step] = draftsToSteps([s]) as StepSpec[];
    expect(step).toMatchObject({
      name: 'Big files',
      rule: 'any',
      due_days: 5,
      escalate_to_user_id: 'boss',
      assignees: [
        { type: 'user', id: 'u1' },
        { type: 'group', id: 'g1' },
        { type: 'role', role: 'admin' },
      ],
      condition: { field: 'size_bytes', op: 'gte', value: 1000, key: null },
    });
    Object.assign(s, {
      condField: 'classification',
      condOp: 'in',
      condValue: 'confidential, restricted',
    });
    expect(draftsToSteps([s])[0]!.condition).toMatchObject({
      value: ['confidential', 'restricted'],
    });
    expect(describeCondition(draftsToSteps([s])[0]!.condition)).toBe(
      'Runs only when classification in confidential, restricted',
    );
  });
});

describe('governance, signatures, notifications, reports helpers', () => {
  it('maps purge errors precisely', () => {
    expect(
      purgeErrorMessage(new ApiError({ status: 409, code: 'legal_hold', message: 'x' })),
    ).toMatch(/legal hold/);
    const until = new Date(Date.now() + 86400000 * 3).toISOString();
    expect(
      purgeErrorMessage(
        new ApiError({
          status: 409,
          code: 'retention_active',
          message: 'x',
          details: [{ until }, { until: null }],
        }),
      ),
    ).toMatch(/retention policy protects this item until/);
    expect(
      purgeErrorMessage(new ApiError({ status: 403, code: 'forbidden', message: 'x' })),
    ).toMatch(/permission/);
    expect(purgeErrorMessage(new ApiError({ status: 500, code: 'x', message: 'x' }))).toBeNull();
  });

  it('delete is blocked with a reason only when protection says so', () => {
    expect(deleteBlockReason(undefined)).toBeNull();
    expect(
      deleteBlockReason({
        can_delete: true,
        can_purge: true,
        legal_hold: false,
        retention_until: null,
      }),
    ).toBeNull();
    expect(
      deleteBlockReason({
        can_delete: false,
        can_purge: false,
        legal_hold: true,
        retention_until: null,
      }),
    ).toMatch(/legal hold/);
  });

  it('signature availability reasons and error mapping', () => {
    expect(signatureUnavailableReason(undefined, false)).toMatch(/Checking/);
    expect(
      signatureUnavailableReason(
        {
          available: false,
          enabled: false,
          allow_external_signers: false,
          builtin_available: false,
          provider: null,
        },
        true,
      ),
    ).toMatch(/no signing provider/);
    expect(
      signatureUnavailableReason(
        {
          available: true,
          enabled: false,
          allow_external_signers: false,
          builtin_available: false,
          provider: 'x',
        },
        true,
      ),
    ).toMatch(/Settings/);
    expect(
      signatureUnavailableReason(
        {
          available: true,
          enabled: false,
          allow_external_signers: false,
          builtin_available: false,
          provider: 'x',
        },
        false,
      ),
    ).toMatch(/Ask an administrator/);
    expect(
      signatureUnavailableReason(
        {
          available: true,
          enabled: true,
          allow_external_signers: false,
          builtin_available: false,
          provider: 'x',
        },
        false,
      ),
    ).toBeNull();
    for (const code of [
      'pdf_required',
      'feature_disabled',
      'signatures_unavailable',
      'policy_blocked',
      'external_signers_disabled',
    ])
      expect(signatureErrorMessage(new ApiError({ status: 409, code, message: 'x' }))).toBeTruthy();
  });

  it('deep links by notification type', () => {
    const n = (type: string, resource_type: string | null, resource_id: string | null) =>
      notificationHref({ type, resource_type, resource_id });
    expect(n('share.received', 'document', 'd1')).toBe('/documents/d1');
    expect(n('share.received', 'folder', 'f1')).toBe('/files/f1');
    expect(n('share.revoked', 'document', null)).toBe('/shared-with-me');
    expect(n('share.expired', 'folder', null)).toBe('/shared-with-me');
    expect(n('workflow.task_assigned', 'workflow_task', 't1')).toBe('/approvals');
    expect(n('workflow.finished', 'workflow_run', 'r1')).toBe('/approvals/runs/r1');
    expect(n('signature.requested', 'signature_request', 's1')).toBe('/signatures/s1');
    expect(n('document.available', 'document', 'd2')).toBe('/documents/d2');
    expect(n('document.quarantined', 'document', 'd3')).toBe('/documents/d3');
    expect(n('weird', null, null)).toBeNull();
  });

  it('report helpers ignore malformed data', () => {
    expect(numericEntries({ a: 1, b: 'x', c: NaN, d: 4 })).toEqual([
      ['a', 1],
      ['d', 4],
    ]);
    expect(numericEntries(null)).toEqual([]);
    expect(numericEntries([1, 2])).toEqual([]);
    expect(topActions([{ action: 'a', count: 2 }, { action: 1 }, null])).toEqual([
      { action: 'a', count: 2 },
    ]);
  });

  it('null admin counters render as a dash, real zero stays 0', () => {
    expect(fmtCount(null)).toBe('-');
    expect(fmtCount(undefined)).toBe('-');
    expect(fmtCount(0)).toBe('0');
    expect(fmtCount(12345)).toBe((12345).toLocaleString());
  });

  it('exposes the classification enum', () => {
    expect(CLASSIFICATIONS).toEqual(['public', 'internal', 'confidential', 'restricted']);
  });
});
