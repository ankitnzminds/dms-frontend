'use client';

import { Workflow } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useStartable } from '@/features/automations/api';
import { StartWorkflowDialog } from './start-workflow-dialog';

/** Shown on a folder only when at least one workflow can be started on it by this person. */
export function FolderWorkflowButton({ folderId, name }: { folderId: string; name: string }) {
  const q = useStartable('folder', folderId);
  const [open, setOpen] = useState(false);
  if ((q.data?.length ?? 0) === 0) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="tb-start-workflow">
        <Workflow /> <span className="hidden sm:inline">Start workflow</span>
      </Button>
      {open && (
        <StartWorkflowDialog type="folder" id={folderId} name={name} open onOpenChange={setOpen} />
      )}
    </>
  );
}
