'use client';

import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { MemberPicker } from '@/features/members/member-picker';
import { useGroups } from '@/features/sharing/hooks';
import type { Schemas } from '@/lib/api-client';
import type { StepSpec } from './hooks';

export type AssigneeDraft = {
  type: 'user' | 'group' | 'role';
  id?: string;
  role?: 'owner' | 'admin' | 'member' | 'auditor';
  label: string;
  /** Approval-chain flags (kept as they are when a generated workflow is edited here). */
  optional?: boolean;
  superApprover?: boolean;
};
export type StepDraft = {
  key: string;
  name: string;
  rule: 'all' | 'any';
  dueDays: string;
  escalate: { id: string; label: string } | null;
  assignees: AssigneeDraft[];
  condEnabled: boolean;
  condField: 'classification' | 'size_bytes' | 'content_type' | 'metadata';
  condKey: string;
  condOp: Schemas['StepCondition']['op'];
  condValue: string;
};

const OPS: Schemas['StepCondition']['op'][] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'];
let seq = 0;

export function emptyStep(): StepDraft {
  return {
    key: `s${++seq}`,
    name: '',
    rule: 'all',
    dueDays: '',
    escalate: null,
    assignees: [],
    condEnabled: false,
    condField: 'classification',
    condKey: '',
    condOp: 'eq',
    condValue: '',
  };
}

/** Existing definition steps -> editable drafts (user ids shown shortened: the API has no id lookup). */
export function stepsToDrafts(
  steps: StepSpec[],
  groupNames: Record<string, string> = {},
): StepDraft[] {
  return steps.map((s) => ({
    ...emptyStep(),
    name: s.name,
    rule: s.rule ?? 'all',
    dueDays: s.due_days ? String(s.due_days) : '',
    escalate: s.escalate_to_user_id
      ? { id: s.escalate_to_user_id, label: `user ${s.escalate_to_user_id.slice(0, 8)}` }
      : null,
    assignees: s.assignees.map((a) => {
      const flags = { optional: a.optional, superApprover: a.is_super_approver };
      return a.type === 'role'
        ? { type: 'role', role: a.role ?? 'member', label: `Role: ${a.role}`, ...flags }
        : a.type === 'group'
          ? {
              type: 'group',
              id: a.id ?? '',
              label: `Group: ${groupNames[a.id ?? ''] ?? (a.id ?? '').slice(0, 8)}`,
              ...flags,
            }
          : { type: 'user', id: a.id ?? '', label: `user ${(a.id ?? '').slice(0, 8)}`, ...flags };
    }),
    condEnabled: !!s.condition,
    condField: s.condition?.field ?? 'classification',
    condKey: s.condition?.key ?? '',
    condOp: s.condition?.op ?? 'eq',
    condValue: Array.isArray(s.condition?.value)
      ? (s.condition!.value as unknown[]).join(', ')
      : s.condition
        ? String(s.condition.value)
        : '',
  }));
}

/** Validate drafts; returns messages per step key. */
export function validateDrafts(drafts: StepDraft[]): Record<string, string> {
  const errs: Record<string, string> = {};
  if (drafts.length === 0) errs._ = 'Add at least one step';
  for (const d of drafts) {
    if (!d.name.trim()) errs[d.key] = 'Give the step a name';
    else if (d.assignees.length === 0) errs[d.key] = 'Add at least one reviewer';
    else if (d.dueDays && !/^[1-9]\d*$/.test(d.dueDays))
      errs[d.key] = 'Due days must be a whole number of 1 or more';
    else if (d.condEnabled) {
      if (d.condField === 'metadata' && !d.condKey.trim())
        errs[d.key] = 'Enter the metadata key for the condition';
      else if (!d.condValue.trim()) errs[d.key] = 'Enter a value for the condition';
      else if (
        d.condField === 'size_bytes' &&
        d.condValue.split(',').some((x) => !Number.isFinite(Number(x.trim())))
      )
        errs[d.key] = 'Size conditions need a number of bytes';
    }
  }
  return errs;
}

export function draftsToSteps(drafts: StepDraft[]): StepSpec[] {
  return drafts.map((d) => {
    const step: StepSpec = {
      name: d.name.trim(),
      rule: d.rule,
      assignees: d.assignees.map((a) => {
        const flags = { optional: !!a.optional, is_super_approver: !!a.superApprover };
        return a.type === 'role'
          ? { type: 'role', role: a.role, ...flags }
          : { type: a.type, id: a.id, ...flags };
      }),
      due_days: d.dueDays ? Number(d.dueDays) : null,
      escalate_to_user_id: d.escalate?.id ?? null,
      condition: null,
    };
    if (d.condEnabled) {
      const raw = d.condValue.trim();
      const parts = raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      const num = d.condField === 'size_bytes';
      step.condition = {
        field: d.condField,
        key: d.condField === 'metadata' ? d.condKey.trim() : null,
        op: d.condOp,
        value: d.condOp === 'in' ? (num ? parts.map(Number) : parts) : num ? Number(raw) : raw,
      };
    }
    return step;
  });
}

