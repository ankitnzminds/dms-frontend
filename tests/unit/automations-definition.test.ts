import { describe, expect, it } from 'vitest';
import {
  layoutGraph,
  cleanParams,
  fieldErrors,
  generalErrors,
  initialParams,
  nextNodeId,
  wizardAction,
  wizardGraph,
} from '@/features/automations/definition';

describe('wizard graph', () => {
  it('is Start -> one action -> End and round-trips through wizardAction', () => {
    const g = wizardGraph('notify_users', { title: 'Hi', message: '', user_ids: [] });
    expect(g.nodes.map((n) => n.type)).toEqual(['start', 'notify_users', 'end']);
    expect(g.edges.map((e) => [e.from, e.to])).toEqual([
      ['start', 'a1'],
      ['a1', 'end'],
    ]);
    // empty optionals are dropped so the server sees only what the admin set
    expect(wizardAction(g)).toEqual({ key: 'notify_users', params: { title: 'Hi' } });
  });

  it('refuses to treat a branching canvas graph as a wizard workflow', () => {
    const g = wizardGraph('notify_users', { title: 'x' });
    g.nodes.push({ id: 'c', type: 'condition', params: {}, position: { x: 0, y: 0 } });
    expect(wizardAction(g)).toBeNull();
    expect(wizardAction({ nodes: [], edges: [] })).toBeNull();
  });
});

describe('params helpers', () => {
  it('cleanParams drops empty values but keeps false and 0', () => {
    expect(cleanParams({ a: '', b: null, c: [], d: false, e: 0, f: 'x' })).toEqual({
      d: false,
      e: 0,
      f: 'x',
    });
  });

  it('initialParams uses schema defaults and empty lists', () => {
    expect(
      initialParams({
        properties: {
          recursive: { type: 'boolean', default: true },
          exclude: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
          confirm: { type: 'boolean' },
        },
        required: ['confirm', 'title'],
      }),
    ).toEqual({ recursive: true, exclude: [], confirm: false });
  });

  it('maps server issues to fields and general messages per node', () => {
    const report = {
      valid: false,
      needs_high_risk_confirmation: false,
      issues: [
        { where: 'trigger', field: 'days', message: 'too small' },
        { where: 'trigger', field: 'days', message: 'second message ignored' },
        { where: 'a1', field: 'title.x', message: 'bad title' },
        { where: 'a1', field: null, message: 'needs a file' },
      ],
    };
    expect(fieldErrors(report, 'trigger')).toEqual({ days: 'too small' });
    expect(fieldErrors(report, 'a1')).toEqual({ title: 'bad title' });
    expect(generalErrors(report, 'a1')).toEqual(['needs a file']);
    expect(fieldErrors(null, 'a1')).toEqual({});
  });

  it('nextNodeId never collides', () => {
    const nodes = [{ id: 'notifyuser1', type: 'notify_users', params: {} }];
    expect(nextNodeId(nodes, 'notify_users')).toBe('notifyuser2');
  });
});

describe('layoutGraph', () => {
  const n = (id: string, type = 'notify_users') => ({ id, type, params: {} });
  const e = (from: string, to: string, branch: string | null = null) => ({ from, to, branch });

  it('puts each step below its deepest predecessor and spreads siblings side by side', () => {
    const nodes = [
      n('start', 'start'),
      n('h', 'human_approval'),
      n('ok'),
      n('no'),
      n('end', 'end'),
    ];
    const edges = [
      e('start', 'h'),
      e('h', 'ok', 'approved'),
      e('h', 'no', 'rejected'),
      e('ok', 'end'),
      e('no', 'end'),
    ];
    const out = Object.fromEntries(layoutGraph(nodes, edges).map((x) => [x.id, x.position!]));
    expect(out.start!.y).toBe(0);
    expect(out.h!.y).toBeGreaterThan(out.start!.y);
    expect(out.ok!.y).toBe(out.no!.y); // same row
    expect(out.ok!.x).toBeLessThan(out.no!.x); // side by side
    expect(out.ok!.x + out.no!.x).toBe(0); // centred under the step above
    expect(out.end!.y).toBeGreaterThan(out.ok!.y); // after both paths join
  });

  it('keeps unconnected steps out of the way at the bottom and never loops forever', () => {
    const nodes = [n('start', 'start'), n('a'), n('b'), n('lost')];
    const edges = [e('start', 'a'), e('a', 'b'), e('b', 'a')]; // malformed cycle
    const out = Object.fromEntries(layoutGraph(nodes, edges).map((x) => [x.id, x.position!]));
    expect(out.lost!.y).toBeGreaterThan(out.a!.y);
  });
});
