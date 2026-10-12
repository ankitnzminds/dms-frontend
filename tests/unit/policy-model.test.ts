import { describe, expect, it } from 'vitest';
import { emptyForm, fromDocument, toDocument } from '@/features/policies/policy-model';

describe('policy builder model', () => {
  it('builds a valid-shaped document from the form', () => {
    const f = {
      ...emptyForm(),
      name: 'x',
      actions: ['download'],
      accessLevels: ['external'],
      conditions: [
        { attribute: 'resource.classification', operator: 'EQUALS', value: 'confidential' },
      ],
    };
    expect(toDocument(f)).toEqual({
      schema_version: 1,
      effect: 'DENY',
      mandatory: false,
      scope: { type: 'organization' },
      subjects: { access_levels: ['external'] },
      resource_types: ['document'],
      actions: ['download'],
      condition: {
        attribute: 'resource.classification',
        operator: 'EQUALS',
        value: 'confidential',
      },
    });
  });

  it('combines several conditions with the chosen operator and omits values for EXISTS', () => {
    const f = {
      ...emptyForm(),
      combine: 'OR' as const,
      conditions: [
        { attribute: 'resource.file_extension', operator: 'EXISTS', value: '' },
        { attribute: 'subject.is_external', operator: 'EQUALS', value: true },
      ],
    };
    const c = toDocument(f).condition as { op: string; conditions: Record<string, unknown>[] };
    expect(c.op).toBe('OR');
    expect(c.conditions[0]).toEqual({ attribute: 'resource.file_extension', operator: 'EXISTS' });
    expect(c.conditions[1]!.value).toBe(true);
  });

  it('round-trips a document and keeps what the builder cannot draw untouched', () => {
    const doc = {
      schema_version: 1,
      effect: 'DENY',
      scope: { type: 'folder', id: 'f1' },
      subjects: { groups: ['g1'] },
      resource_types: ['document'],
      actions: ['share'],
      condition: {
        op: 'AND',
        conditions: [
          { attribute: 'resource.classification', operator: 'IN', value: ['public', 'internal'] },
          { attribute: 'subject.is_external', operator: 'EQUALS', value: true },
        ],
      },
    };
    const f = fromDocument('n', '', doc);
    expect(f.scopeType).toBe('folder');
    expect(f.groups).toEqual(['g1']);
    expect(f.conditions).toHaveLength(2);
    expect(toDocument(f).condition).toEqual(doc.condition);

    const nested = {
      ...doc,
      condition: { op: 'OR', conditions: [doc.condition, doc.condition] },
    };
    const g = fromDocument('n', '', nested);
    expect(g.advancedCondition).toEqual(nested.condition);
    expect(toDocument(g).condition).toEqual(nested.condition);
  });

  it('keeps a file-scoped policy file-scoped', () => {
    const f = fromDocument('n', '', {
      effect: 'DENY',
      scope: { type: 'file', id: 'd1' },
      actions: ['download'],
      resource_types: ['document'],
    });
    expect(f.scopeType).toBe('file');
    expect(toDocument(f).scope).toEqual({ type: 'file', id: 'd1' });
  });
});
