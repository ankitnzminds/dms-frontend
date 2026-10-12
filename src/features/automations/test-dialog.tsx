'use client';

import { Loader2, Play } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { friendlyMessage } from '@/lib/api-client';
import { useDryRun, type Automation, type DryRun } from './api';
import { RUN_TONE } from './runs-dialog';

/** Dry run against one real item: conditions really evaluate, every other step only reports what it would do. */
export function TestDialog({
  automation,
  onClose,
}: {
  automation: Automation | null;
  onClose: () => void;
}) {
  const test = useDryRun();
  const [resourceId, setResourceId] = useState('');
  const [result, setResult] = useState<DryRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = ['periodic_interval', 'specified_date', 'periodic_schedule'].includes(
    automation?.trigger.key ?? '',
  );

  function reset() {
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <Dialog open={!!automation} onOpenChange={(o) => !o && reset()}>
      <DialogContent
        title={`Test “${automation?.name ?? ''}”`}
        description="A dry run. Nothing is sent, copied, moved, deleted or granted, and it is not recorded as a real run."
      >
        <DialogBody className="grid gap-3">
          {!timer && (
            <Field
              id="dry-resource"
              label="File, folder or user ID to test against"
              hint="Copy the ID from the item's address (for example /documents/<id>)."
            >
              {(p) => (
                <Input
                  {...p}
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value.trim())}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              )}
            </Field>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          {result && (
            <div className="grid gap-2 text-[13px]" aria-live="polite">
              <p>
                Would this fire for that item?{' '}
                <Badge tone={result.would_trigger ? 'ok' : 'neutral'}>
                  {result.would_trigger ? 'Yes' : 'No: the condition does not match'}
                </Badge>
              </p>
              <ol className="grid gap-1.5">
                {result.run.nodes.map((n) => (
                  <li
                    key={n.node_id}
                    className="rounded-md border border-line px-2.5 py-1.5 text-xs"
                  >
                    <strong>{n.label}</strong> <Badge tone={RUN_TONE[n.status]}>{n.status}</Badge>
                    {n.error && <p className="text-danger">{n.error}</p>}
                    <p className="text-muted">{JSON.stringify(n.output)}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={reset}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={test.isPending || (!timer && !resourceId)}
            onClick={() => {
              setError(null);
              test.mutate(
                { id: automation!.id, resourceId: timer ? null : resourceId },
                { onSuccess: setResult, onError: (e) => setError(friendlyMessage(e)) },
              );
            }}
          >
            {test.isPending ? <Loader2 className="animate-spin" /> : <Play />} Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
