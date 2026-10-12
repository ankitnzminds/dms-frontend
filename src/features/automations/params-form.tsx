'use client';

import { Folder as FolderIcon, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { FolderPicker, type PickedFolder } from '@/components/file-browser/folder-picker';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAdminMembers } from '@/features/admin/hooks';
import { MemberPicker } from '@/features/members/member-picker';
import { useGroups } from '@/features/sharing/hooks';
import { useFolder } from '@/features/files/hooks';
import { useWorkflows } from '@/features/workflows/hooks';
import { cn } from '@/lib/utils';

/** The slice of JSON Schema that pydantic emits for our parameter models. */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, Prop>;
  required?: string[];
  $defs?: Record<string, JsonSchema>;
}
interface Prop {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  const?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: Prop;
  anyOf?: Prop[];
  $ref?: string;
}

export type Params = Record<string, unknown>;

const TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

function resolve(prop: Prop, defs: JsonSchema['$defs']): Prop {
  // nullable fields come as anyOf [{type}, {type:'null'}]
  if (prop.anyOf) {
    const real = prop.anyOf.find((p) => p.type !== 'null') ?? prop.anyOf[0]!;
    return { ...prop, ...resolve(real, defs), description: prop.description ?? real.description };
  }
  if (prop.$ref && defs) {
    const name = prop.$ref.split('/').pop()!;
    return { ...prop, ...(defs[name] as Prop) };
  }
  return prop;
}

const label = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ids?$/i, (m) => m.toLowerCase());

function FolderField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedFolder | null>(null);
  const known = useFolder(value || undefined);
  return (
    <>
      <div className="flex items-center gap-2">
        <Button id={id} onClick={() => setOpen(true)}>
          <FolderIcon /> {value ? 'Change folder' : 'Choose folder…'}
        </Button>
        <span className="truncate text-[13px] text-muted">
          {value ? (known.data?.name ?? 'Selected folder') : 'No folder chosen'}
        </span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Choose a folder"
          description="Only folders you can add items to can be chosen."
        >
          <DialogBody>{open && <FolderPicker onChange={setPicked} />}</DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!picked?.canCreate}
              onClick={() => {
                if (picked) onChange(picked.id);
                setOpen(false);
              }}
            >
              Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useNames(): Record<string, string> {
  const members = useAdminMembers({ q: '', limit: 200, offset: 0 });
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of members.data?.items ?? []) out[m.user_id] = m.display_name ?? m.email;
    return out;
  }, [members.data]);
}

