'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Label, Select } from '@/components/ui/input';
import {
  metadataErrorsFrom,
  toFormValues,
  toMetadataPayload,
  useMetadataDefinitions,
  validateMeta,
  type MetaValues,
} from '@/features/metadata/hooks';
import { api, call, friendlyMessage, isApiError, type Document } from '@/lib/api-client';
import { can } from '@/lib/permissions';
import { useQueryClient } from '@tanstack/react-query';

/** Typed custom-metadata editor driven by the organization's field definitions. */
export function MetadataForm({ doc }: { doc: Document }) {
  const defsQ = useMetadataDefinitions();
  const qc = useQueryClient();
  const defs = defsQ.data ?? [];
  const editable = can(doc.permissions, 'edit_metadata');
  const [values, setValues] = useState<MetaValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rowVersion = doc.row_version;

  useEffect(() => {
    if (defsQ.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync the editable copy when the document or definitions load
      setValues(toFormValues(defsQ.data, doc.metadata));
      setErrors({});
    }
  }, [defsQ.data, doc.metadata, rowVersion]);

  if (defsQ.isPending) return <p className="text-xs text-muted">Loading fields…</p>;
  if (defsQ.isError) return <p className="text-xs text-danger">Could not load metadata fields.</p>;
  if (defs.length === 0)
    return (
      <p className="text-[13px] text-muted">
        No custom metadata fields are defined for this organization.
      </p>
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local = validateMeta(defs, values);
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      await call<Document>(
        api.PATCH('/api/v1/documents/{document_id}', {
          params: { path: { document_id: doc.id } },
          body: { metadata: toMetadataPayload(defs, values), expected_row_version: rowVersion },
        }),
      );
      toast.success('Metadata saved');
      void qc.invalidateQueries({ queryKey: ['document', doc.id] });
    } catch (err) {
      if (isApiError(err) && err.code === 'metadata_invalid') {
        const fe = metadataErrorsFrom(err.details);
        setErrors(fe);
        if (Object.keys(fe).length === 0) setFormError(err.message);
      } else if (isApiError(err) && err.code === 'stale_version') {
        setFormError('This document changed. Reload the page and try again.');
      } else {
        setFormError(friendlyMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate onSubmit={save} className="grid gap-3" aria-label="Custom metadata">
      {defs.map((d) => {
        const id = `meta-${d.key}`;
        const err = errors[d.key];
        const common = {
          id,
          'aria-invalid': !!err,
          'aria-describedby': err ? `${id}-err` : undefined,
          disabled: !editable,
        };
        return (
          <div key={d.id} className="grid gap-1">
            {d.field_type === 'boolean' ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  disabled={!editable}
                  checked={values[d.key] === true}
                  onCheckedChange={(c) => setValues((v) => ({ ...v, [d.key]: c === true }))}
                />
                <Label htmlFor={id} className="font-normal">
                  {d.label}
                </Label>
              </div>
            ) : (
              <>
                <Label htmlFor={id}>
                  {d.label}
                  {d.required && <span aria-hidden> *</span>}
                  {d.required && <span className="sr-only"> (required)</span>}
                </Label>
                {d.field_type === 'select' ? (
                  <Select
                    {...common}
                    value={String(values[d.key] ?? '')}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                  >
                    <option value="">{d.required ? 'Choose…' : 'Not set'}</option>
                    {(d.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    {...common}
                    type={
                      d.field_type === 'number'
                        ? 'number'
                        : d.field_type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    step={d.field_type === 'number' ? 'any' : undefined}
                    value={String(values[d.key] ?? '')}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                  />
                )}
              </>
            )}
            {err && (
              <p id={`${id}-err`} role="alert" className="text-xs text-danger">
                {err}
              </p>
            )}
          </div>
        );
      })}
      {formError && (
        <p role="alert" className="text-xs text-danger">
          {formError}
        </p>
      )}
      {editable ? (
        <div>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />} Save metadata
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">You do not have permission to edit this metadata.</p>
      )}
    </form>
  );
}
