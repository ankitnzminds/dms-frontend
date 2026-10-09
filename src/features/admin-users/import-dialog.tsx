'use client';

import { Download, FileUp, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { friendlyMessage } from '@/lib/api-client';
import { downloadBlob, fetchImportTemplate, useCommitImport, usePreviewImport } from './api';

const MAX_BYTES = 1_000_000;
const OUTCOME = {
  create: { tone: 'ok', label: 'Will be created' },
  skip_existing: { tone: 'neutral', label: 'Already exists: skipped' },
  invalid: { tone: 'danger', label: 'Invalid' },
} as const;

export function ImportUsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = usePreviewImport();
  const commit = useCommitImport();

  function reset() {
    setCsv(null);
    setFileName('');
    setReadError(null);
    preview.reset();
    commit.reset();
  }

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    if (file.size > MAX_BYTES) return setReadError('The file is larger than 1 MB.');
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    preview.mutate(text, { onError: (e) => setReadError(friendlyMessage(e)) });
  }

  const pv = preview.data;
  const result = commit.data;

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && reset())}>
      <DialogContent
        className="max-w-3xl"
        title="Import users"
        description="Check a CSV first, then create the valid rows. Nothing changes until you confirm."
      >
        <DialogBody className="grid gap-3">
          <Tabs defaultValue="csv">
            <TabsList>
              <TabsTrigger value="csv">CSV file</TabsTrigger>
              <TabsTrigger value="directory">Directory</TabsTrigger>
            </TabsList>
            <TabsContent value="csv" className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={async () => {
                    try {
                      downloadBlob(await fetchImportTemplate(), 'users-template.csv');
                    } catch (e) {
                      toast.error(friendlyMessage(e));
                    }
                  }}
                >
                  <Download /> Download template
                </Button>
                <Button variant="primary" onClick={() => input.current?.click()}>
                  <FileUp /> Choose CSV…
                </Button>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  aria-label="CSV file"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {fileName && <span className="text-xs text-muted">{fileName}</span>}
              </div>
              <p className="text-xs text-muted">
                Columns: UserName, EmailID, DisplayName, Status (Full, Guest or External),
                ExpirationDate (YYYY-MM-DD) and Groups (separated by “;”). Only EmailID is required.
                A Password column is ignored — people sign in through your identity provider.
                Existing accounts are skipped, never overwritten. Up to 1000 rows or 1 MB.
              </p>
              {readError && (
                <p role="alert" className="text-[13px] text-danger">
                  {readError}
                </p>
              )}
              {preview.isPending && (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Checking the file…
                </p>
              )}
              {pv && !result && (
                <div className="grid gap-2">
                  <p className="flex flex-wrap gap-2 text-[13px]" aria-live="polite">
                    <Badge tone="ok">{pv.creates} to create</Badge>
                    <Badge>{pv.existing} already exist</Badge>
                    <Badge tone={pv.invalid ? 'danger' : 'neutral'}>{pv.invalid} invalid</Badge>
                    <span className="text-muted">of {pv.total} rows</span>
                  </p>
                  {pv.columns_seen.some((c) => c.startsWith('(Password')) && (
                    <p className="text-xs text-warn">
                      The Password column is ignored: no passwords are imported or stored.
                    </p>
                  )}
                  <div className="max-h-64 overflow-auto rounded-md border border-line">
                    <table className="w-full border-collapse text-[13px]">
                      <caption className="sr-only">Import preview</caption>
                      <thead>
                        <tr className="border-b border-line bg-surface-2 text-left text-xs text-muted">
                          <th scope="col" className="px-3 py-1.5 font-medium">
                            Line
                          </th>
                          <th scope="col" className="px-3 py-1.5 font-medium">
                            Email
                          </th>
                          <th scope="col" className="px-3 py-1.5 font-medium">
                            Result
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pv.rows.map((r) => (
                          <tr key={r.line} className="border-b border-line last:border-0 align-top">
                            <td className="px-3 py-1.5 text-muted">{r.line}</td>
                            <td className="px-3 py-1.5">{r.email ?? '-'}</td>
                            <td className="px-3 py-1.5">
                              <Badge tone={OUTCOME[r.outcome].tone}>
                                {OUTCOME[r.outcome].label}
                              </Badge>
                              {r.problems.map((p) => (
                                <p key={p} className="text-xs text-danger">
                                  {p}
                                </p>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pv.total > pv.rows.length && (
                    <p className="text-xs text-muted">Showing the first {pv.rows.length} rows.</p>
                  )}
                </div>
              )}
              {result && (
                <div
                  className="grid gap-1 rounded-md bg-ok-soft px-3 py-2 text-[13px]"
                  role="status"
                >
                  <p className="font-medium text-ok">
                    Imported: {result.created} created, {result.skipped_existing} skipped,{' '}
                    {result.invalid} invalid.
                  </p>
                  {result.errors.slice(0, 5).map((r) => (
                    <p key={r.line} className="text-xs text-danger">
                      Line {r.line}: {r.problems.join(' ')}
                    </p>
                  ))}
                  <p className="text-xs text-muted">
                    No email was sent. Imported people appear as pending invitations.
                  </p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="directory">
              <p className="rounded-md bg-surface-2 px-4 py-6 text-center text-[13px] text-muted">
                Directory users are provisioned by directory sync, with preview and explicit group
                mapping. Open{' '}
                <a className="text-accent underline" href="/admin/directory">
                  Directory sync
                </a>{' '}
                to configure and run it.
              </p>
            </TabsContent>
          </Tabs>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="primary"
            disabled={!csv || !pv || pv.creates === 0 || commit.isPending || !!result}
            onClick={() =>
              csv &&
              commit.mutate(csv, {
                onSuccess: (r) =>
                  toast.success(`Created ${r.created} user${r.created === 1 ? '' : 's'}`),
                onError: (e) => toast.error(friendlyMessage(e)),
              })
            }
          >
            {commit.isPending && <Loader2 className="animate-spin" aria-hidden />}
            Import {pv ? pv.creates : ''} user{pv?.creates === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
