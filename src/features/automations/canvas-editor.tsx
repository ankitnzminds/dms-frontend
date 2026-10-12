'use client';

import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Play,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { friendlyMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  useAutomation,
  useCatalogue,
  useSetAutomationEnabled,
  useUpdateAutomation,
  validateSaved,
  type Automation,
  type CatalogueEntry,
  type EdgeDef,
  type NodeDef,
  type Report,
  type TriggerDef,
} from './api';
import {
  cleanParams,
  fieldErrors,
  generalErrors,
  initialParams,
  nextNodeId,
  PALETTE_GROUPS,
} from './definition';
import { ParamsForm, type JsonSchema, type Params } from './params-form';
import { PublishDialog } from './publish-dialog';
import { TestDialog } from './test-dialog';

interface Def {
  trigger: TriggerDef;
  nodes: NodeDef[];
  edges: EdgeDef[];
}

type Branch = 'true' | 'false' | null;

const edgeId = (e: EdgeDef, i: number) => `${e.from}>${e.to}:${e.branch ?? ''}:${i}`;

// ------------------------------------------------------------------ summaries
function summarize(type: string, p: Params): string {
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : '');
  switch (type) {
    case 'condition':
      return s('expression') || 'No expression yet';
    case 'assign_variable':
      return s('name') ? `vars.${s('name')} = ${s('expression')}` : 'Not configured';
    case 'notify_users':
      return s('title') || 'No title yet';
    case 'send_email':
      return s('subject') || 'No subject yet';
    case 'copy_files':
    case 'move_files':
      return p.target_folder_id ? 'To the chosen folder' : 'No destination yet';
    case 'create_directory':
      return s('name') || 'No name yet';
    case 'set_metadata':
      return s('key') ? `${s('key')} = ${String(p.value ?? '')}` : 'Not configured';
    case 'assign_acl':
      return `${s('subject_type') || '…'}: ${((p.actions as string[]) ?? []).join(', ') || 'no actions'}`;
    case 'release_locks':
      return `Older than ${String(p.older_than_hours ?? 24)} h`;
    default:
      return '';
  }
}

// ------------------------------------------------------------------ node components
interface NodeData extends Record<string, unknown> {
  label: string;
  summary: string;
  nodeType: string;
  risk?: 'low' | 'high' | null;
  problem?: boolean;
}

const ring = (selected?: boolean, problem?: boolean) =>
  cn(
    'min-w-44 max-w-56 rounded-lg border bg-surface px-3 py-2 shadow-sm',
    problem
      ? 'border-danger'
      : selected
        ? 'border-accent ring-2 ring-accent/30'
        : 'border-line-strong',
  );

