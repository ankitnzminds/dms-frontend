/**
 * Form state <-> policy document. The backend validator is the authority; this only builds documents
 * from what the Policy Builder can express (one flat AND/OR list of conditions) and refuses to edit
 * anything richer (it keeps the original condition untouched and says so).
 */

export type Effect = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
export type CondValue = string | boolean | string[];

export interface CondRow {
  attribute: string;
  operator: string;
  value: CondValue;
}

export interface PolicyForm {
  name: string;
  description: string;
  effect: Effect;
  mandatory: boolean;
  scopeType: 'organization' | 'folder' | 'file';
  scopeId: string;
  scopeName: string;
  users: string[];
  groups: string[];
  roles: string[];
  accessLevels: string[];
  resourceTypes: string[];
  actions: string[];
  combine: 'AND' | 'OR';
  conditions: CondRow[];
  /** A nested condition the builder cannot draw: kept as is and shown read-only. */
  advancedCondition: Record<string, unknown> | null;
  changeReason: string;
}

export const emptyForm = (): PolicyForm => ({
  name: '',
  description: '',
  effect: 'DENY',
  mandatory: false,
  scopeType: 'organization',
  scopeId: '',
  scopeName: '',
  users: [],
  groups: [],
  roles: [],
  accessLevels: [],
  resourceTypes: ['document'],
  actions: [],
  combine: 'AND',
  conditions: [],
  advancedCondition: null,
  changeReason: '',
});

type Doc = Record<string, unknown>;
const asArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function toDocument(f: PolicyForm): Doc {
  const subjects: Doc = {};
  if (f.users.length) subjects.users = f.users;
  if (f.groups.length) subjects.groups = f.groups;
  if (f.roles.length) subjects.roles = f.roles;
  if (f.accessLevels.length) subjects.access_levels = f.accessLevels;
  const leaves = f.conditions.map((c) =>
    c.operator === 'EXISTS' || c.operator === 'NOT_EXISTS'
      ? { attribute: c.attribute, operator: c.operator }
      : { attribute: c.attribute, operator: c.operator, value: c.value },
  );
  const doc: Doc = {
    schema_version: 1,
    effect: f.effect,
    mandatory: f.mandatory,
    scope:
      f.scopeType === 'organization'
        ? { type: 'organization' }
        : { type: f.scopeType, id: f.scopeId },
    subjects,
    resource_types: f.resourceTypes,
    actions: f.actions,
  };
  if (f.advancedCondition) doc.condition = f.advancedCondition;
  else if (leaves.length === 1) doc.condition = leaves[0];
  else if (leaves.length > 1) doc.condition = { op: f.combine, conditions: leaves };
  return doc;
}

function leafOf(c: unknown): CondRow | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Doc;
  if (typeof o.attribute !== 'string' || typeof o.operator !== 'string') return null;
  const v = o.value;
  return {
    attribute: o.attribute,
    operator: o.operator,
    value: Array.isArray(v) ? v.map(String) : typeof v === 'boolean' ? v : String(v ?? ''),
  };
}

export function fromDocument(name: string, description: string, doc: Doc): PolicyForm {
  const f = emptyForm();
  f.name = name;
  f.description = description;
  f.effect = (doc.effect as Effect) ?? 'DENY';
  f.mandatory = doc.mandatory === true;
  const scope = (doc.scope ?? {}) as Doc;
  if (scope.type === 'folder' || scope.type === 'file') {
    f.scopeType = scope.type;
    f.scopeId = String(scope.id ?? '');
  }
  const s = (doc.subjects ?? {}) as Doc;
  f.users = asArr(s.users);
  f.groups = asArr(s.groups);
  f.roles = asArr(s.roles);
  f.accessLevels = asArr(s.access_levels);
  f.resourceTypes = asArr(doc.resource_types);
  f.actions = asArr(doc.actions);
  const cond = doc.condition as Doc | undefined;
  if (cond) {
    const single = leafOf(cond);
    if (single) f.conditions = [single];
    else if (
      (cond.op === 'AND' || cond.op === 'OR') &&
      Array.isArray(cond.conditions) &&
      cond.conditions.every((c) => leafOf(c))
    ) {
      f.combine = cond.op;
      f.conditions = (cond.conditions as unknown[]).map((c) => leafOf(c)!);
    } else f.advancedCondition = cond;
  }
  return f;
}

export const ACTION_GROUPS: { title: string; actions: string[] }[] = [
  { title: 'See', actions: ['discover', 'view', 'preview'] },
  { title: 'Download & copy out', actions: ['download', 'export', 'sync', 'copy'] },
  {
    title: 'Add content',
    actions: ['create_folder', 'create_file', 'upload', 'upload_version', 'create_child'],
  },
  {
    title: 'Change & organize',
    actions: ['edit_metadata', 'rename', 'move', 'delete', 'restore', 'comment'],
  },
  { title: 'Versions & locks', actions: ['view_versions', 'restore_version', 'lock'] },
  { title: 'Sharing & access', actions: ['share', 'manage_access'] },
];

export const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
