'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ArchiveRestore, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Select, Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import {
  useCreateMetadataDefinition,
  useMetadataDefinitions,
  useUpdateMetadataDefinition,
  type MetadataDefinition,
} from './hooks';

const TYPES = ['text', 'number', 'date', 'boolean', 'select'] as const;

const schema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and underscores; start with a letter')
      .max(60),
    label: z.string().trim().min(1, 'Enter a label').max(100),
    field_type: z.enum(TYPES),
    required: z.boolean(),
    options: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.field_type === 'select') {
      const opts = parseOptions(v.options);
      if (opts.length === 0)
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Add at least one option (one per line)',
        });
      if (new Set(opts).size !== opts.length)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be unique' });
    }
  });
type Values = z.infer<typeof schema>;

export const parseOptions = (s: string) =>
  s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

function NewFieldDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateMetadataDefinition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { key: '', label: '', field_type: 'text', required: false, options: '' },
  });
  const type = form.watch('field_type');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New metadata field"
        description="Fields appear on every document's details."
      >
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            create.mutate(
              {
                key: v.key,
                label: v.label,
                field_type: v.field_type,
                required: v.required,
                options: v.field_type === 'select' ? parseOptions(v.options) : null,
              },
              {
                onSuccess: () => {
                  toast.success(`Created field "${v.label}"`);
                  form.reset();
                  onOpenChange(false);
                },
                onError: (e) => {
                  if (isApiError(e) && e.code === 'name_conflict')
                    form.setError('key', { message: 'A field with this key already exists.' });
                  else toast.error(friendlyMessage(e));
                },
              },
            ),
          )}
        >
          <DialogBody className="grid gap-3">
            <Field id="mf-label" label="Label" error={form.formState.errors.label?.message}>
              {(p) => <Input {...p} autoFocus {...form.register('label')} />}
            </Field>
            <Field
              id="mf-key"
              label="Key"
              hint="Used in search as meta=key:value. Cannot be changed later."
              error={form.formState.errors.key?.message}
            >
              {(p) => <Input {...p} autoComplete="off" {...form.register('key')} />}
            </Field>
            <Field id="mf-type" label="Type (cannot be changed later)">
              {(p) => (
                <Select {...p} {...form.register('field_type')}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {type === 'select' && (
              <Field
                id="mf-options"
                label="Options (one per line)"
                error={form.formState.errors.options?.message}
              >
                {(p) => <Textarea {...p} rows={4} {...form.register('options')} />}
              </Field>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="mf-required"
                checked={form.watch('required')}
                onCheckedChange={(c) => form.setValue('required', c)}
              />
              <Label htmlFor="mf-required" className="font-normal">
                Required on every document
              </Label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />} Create field
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({ d }: { d: MetadataDefinition }) {
  const update = useUpdateMetadataDefinition();
  const done = (m: string) => ({
    onSuccess: () => toast.success(m),
    onError: (e: unknown) => toast.error(friendlyMessage(e)),
  });
  return (
    <li
      className="flex flex-wrap items-center gap-3 px-4 py-3"
      data-testid="meta-def-row"
      data-archived={d.archived}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">
          {d.label} <Badge tone="outline">{d.field_type}</Badge>{' '}
          {d.required && <Badge tone="accent">Required</Badge>}{' '}
          {d.archived && <Badge tone="warn">Archived</Badge>}
        </p>
        <p className="font-mono text-xs text-muted">{d.key}</p>
        {d.options && <p className="text-xs text-muted">Options: {d.options.join(', ')}</p>}
      </div>
      {!d.archived && (
        <Button
          size="sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { id: d.id, body: { required: !d.required } },
              done(d.required ? 'Field is now optional' : 'Field is now required'),
            )
          }
        >
          Make {d.required ? 'optional' : 'required'}
        </Button>
      )}
      <Button
        size="sm"
        variant={d.archived ? 'secondary' : 'danger-ghost'}
        disabled={update.isPending}
        onClick={() =>
          update.mutate(
            { id: d.id, body: { archived: !d.archived } },
            done(d.archived ? 'Field restored' : 'Field archived'),
          )
        }
      >
        {d.archived ? <ArchiveRestore /> : <Archive />} {d.archived ? 'Restore' : 'Archive'}
      </Button>
    </li>
  );
}

export function MetadataAdminView() {
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const q = useMetadataDefinitions(archived);
  return (
    <>
      <PageHeader
        title="Metadata fields"
        description="Typed fields every document can carry. Archiving hides a field without deleting stored values."
        actions={
          <>
            <div className="flex items-center gap-2">
              <Switch id="show-archived" checked={archived} onCheckedChange={setArchived} />
              <Label htmlFor="show-archived" className="font-normal">
                Show archived
              </Label>
            </div>
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus /> New field
            </Button>
          </>
        }
      />
      <Panel>
        {q.isPending ? (
          <SkeletonRows rows={3} label="Loading fields" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data.length === 0 ? (
          <EmptyState
            title="No metadata fields"
            description="Create a field to start capturing structured information."
          />
        ) : (
          <ul className="divide-y divide-line" aria-label="Metadata fields">
            {q.data.map((d) => (
              <FieldRow key={d.id} d={d} />
            ))}
          </ul>
        )}
      </Panel>
      <NewFieldDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