function StepNode({ data, selected }: NodeProps<Node<NodeData>>) {
  return (
    <div className={ring(selected, data.problem)}>
      <Handle type="target" position={Position.Top} />
      <p className="flex items-center gap-1.5 text-[13px] font-medium">
        {data.label}
        {data.risk === 'high' && <Badge tone="warn">High risk</Badge>}
        {data.problem && (
          <AlertTriangle className="size-3.5 text-danger" aria-label="Needs attention" />
        )}
      </p>
      {data.summary && <p className="truncate text-xs text-muted">{data.summary}</p>}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps<Node<NodeData>>) {
  return (
    <div className={ring(selected, data.problem)}>
      <Handle type="target" position={Position.Top} />
      <p className="text-[13px] font-medium">Condition</p>
      <p className="truncate font-mono text-[11px] text-muted">{data.summary}</p>
      <div className="mt-1 flex justify-between text-[10px] font-medium uppercase text-muted">
        <span>true</span>
        <span>false</span>
      </div>
      <Handle id="true" type="source" position={Position.Bottom} style={{ left: '25%' }} />
      <Handle id="false" type="source" position={Position.Bottom} style={{ left: '75%' }} />
    </div>
  );
}

function StartNode({ selected, data }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn(ring(selected, data.problem), 'rounded-full bg-accent-soft text-center')}>
      <p className="text-[13px] font-semibold text-accent-soft-fg">Start</p>
      <p className="truncate text-xs text-muted">{data.summary}</p>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function EndNode({ selected }: NodeProps<Node<NodeData>>) {
  return (
    <div className={cn(ring(selected), 'min-w-24 rounded-full bg-surface-2 text-center')}>
      <Handle type="target" position={Position.Top} />
      <p className="text-[13px] font-semibold">Complete</p>
    </div>
  );
}

const nodeTypes = { step: StepNode, condition: ConditionNode, start: StartNode, end: EndNode };

// ------------------------------------------------------------------ the editor
function Editor({ automation }: { automation: Automation }) {
  const cat = useCatalogue();
  const update = useUpdateAutomation();
  const enable = useSetAutomationEnabled();
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const initial = useMemo<Def>(
    () => ({
      trigger: automation.trigger,
      nodes: automation.graph.nodes.map((n, i) => ({
        ...n,
        position: n.position ?? { x: 0, y: i * 130 },
      })),
      edges: automation.graph.edges,
    }),
    [automation.trigger, automation.graph],
  );
  const [def, setDef] = useState<Def>(initial);
  const [name, setName] = useState(automation.name);
  const past = useRef<Def[]>([]);
  const future = useRef<Def[]>([]);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const syncHistory = () =>
    setHistorySize({ undo: past.current.length, redo: future.current.length });
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [rowVersion, setRowVersion] = useState(automation.row_version);
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [test, setTest] = useState(false);
  const [published, setPublished] = useState<Automation>(automation);
  const dirtyRef = useRef(false);

  const commit = useCallback((next: Def, replaceTop = false) => {
    setDef((cur) => {
      if (!replaceTop) past.current.push(cur);
      future.current = [];
      return next;
    });
    dirtyRef.current = true;
    setSaveState('dirty');
  }, []);
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    setDef((cur) => (future.current.push(cur), prev));
    dirtyRef.current = true;
    setSaveState('dirty');
    syncHistory();
  };
  const redo = () => {
    const nxt = future.current.pop();
    if (!nxt) return;
    setDef((cur) => (past.current.push(cur), nxt));
    dirtyRef.current = true;
    setSaveState('dirty');
    syncHistory();
  };

  // ---- autosave (drafts may be unfinished; only publishing needs a valid graph)
  const save = useCallback(async (): Promise<boolean> => {
    setSaveState('saving');
    try {
      const r = await update.mutateAsync({
        id: automation.id,
        body: {
          name,
          trigger: { key: def.trigger.key, params: cleanParams(def.trigger.params as Params) },
          graph: { nodes: def.nodes, edges: def.edges },
          expected_row_version: rowVersion,
          allow_invalid: true,
        },
      });
      setRowVersion(r.row_version);
      setPublished(r);
      dirtyRef.current = false;
      setSaveState('saved');
      setSaveError(null);
      return true;
    } catch (e) {
      setSaveState('error');
      setSaveError(friendlyMessage(e));
      return false;
    }
  }, [automation.id, def, name, rowVersion, update]);

  useEffect(() => {
    if (saveState !== 'dirty') return;
    const t = setTimeout(() => void save(), 1500);
    return () => clearTimeout(t);
  }, [saveState, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  async function check() {
    if (!(await save())) return;
    try {
      const r = await validateSaved(automation.id);
      setReport(r);
      if (r.valid) toast.success('No problems found');
    } catch (e) {
      toast.error(friendlyMessage(e));
    }
  }

  // ---- graph edits
  const entry = (type: string): CatalogueEntry | undefined =>
    cat.data?.actions.find((a) => a.key === type);

  function addNode(type: string, position?: { x: number; y: number }) {
    const spec = entry(type);
    if (!spec) return;
    const id = nextNodeId(def.nodes, type);
    const last = [...def.nodes].reverse().find((n) => n.type !== 'end');
    const pos = position ?? { x: last?.position?.x ?? 0, y: (last?.position?.y ?? 0) + 130 };
    commit({
      ...def,
      nodes: [
        ...def.nodes,
        { id, type, params: initialParams(spec.schema as JsonSchema), position: pos },
      ],
    });
    setSelected(id);
  }

  function addEnd() {
    if (def.nodes.some((n) => n.type === 'end')) return;
    const last = [...def.nodes].sort((a, b) => (b.position?.y ?? 0) - (a.position?.y ?? 0))[0];
    commit({
      ...def,
      nodes: [
        ...def.nodes,
        {
          id: 'end',
          type: 'end',
          params: {},
          position: { x: last?.position?.x ?? 0, y: (last?.position?.y ?? 0) + 130 },
        },
      ],
    });
  }

  function removeNode(id: string) {
    const n = def.nodes.find((x) => x.id === id);
    if (!n || n.type === 'start') return;
    commit({
      ...def,
      nodes: def.nodes.filter((x) => x.id !== id),
      edges: def.edges.filter((e) => e.from !== id && e.to !== id),
    });
    setSelected(null);
  }

  function connect(from: string, to: string, branch: Branch) {
    if (from === to || def.nodes.find((n) => n.id === to)?.type === 'start') return;
    const source = def.nodes.find((n) => n.id === from);
    if (!source) return;
    // a step has one outgoing edge; a condition has one per branch: connecting again replaces it
    const kept = def.edges.filter(
      (e) =>
        !(e.from === from && (source.type === 'condition' ? (e.branch ?? null) === branch : true)),
    );
    commit({
      ...def,
      edges: [...kept, { from, to, branch: source.type === 'condition' ? branch : null }],
    });
  }

  function setParams(id: string, params: Params) {
    const sameNode = past.current.length > 0;
    commit(
      { ...def, nodes: def.nodes.map((n) => (n.id === id ? { ...n, params } : n)) },
      sameNode && lastEdited.current === id,
    );
    lastEdited.current = id;
  }
  const lastEdited = useRef<string | null>(null);

  // ---- xyflow adapters
  const problems = useMemo(() => new Set((report?.issues ?? []).map((i) => i.where)), [report]);
  const rfNodes: Node<NodeData>[] = def.nodes.map((n) => {
    const spec = entry(n.type);
    const isTrigger = n.type === 'start';
    return {
      id: n.id,
      type:
        n.type === 'start'
          ? 'start'
          : n.type === 'end'
            ? 'end'
            : n.type === 'condition'
              ? 'condition'
              : 'step',
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      selected: n.id === selected,
      data: {
        label: isTrigger ? 'Start' : (spec?.label ?? n.type),
        summary: isTrigger
          ? (cat.data?.conditions.find((c) => c.key === def.trigger.key)?.label ??
            'Choose a condition')
          : summarize(n.type, n.params as Params),
        nodeType: n.type,
        risk: spec?.risk,
        problem: problems.has(isTrigger ? 'trigger' : n.id),
      },
      deletable: n.type !== 'start',
    };
  });
  const rfEdges: Edge[] = def.edges.map((e, i) => ({
    id: edgeId(e, i),
    source: e.from,
    target: e.to,
    sourceHandle: e.branch ?? undefined,
    label: e.branch ?? undefined,
    animated: false,
  }));

  const onNodesChange = (changes: NodeChange[]) => {
    const moved = changes.filter((c) => c.type === 'position' && c.position);
    const removed = changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id);
    const picked = changes.find((c) => c.type === 'select' && c.selected) as
      { id: string } | undefined;
    if (picked) setSelected(picked.id);
    if (removed.length) removed.forEach(removeNode);
    if (moved.length) {
      const next = applyNodeChanges(changes, rfNodes);
      setDef((cur) => ({
        ...cur,
        nodes: cur.nodes.map((n) => {
          const m = next.find((x) => x.id === n.id);
          return m ? { ...n, position: m.position } : n;
        }),
      }));
      if (changes.some((c) => c.type === 'position' && c.dragging === false)) {
        dirtyRef.current = true;
        setSaveState('dirty');
      }
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
    if (removed.size)
      commit({ ...def, edges: def.edges.filter((e, i) => !removed.has(edgeId(e, i))) });
  };
  const onConnect = (c: Connection) =>
    c.source && c.target && connect(c.source, c.target, (c.sourceHandle as Branch) ?? null);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/x-dms-node');
    if (!type) return;
    if (type === 'end') return addEnd();
    addNode(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const sel = def.nodes.find((n) => n.id === selected) ?? null;
  const total = def.nodes.filter((n) => n.type !== 'start' && n.type !== 'end').length;

  if (cat.isPending) return <Skeleton className="h-96" />;
  if (cat.isError || !cat.data)
    return <ErrorState error={cat.error} onRetry={() => void cat.refetch()} />;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link href="/admin/automations">
            <ArrowLeft /> Workflows
          </Link>
        </Button>
        <Input
          aria-label="Workflow name"
          className="h-8 w-64 font-medium"
          value={name}
          onChange={(e) => (
            setName(e.target.value),
            setSaveState('dirty'),
            (dirtyRef.current = true)
          )}
        />
        <Badge tone="outline">Visual</Badge>
        <Badge tone={published.status === 'published' ? 'ok' : 'neutral'}>
          {published.status === 'published' ? `Published v${published.published_version}` : 'Draft'}
        </Badge>
        {published.has_unpublished_changes && <Badge tone="warn">Unpublished changes</Badge>}
        <span className="text-xs text-muted" aria-live="polite">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'dirty'
              ? 'Unsaved changes'
              : saveState === 'error'
                ? 'Not saved'
                : 'All changes saved'}
        </span>
        {saveError && (
          <span role="alert" className="text-xs text-danger">
            {saveError}
          </span>
        )}
        <span className="flex-1" />
        <Button size="sm" onClick={undo} disabled={historySize.undo === 0} aria-label="Undo">
          <Undo2 />
        </Button>
        <Button size="sm" onClick={redo} disabled={historySize.redo === 0} aria-label="Redo">
          <Redo2 />
        </Button>
        <Button size="sm" onClick={() => void check()}>
          <Check /> Check
        </Button>
        <Button size="sm" onClick={() => setTest(true)}>
          <Play /> Test
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={async () => (await save()) && setPublish(true)}
        >
          <Upload /> Publish
        </Button>
        {published.status === 'published' && (
          <Button
            size="sm"
            onClick={() =>
              enable.mutate(
                { id: automation.id, enabled: !published.enabled },
                {
                  onSuccess: (r) => setPublished(r),
                  onError: (e) => toast.error(friendlyMessage(e)),
                },
              )
            }
          >
            {published.enabled ? 'Disable' : 'Enable'}
          </Button>
        )}
      </div>

      {report && !report.valid && (
        <ul
          role="alert"
          className="grid gap-0.5 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {report.issues.map((i, k) => (
            <li key={k}>
              <button
                type="button"
                className="text-left underline-offset-2 hover:underline"
                onClick={() => setSelected(i.where === 'trigger' ? 'start' : i.where)}
              >
                {i.where === 'graph'
                  ? 'Workflow'
                  : i.where === 'trigger'
                    ? 'Start'
                    : (entry(def.nodes.find((n) => n.id === i.where)?.type ?? '')?.label ??
                      i.where)}
                : {i.message}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Tabs defaultValue="canvas">
        <TabsList>
          <TabsTrigger value="canvas">Canvas</TabsTrigger>
          <TabsTrigger value="list">List (keyboard)</TabsTrigger>
        </TabsList>
        <TabsContent value="canvas" className="pt-3">
          <div className="grid gap-3 lg:grid-cols-[13rem_1fr_20rem]">
            <aside
              aria-label="Steps"
              className="grid content-start gap-3 rounded-lg border border-line bg-surface p-2.5"
            >
              {PALETTE_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="mb-1 text-xs font-medium text-faint">{g.title}</p>
                  <ul className="grid gap-1">
                    {g.keys.map((k) => {
                      const e = entry(k);
                      if (!e) return null;
                      return (
                        <li key={k}>
                          <button
                            type="button"
                            draggable
                            onDragStart={(ev) =>
                              ev.dataTransfer.setData('application/x-dms-node', k)
                            }
                            onClick={() => addNode(k)}
                            title={`${e.description} Drag onto the canvas, or press Enter to add it.`}
                            className="flex w-full items-center justify-between gap-1 rounded-md border border-line px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                          >
                            <span>{e.label}</span>
                            <Plus className="size-3 text-muted" aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <button
                type="button"
                draggable
                onDragStart={(ev) => ev.dataTransfer.setData('application/x-dms-node', 'end')}
                onClick={addEnd}
                disabled={def.nodes.some((n) => n.type === 'end')}
                className="rounded-md border border-dashed border-line px-2 py-1.5 text-left text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                Complete (end)
              </button>
            </aside>

            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drop target; the List tab is the keyboard alternative */}
            <div
              ref={wrapper}
              className="h-[34rem] overflow-hidden rounded-lg border border-line bg-surface-2"
              onDrop={onDrop}
              onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = 'move'))}
              aria-label="Workflow canvas"
            >
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, n) => setSelected(n.id)}
                onPaneClick={() => setSelected(null)}
                deleteKeyCode={['Backspace', 'Delete']}
                fitView
                fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                colorMode="system"
                minZoom={0.2}
                proOptions={{ hideAttribution: true }}
              >
                <Background />
                <Controls />
              </ReactFlow>
            </div>

            <aside
              aria-label="Step settings"
              className="rounded-lg border border-line bg-surface p-3"
            >
              {sel ? (
                <NodePanel
                  node={sel}
                  def={def}
                  cat={cat.data}
                  report={report}
                  onParams={(p) => setParams(sel.id, p)}
                  onTrigger={(t) => commit({ ...def, trigger: t })}
                  onDelete={() => removeNode(sel.id)}
                />
              ) : (
                <p className="text-[13px] text-muted">
                  Select a step to edit it. Select <strong>Start</strong> to choose when this
                  workflow runs.
                  {total === 0 &&
                    ' Drag a step from the left onto the canvas, then connect the handles.'}
                </p>
              )}
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="list">
          <ListEditor
            def={def}
            cat={cat.data}
            onChange={commit}
            onSelect={setSelected}
            selected={selected}
            onAdd={addNode}
            onRemove={removeNode}
          />
        </TabsContent>
      </Tabs>

      <PublishDialog
        automation={publish ? published : null}
        onClose={() => setPublish(false)}
        onPublished={(a) => {
          setPublished(a);
          setRowVersion(a.row_version);
        }}
      />
      <TestDialog automation={test ? published : null} onClose={() => setTest(false)} />
    </div>
  );
}

function NodePanel({
  node,
  def,
  cat,
  report,
  onParams,
  onTrigger,
  onDelete,
}: {
  node: NodeDef;
  def: Def;
  cat: NonNullable<ReturnType<typeof useCatalogue>['data']>;
  report: Report | null;
  onParams: (p: Params) => void;
  onTrigger: (t: TriggerDef) => void;
  onDelete: () => void;
}) {
  if (node.type === 'start') {
    const cond = cat.conditions.find((c) => c.key === def.trigger.key);
    return (
      <div className="grid gap-3">
        <h2 className="text-sm font-semibold">Start: when does this run?</h2>
        <Select
          aria-label="Condition"
          value={def.trigger.key}
          onChange={(e) => {
            const c = cat.conditions.find((x) => x.key === e.target.value);
            onTrigger({
              key: e.target.value,
              params: c ? initialParams(c.schema as JsonSchema) : {},
            });
          }}
        >
          {cat.conditions.map((c) => (
            <option key={c.key} value={c.key} disabled={!c.supported}>
              {c.label}
              {c.supported ? '' : ' (not supported)'}
            </option>
          ))}
        </Select>
        {cond && (
          <>
            <p className="text-xs text-muted">{cond.description}</p>
            {cond.observation && (
              <p className="text-xs text-muted">What DMS observes: {cond.observation}</p>
            )}
            <ParamsForm
              key={cond.key}
              schema={cond.schema as JsonSchema}
              value={def.trigger.params as Params}
              onChange={(v) => onTrigger({ key: def.trigger.key, params: v })}
              errors={fieldErrors(report, 'trigger')}
              variables={cond.variables}
            />
            {generalErrors(report, 'trigger').map((m) => (
              <p key={m} role="alert" className="text-xs text-danger">
                {m}
              </p>
            ))}
          </>
        )}
      </div>
    );
  }
  if (node.type === 'end')
    return <p className="text-[13px] text-muted">The workflow finishes here.</p>;
  const spec = cat.actions.find((a) => a.key === node.type);
  if (!spec) return <p className="text-[13px] text-danger">Unknown step type “{node.type}”.</p>;
  const cond = cat.conditions.find((c) => c.key === def.trigger.key);
  const assigned = def.nodes
    .filter((n) => n.type === 'assign_variable')
    .map((n) => (n.params as Params).name as string)
    .filter(Boolean);
  const vars = {
    ...(cond?.variables ?? {}),
    ...Object.fromEntries(assigned.map((a) => [`vars.${a}`, 'Assigned earlier in this workflow'])),
  };
  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold">{spec.label}</h2>
        <Button
          size="icon-sm"
          variant="danger-ghost"
          aria-label="Delete this step"
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>
      <p className="text-xs text-muted">{spec.description}</p>
      {spec.risk === 'high' && (
        <Badge tone="warn" className="justify-self-start">
          High risk: owner confirmation is needed to publish
        </Badge>
      )}
      {spec.needs_resource !== 'none' &&
        cond &&
        cond.provides !== 'file' &&
        (spec.needs_resource === 'file' || cond.provides !== 'folder') && (
          <p role="alert" className="text-xs text-danger">
            This step needs a file, but “{cond.label}” does not provide one.
          </p>
        )}
      <ParamsForm
        key={node.id}
        schema={spec.schema as JsonSchema}
        value={node.params as Params}
        onChange={onParams}
        errors={fieldErrors(report, node.id)}
        variables={vars}
      />
      {generalErrors(report, node.id).map((m) => (
        <p key={m} role="alert" className="text-xs text-danger">
          {m}
        </p>
      ))}
    </div>
  );
}

/** Keyboard- and screen-reader-friendly alternative to the canvas: same definition, no pointer needed. */
function ListEditor({
  def,
  cat,
  onChange,
  onSelect,
  selected,
  onAdd,
  onRemove,
}: {
  def: Def;
  cat: NonNullable<ReturnType<typeof useCatalogue>['data']>;
  onChange: (d: Def) => void;
  onSelect: (id: string | null) => void;
  selected: string | null;
  onAdd: (type: string) => void;
  onRemove: (id: string) => void;
}) {
  const label = (n: NodeDef) =>
    n.type === 'start'
      ? 'Start'
      : n.type === 'end'
        ? 'Complete'
        : (cat.actions.find((a) => a.key === n.type)?.label ?? n.type);
  const targetOf = (from: string, branch: Branch) =>
    def.edges.find((e) => e.from === from && (e.branch ?? null) === branch)?.to ?? '';
  function setTarget(from: string, branch: Branch, to: string) {
    const rest = def.edges.filter((e) => !(e.from === from && (e.branch ?? null) === branch));
    onChange({ ...def, edges: to ? [...rest, { from, to, branch }] : rest });
  }
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="add-step" className="text-[13px] font-medium">
          Add a step
        </label>
        <Select
          id="add-step"
          className="w-64"
          value=""
          onChange={(e) => e.target.value && onAdd(e.target.value)}
        >
          <option value="">Choose…</option>
          {cat.actions.map((a) => (
            <option key={a.key} value={a.key} disabled={!a.supported}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      <ol className="grid gap-2">
        {def.nodes.map((n) => (
          <li
            key={n.id}
            className={cn(
              'rounded-md border px-3 py-2',
              selected === n.id ? 'border-accent' : 'border-line',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <strong>{label(n)}</strong>
              <span className="text-xs text-muted">{n.id}</span>
              <span className="truncate text-xs text-muted">
                {summarize(n.type, n.params as Params)}
              </span>
              <span className="flex-1" />
              <Button size="sm" onClick={() => onSelect(n.id)}>
                Edit in panel
              </Button>
              {n.type !== 'start' && (
                <Button
                  size="sm"
                  variant="danger-ghost"
                  aria-label={`Delete ${label(n)} ${n.id}`}
                  onClick={() => onRemove(n.id)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            {n.type !== 'end' && (
              <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                {(n.type === 'condition' ? (['true', 'false'] as const) : ([null] as const)).map(
                  (b) => (
                    <label key={String(b)} className="flex items-center gap-1.5">
                      {b ? `If ${b}, go to` : 'Then go to'}
                      <Select
                        className="h-7 w-44"
                        value={targetOf(n.id, b)}
                        onChange={(e) => setTarget(n.id, b, e.target.value)}
                      >
                        <option value="">(stop here)</option>
                        {def.nodes
                          .filter((x) => x.id !== n.id && x.type !== 'start')
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {label(x)} ({x.id})
                            </option>
                          ))}
                      </Select>
                    </label>
                  ),
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CanvasEditor({ id }: { id: string }) {
  const q = useAutomation(id);
  if (q.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <ReactFlowProvider>
      <Editor automation={q.data} />
    </ReactFlowProvider>
  );
}
