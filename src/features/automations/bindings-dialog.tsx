'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { friendlyMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useUpdateAutomation, type Automation } from './api';

const MODES = [
  {
    value: 'additive',
    title: 'Additive',
    body: 'Runs every time it matches, next to any other workflow that matches the same event.',
  },
  {
    value: 'exclusive',
    title: 'Exclusive',
    body: 'When several exclusive workflows match the same event, only the most specific one runs (the deepest folder, then file types and filters). A folder rule can replace a general one.',
  },
] as const;

/** Where the trigger applies, in words, read from the trigger's own settings. */
export function scopeSummary(a: Pick<Automation, 'trigger'>): string {
  const p = a.trigger.params as {
    path?: string | null;
    recursive?: boolean;
    extensions?: string[];
  };
  const where = p.path
    ? `${p.path}${p.recursive === false ? '' : ' and everything below it'}`
    : 'Everywhere';
  const ext = p.extensions?.length
    ? `, only ${p.extensions.map((e) => `.${e}`).join(' ')} files`
    : '';
  return `${where}${ext}`;
}

function Form({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const update = useUpdateAutomation();
  const [mode, setMode] = useState<'additive' | 'exclusive'>(automation.binding_mode);
  const [priority, setPriority] = useState(String(automation.priority));
  const n = Number(priority);
  const valid = Number.isInteger(n) && n >= 0 && n <= 1000;

  function save() {
    update.mutate(
      { id: automation.id, body: { binding_mode: mode, priority: n } },
      {
        onSuccess: () => {
          toast.success('Binding saved');
          onClose();
        },
        onError: (e) => toast.error(friendlyMessage(e)),
      },
    );
  }

  return (
    <>
      <DialogBody className="grid gap-4">
        <div className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
          <p className="text-xs text-muted">Applies to</p>
          <p className="font-medium">{scopeSummary(automation)}</p>
          <p className="mt-1 text-xs text-muted">
            Change this under Start in the workflow editor (folder path, file types, filters).
          </p>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">When several workflows match</legend>
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2',
                mode === m.value
                  ? 'border-accent bg-accent-soft/40 ring-1 ring-accent'
                  : 'border-line',
              )}
            >
              <input
                type="radio"
                name="binding-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="mt-1"
              />
              <span className="text-[13px]">
                <span className="block font-medium">{m.title}</span>
                <span className="block text-xs text-muted">{m.body}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field
          id="binding-priority"
          label="Priority"
          hint="Breaks a tie between equally specific exclusive workflows: the higher number wins."
          error={valid ? undefined : 'Use a whole number from 0 to 1000.'}
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              min={0}
              max={1000}
              className="w-28"
              value={priority}
              disabled={mode !== 'exclusive'}
              onChange={(e) => setPriority(e.target.value)}
            />
          )}
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!valid || update.isPending} onClick={save}>
          {update.isPending && <Loader2 className="animate-spin" />} Save
        </Button>
      </DialogFooter>
    </>
  );
}

export function BindingsDialog({
  automation,
  onClose,
}: {
  automation: Automation | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!automation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg"
        title="Bindings"
        description={automation ? `Where and how “${automation.name}” applies.` : undefined}
      >
        {automation && (
          <Form
            key={`${automation.id}:${automation.row_version}`}
            automation={automation}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