function UsersField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const names = useNames();
  const [extra, setExtra] = useState<Record<string, string>>({});
  return (
    <div className="grid gap-1.5">
      <MemberPicker
        label="Add a person"
        inputId={id}
        excludeIds={value}
        onSelect={(u) => {
          setExtra((e) => ({ ...e, [u.id]: u.display_name ?? u.email ?? u.id }));
          onChange([...value, u.id]);
        }}
      />
      <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people">
        {value.map((uid) => (
          <li
            key={uid}
            className="flex items-center gap-1 rounded-full bg-surface-3 py-0.5 pl-2.5 pr-1 text-xs"
          >
            {extra[uid] ?? names[uid] ?? uid.slice(0, 8)}
            <button
              type="button"
              aria-label={`Remove ${extra[uid] ?? names[uid] ?? uid}`}
              onClick={() => onChange(value.filter((x) => x !== uid))}
              className="rounded-full p-0.5 hover:bg-surface-2"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const groups = useGroups();
  return (
    <div className="grid max-h-32 gap-1 overflow-y-auto">
      {(groups.data?.items ?? []).map((g) => (
        <label key={g.id} className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={value.includes(g.id)}
            onCheckedChange={(c) =>
              onChange(c === true ? [...value, g.id] : value.filter((x) => x !== g.id))
            }
          />
          {g.name}
        </label>
      ))}
      {groups.data?.items.length === 0 && (
        <span className="text-xs text-muted">No groups yet.</span>
      )}
    </div>
  );
}

function toLocalInput(v: string): string {
  return v ? v.slice(0, 16) : '';
}

function Field({
  name,
  prop,
  value,
  onChange,
  params,
  error,
  defs,
  required,
}: {
  name: string;
  prop: Prop;
  value: unknown;
  onChange: (v: unknown) => void;
  params: Params;
  error?: string;
  defs: JsonSchema['$defs'];
  required: boolean;
}) {
  const id = useId();
  const workflows = useWorkflows();
  const groups = useGroups();
  const p = resolve(prop, defs);
  const labelText = label(name);
  const hint = p.description;

  let control: React.ReactNode;
  if (name === 'target_folder_id' || name === 'parent_folder_id') {
    control = <FolderField id={id} value={(value as string) ?? ''} onChange={onChange} />;
  } else if (name === 'user_ids' || name === 'alert_user_ids') {
    control = <UsersField id={id} value={(value as string[]) ?? []} onChange={onChange} />;
  } else if (name === 'group_ids') {
    control = <GroupsField value={(value as string[]) ?? []} onChange={onChange} />;
  } else if (name === 'subject_id') {
    control =
      params.subject_type === 'group' ? (
        <Select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a group…</option>
          {(groups.data?.items ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      ) : (
        <UsersField
          id={id}
          value={value ? [value as string] : []}
          onChange={(v) => onChange(v[v.length - 1] ?? '')}
        />
      );
  } else if (name === 'approval_workflow_id') {
    control = (
      <Select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose an approval workflow…</option>
        {(workflows.data ?? []).map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
    );
  } else if (p.enum && p.type === 'string') {
    control = (
      <Select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
        {!required && <option value="">—</option>}
        {p.enum.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  } else if (p.type === 'array' && prop.items?.enum) {
    const picked = (value as string[]) ?? [];
    control = (
      <div className="flex flex-wrap gap-3">
        {prop.items.enum.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[13px]">
            <Checkbox
              checked={picked.includes(o)}
              onCheckedChange={(c) =>
                onChange(c === true ? [...picked, o] : picked.filter((x) => x !== o))
              }
            />
            {o}
          </label>
        ))}
      </div>
    );
  } else if (p.type === 'array') {
    control = (
      <Input
        id={id}
        value={((value as string[]) ?? []).join(', ')}
        placeholder="comma, separated"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    );
  } else if (p.type === 'boolean' || p.const === true) {
    control = (
      <label className="flex items-center gap-2 text-[13px]">
        {p.const === true ? (
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(c) => onChange(c === true)}
          />
        ) : (
          <Switch id={id} checked={value === true} onCheckedChange={onChange} />
        )}
        <span className="text-muted">{value === true ? 'Yes' : 'No'}</span>
      </label>
    );
  } else if (p.type === 'integer' || p.type === 'number') {
    control = (
      <Input
        id={id}
        type="number"
        className="w-40"
        min={p.minimum}
        max={p.maximum}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    );
  } else if (name === 'timezone') {
    control = (
      <>
        <Input
          id={id}
          list={`${id}-tz`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <datalist id={`${id}-tz`}>
          {TIMEZONES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </>
    );
  } else if (name === 'run_at' || name === 'start_at' || name === 'end_at') {
    control = (
      <Input
        id={id}
        type="datetime-local"
        className="w-64"
        value={toLocalInput((value as string) ?? '')}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:00` : null)}
      />
    );
  } else if (name === 'time') {
    control = (
      <Input
        id={id}
        type="time"
        className="w-36"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else if ((p.maxLength ?? 0) >= 500 && name !== 'expression') {
    control = (
      <Textarea
        id={id}
        value={(value as string) ?? ''}
        maxLength={p.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  } else {
    control = (
      <Input
        id={id}
        value={value === null || value === undefined ? '' : String(value)}
        maxLength={p.maxLength}
        placeholder={
          name === 'path'
            ? '/Finance/Invoices'
            : name === 'expression'
              ? "file.extension == 'pdf'"
              : undefined
        }
        className={cn(name === 'expression' && 'font-mono text-xs')}
        onChange={(e) => onChange(e.target.value === '' && !required ? null : e.target.value)}
      />
    );
  }
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>
        {labelText}
        {required && <span className="text-danger"> *</span>}
      </Label>
      {control}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

/**
 * Typed form generated from the parameter model's JSON Schema (served by the backend, so the form and the
 * server validation can never disagree), with an "Advanced" raw-JSON view for power users.
 */
export function ParamsForm({
  schema,
  value,
  onChange,
  errors = {},
  variables,
}: {
  schema: JsonSchema;
  value: Params;
  onChange: (v: Params) => void;
  errors?: Record<string, string>;
  variables?: Record<string, string>;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  function openAdvanced() {
    setRaw(JSON.stringify(value, null, 2));
    setRawError(null);
    setAdvanced(true);
  }
  function edit(text: string) {
    setRaw(text);
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('The configuration must be a JSON object.');
      setRawError(null);
      onChange(parsed as Params);
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  }

  return (
    <div className="grid gap-3">
      {variables && Object.keys(variables).length > 0 && (
        <details className="rounded-md bg-surface-2 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Variables you can use</summary>
          <ul className="mt-1.5 grid gap-0.5">
            {Object.entries(variables).map(([k, d]) => (
              <li key={k}>
                <code className="rounded bg-surface-3 px-1">{k}</code>{' '}
                <span className="text-muted">{d}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {advanced ? (
        <div className="grid gap-1">
          <Label htmlFor="params-json">Configuration (JSON)</Label>
          <Textarea
            id="params-json"
            rows={12}
            spellCheck={false}
            className="font-mono text-xs"
            aria-invalid={!!rawError}
            value={raw}
            onChange={(e) => edit(e.target.value)}
          />
          {rawError && (
            <p role="alert" className="text-xs text-danger">
              {rawError}
            </p>
          )}
        </div>
      ) : (
        Object.entries(props).map(([name, prop]) => (
          <Field
            key={name}
            name={name}
            prop={prop}
            value={value[name]}
            onChange={(v) => onChange({ ...value, [name]: v })}
            params={value}
            error={errors[name]}
            defs={schema.$defs}
            required={required.has(name)}
          />
        ))
      )}
      <button
        type="button"
        className="justify-self-start text-xs text-accent hover:underline"
        onClick={() => (advanced ? setAdvanced(false) : openAdvanced())}
        disabled={advanced && !!rawError}
      >
        {advanced ? 'Back to the form' : 'Advanced: edit as JSON'}
      </button>
    </div>
  );
}