function StepEditor({
  d,
  index,
  total,
  error,
  onChange,
  onRemove,
}: {
  d: StepDraft;
  index: number;
  total: number;
  error?: string;
  onChange: (n: StepDraft) => void;
  onRemove: () => void;
}) {
  const groups = useGroups();
  const set = (p: Partial<StepDraft>) => onChange({ ...d, ...p });
  const idp = `step-${d.key}`;
  return (
    <fieldset className="grid gap-3 rounded-md border border-line p-3" data-testid="step-editor">
      <legend className="px-1 text-[13px] font-semibold">Step {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_7rem]">
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-name`}>Name</Label>
          <Input
            id={`${idp}-name`}
            value={d.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-rule`}>Approval rule</Label>
          <Select
            id={`${idp}-rule`}
            value={d.rule}
            onChange={(e) => set({ rule: e.target.value as 'all' | 'any' })}
          >
            <option value="all">Everyone approves</option>
            <option value="any">Any one approves</option>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${idp}-due`}>Due (days)</Label>
          <Input
            id={`${idp}-due`}
            inputMode="numeric"
            value={d.dueDays}
            onChange={(e) => set({ dueDays: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-[13px] font-medium">Reviewers</p>
        {d.assignees.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Reviewers">
            {d.assignees.map((a, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1 rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-fg"
              >
                {a.label}
                <button
                  type="button"
                  aria-label={`Remove ${a.label}`}
                  className="rounded-sm hover:bg-accent/20"
                  onClick={() => set({ assignees: d.assignees.filter((_, j) => j !== i) })}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <MemberPicker
            label="Add a person"
            inputId={`${idp}-user`}
            onSelect={(u) =>
              set({
                assignees: [
                  ...d.assignees,
                  { type: 'user', id: u.id, label: u.display_name ?? u.email ?? u.id },
                ],
              })
            }
          />
          <div className="grid gap-1">
            <Label htmlFor={`${idp}-group`}>Add a group</Label>
            <Select
              id={`${idp}-group`}
              value=""
              onChange={(e) => {
                const g = groups.data?.items.find((x) => x.id === e.target.value);
                if (g)
                  set({
                    assignees: [
                      ...d.assignees,
                      { type: 'group', id: g.id, label: `Group: ${g.name}` },
                    ],
                  });
              }}
            >
              <option value="">Choose…</option>
              {groups.data?.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${idp}-role`}>Add a role</Label>
            <Select
              id={`${idp}-role`}
              value=""
              onChange={(e) => {
                const r = e.target.value as AssigneeDraft['role'];
                if (r)
                  set({
                    assignees: [...d.assignees, { type: 'role', role: r, label: `Role: ${r}` }],
                  });
              }}
            >
              <option value="">Choose…</option>
              {(['owner', 'admin', 'member', 'auditor'] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <MemberPicker
          label="Escalate overdue tasks to (optional)"
          inputId={`${idp}-esc`}
          onSelect={(u) =>
            set({ escalate: { id: u.id, label: u.display_name ?? u.email ?? u.id } })
          }
        />
        {d.escalate && (
          <p className="text-xs text-muted">
            Escalates to <strong>{d.escalate.label}</strong>{' '}
            <button
              type="button"
              className="text-accent hover:underline"
              onClick={() => set({ escalate: null })}
            >
              clear
            </button>
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={d.condEnabled}
            onChange={(e) => set({ condEnabled: e.target.checked })}
          />
          Only run this step when a condition matches
        </label>
        {d.condEnabled && (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="grid gap-1">
              <Label htmlFor={`${idp}-cf`}>Field</Label>
              <Select
                id={`${idp}-cf`}
                value={d.condField}
                onChange={(e) => set({ condField: e.target.value as StepDraft['condField'] })}
              >
                <option value="classification">classification</option>
                <option value="size_bytes">size (bytes)</option>
                <option value="content_type">content type</option>
                <option value="metadata">metadata</option>
              </Select>
            </div>
            {d.condField === 'metadata' && (
              <div className="grid gap-1">
                <Label htmlFor={`${idp}-ck`}>Metadata key</Label>
                <Input
                  id={`${idp}-ck`}
                  value={d.condKey}
                  onChange={(e) => set({ condKey: e.target.value })}
                />
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor={`${idp}-co`}>Operator</Label>
              <Select
                id={`${idp}-co`}
                value={d.condOp}
                onChange={(e) => set({ condOp: e.target.value as StepDraft['condOp'] })}
              >
                {OPS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${idp}-cv`}>
                {d.condOp === 'in' ? 'Values (comma separated)' : 'Value'}
              </Label>
              <Input
                id={`${idp}-cv`}
                value={d.condValue}
                onChange={(e) => set({ condValue: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {total > 1 && (
        <div>
          <Button size="sm" variant="danger-ghost" onClick={onRemove}>
            <Trash2 /> Remove step {index + 1}
          </Button>
        </div>
      )}
    </fieldset>
  );
}

export function StepsEditor({
  drafts,
  errors,
  onChange,
}: {
  drafts: StepDraft[];
  errors: Record<string, string>;
  onChange: (d: StepDraft[]) => void;
}) {
  return (
    <div className="grid gap-3">
      {drafts.map((d, i) => (
        <StepEditor
          key={d.key}
          d={d}
          index={i}
          total={drafts.length}
          error={errors[d.key]}
          onChange={(n) => onChange(drafts.map((x) => (x.key === d.key ? n : x)))}
          onRemove={() => onChange(drafts.filter((x) => x.key !== d.key))}
        />
      ))}
      {errors._ && (
        <p role="alert" className="text-xs text-danger">
          {errors._}
        </p>
      )}
      <div>
        <Button size="sm" onClick={() => onChange([...drafts, emptyStep()])}>
          <Plus /> Add step
        </Button>
      </div>
    </div>
  );
}
