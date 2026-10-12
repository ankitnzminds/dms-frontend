import type { GraphDef, NodeDef, Report } from './api';
import type { JsonSchema, Params } from './params-form';

/** Starting values for a freshly chosen condition/action: schema defaults, empty arrays for lists. */
export function initialParams(schema: JsonSchema): Params {
  const out: Params = {};
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.default !== undefined) out[name] = prop.default;
    else if (prop.type === 'array') out[name] = [];
    else if ((schema.required ?? []).includes(name) && prop.type === 'boolean') out[name] = false;
  }
  return out;
}

/** Drop empty optional values so the server sees only what the admin actually set. */
export function cleanParams(p: Params): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

export const START: NodeDef = { id: 'start', type: 'start', params: {}, position: { x: 0, y: 0 } };
export const END: NodeDef = { id: 'end', type: 'end', params: {}, position: { x: 0, y: 240 } };

/** The IF/THEN wizard's graph: Start -> one action -> End. */
export function wizardGraph(actionKey: string, params: Params): GraphDef {
  return {
    nodes: [
      START,
      { id: 'a1', type: actionKey, params: cleanParams(params), position: { x: 0, y: 120 } },
      END,
    ],
    edges: [
      { from: 'start', to: 'a1', branch: null },
      { from: 'a1', to: 'end', branch: null },
    ],
  };
}

/** The wizard can edit a definition only when it is exactly Start -> one action -> End. */
export function wizardAction(graph: GraphDef): { key: string; params: Params } | null {
  const actions = graph.nodes.filter((n) => n.type !== 'start' && n.type !== 'end');
  if (actions.length !== 1 || graph.nodes.some((n) => n.type === 'condition')) return null;
  return { key: actions[0]!.type, params: actions[0]!.params as Params };
}

/** field -> message for one node ("trigger" or a node id) from a validation report. */
export function fieldErrors(report: Report | null, where: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of report?.issues ?? []) {
    if (i.where === where && i.field && !out[i.field.split('.')[0]!])
      out[i.field.split('.')[0]!] = i.message;
  }
  return out;
}

export function generalErrors(report: Report | null, where: string): string[] {
  return (report?.issues ?? []).filter((i) => i.where === where && !i.field).map((i) => i.message);
}

/** Group the palette like the reference: Logic, File & Folder, Actions, Send. */
export const PALETTE_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Logic', keys: ['condition', 'assign_variable'] },
  {
    title: 'File & Folder',
    keys: [
      'copy_files',
      'move_files',
      'create_directory',
      'set_metadata',
      'assign_acl',
      'delete_files',
    ],
  },
  {
    title: 'Actions',
    keys: [
      'wait_for_approval',
      'verify_integrity_alert',
      'verify_integrity_delete',
      'release_locks',
      'run_report',
    ],
  },
  { title: 'Send', keys: ['notify_users', 'send_email'] },
];

export function nextNodeId(nodes: NodeDef[], type: string): string {
  const base = type.replace(/_/g, '').slice(0, 10);
  let n = 1;
  while (nodes.some((x) => x.id === `${base}${n}`)) n++;
  return `${base}${n}`;
}
