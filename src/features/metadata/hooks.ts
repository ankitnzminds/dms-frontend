'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type Schemas } from '@/lib/api-client';

export type MetadataDefinition = Schemas['MetadataDefinitionOut'];

export function useMetadataDefinitions(includeArchived = false) {
  return useQuery({
    queryKey: ['metadata-definitions', includeArchived],
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      call<MetadataDefinition[]>(
        api.GET('/api/v1/metadata-definitions', {
          params: { query: { include_archived: includeArchived } },
          signal,
        }),
      ),
  });
}

export function useCreateMetadataDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Schemas['MetadataDefinitionIn']) =>
      call<MetadataDefinition>(api.POST('/api/v1/metadata-definitions', { body: b })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metadata-definitions'] }),
  });
}

export function useUpdateMetadataDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: Schemas['MetadataDefinitionUpdate'] }) =>
      call<MetadataDefinition>(
        api.PATCH('/api/v1/metadata-definitions/{definition_id}', {
          params: { path: { definition_id: v.id } },
          body: v.body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metadata-definitions'] }),
  });
}

export type MetaValues = Record<string, string | boolean>;

/** Stored document metadata -> editable form values. */
export function toFormValues(
  defs: MetadataDefinition[],
  metadata: Record<string, unknown>,
): MetaValues {
  const out: MetaValues = {};
  for (const d of defs) {
    const v = metadata[d.key];
    if (d.field_type === 'boolean') out[d.key] = v === true;
    else out[d.key] = v === undefined || v === null ? '' : String(v);
  }
  return out;
}

/**
 * Form values -> metadata map for PATCH (which REPLACES the whole map). Empty optional fields are omitted;
 * unknown keys already stored on the document are preserved so they can be reported by the server.
 */
export function toMetadataPayload(
  defs: MetadataDefinition[],
  values: MetaValues,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    const v = values[d.key];
    if (d.field_type === 'boolean') {
      out[d.key] = v === true;
      continue;
    }
    const s = typeof v === 'string' ? v.trim() : '';
    if (s === '') continue;
    out[d.key] = d.field_type === 'number' ? Number(s) : s;
  }
  return out;
}

/** Client-side checks that mirror the server (the server remains the authority). */
export function validateMeta(
  defs: MetadataDefinition[],
  values: MetaValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const d of defs) {
    const v = values[d.key];
    if (d.field_type === 'boolean') continue;
    const s = typeof v === 'string' ? v.trim() : '';
    if (s === '') {
      if (d.required) errors[d.key] = `${d.label} is required`;
      continue;
    }
    if (d.field_type === 'number' && !Number.isFinite(Number(s))) errors[d.key] = 'Enter a number';
    if (d.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[d.key] = 'Use YYYY-MM-DD';
    if (d.field_type === 'select' && !(d.options ?? []).includes(s))
      errors[d.key] = 'Choose one of the options';
  }
  return errors;
}

/** Server `metadata_invalid` -> {field: msg}. */
export function metadataErrorsFrom(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(details)) {
    for (const d of details as Array<{ field?: string; msg?: string }>) {
      if (d && typeof d.field === 'string' && typeof d.msg === 'string' && !(d.field in out))
        out[d.field] = d.msg;
    }
  }
  return out;
}
