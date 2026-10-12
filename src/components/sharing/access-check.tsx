'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, ShieldQuestion } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MemberPicker } from '@/features/members/member-picker';
import { api, call, friendlyMessage, type Schemas } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { actionLabel } from '@/lib/permissions';
import type { ResourceKind } from '@/features/sharing/hooks';

type Check = Schemas['AccessCheckOut'];

/**
 * Administrator "Check access": what can this person do with this item, and why? The answer comes from the same
 * engine that enforces access on every request (it is not a separate calculation), plus the grants behind it.
 */
export function AccessCheck({ kind, id }: { kind: ResourceKind; id: string }) {
  const [person, setPerson] = useState<{ id: string; label: string } | null>(null);
  const check = useMutation({
    mutationFn: (userId: string) =>
      call<Check>(
        api.POST('/api/v1/admin/access-check', {
          body: { resource_type: kind, resource_id: id, user_id: userId },
        }),
      ),
  });
  const r = check.data;
  return (
    <section aria-label="Check access" className="grid gap-2 rounded-md border border-line p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
        <ShieldQuestion className="size-4" aria-hidden /> Check access
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <MemberPicker
            label="Person"
            inputId="check-person"
            onSelect={(u) => {
              setPerson({ id: u.id, label: u.display_name ?? u.email ?? u.id });
              check.reset();
            }}
          />
        </div>
        <Button
          disabled={!person || check.isPending}
          onClick={() => person && check.mutate(person.id)}
        >
          {check.isPending && <Loader2 className="animate-spin" aria-hidden />} Check{' '}
          {person ? person.label : ''}
        </Button>
      </div>
      {check.isError && (
        <p role="alert" className="text-xs text-danger">
          {friendlyMessage(check.error)}
        </p>
      )}
      {r && (
        <div className="grid gap-2 text-[13px]" aria-live="polite">
          <p>
            <strong>{r.user_email}</strong> can do:{' '}
            {r.actions.length === 0 ? (
              <span className="text-muted">nothing with this item</span>
            ) : (
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {r.actions.map((a) => (
                  <Badge key={a} tone="ok">
                    {actionLabel(a)}
                  </Badge>
                ))}
              </span>
            )}
          </p>
          {r.note && <p className="text-xs text-warn">{r.note}</p>}
          {r.sources.length > 0 && (
            <ul className="grid gap-1 text-xs">
              {r.sources.map((s, i) => (
                <li key={i} className="rounded-md bg-surface-2 px-2 py-1">
                  <strong>{s.via}</strong>
                  {s.inherited_from && (
                    <span className="text-muted"> · inherited from “{s.inherited_from}”</span>
                  )}
                  {s.actions.length > 0 && (
                    <span className="text-muted"> · {s.actions.map(actionLabel).join(', ')}</span>
                  )}
                  {s.expires_at && (
                    <span className="text-muted"> · until {formatDate(s.expires_at)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Before a broad grant: how many folders and files it would reach. */
export function AclImpact({
  kind,
  id,
  subjectType,
  subjectId,
  inherit,
}: {
  kind: ResourceKind;
  id: string;
  subjectType: 'user' | 'group' | 'organization';
  subjectId: string | null;
  inherit: boolean;
}) {
  const q = useQuery({
    queryKey: ['acl-impact', kind, id, subjectType, subjectId, inherit],
    enabled: subjectType === 'organization' || !!subjectId,
    queryFn: ({ signal }) =>
      call<Schemas['ImpactOut']>(
        api.POST('/api/v1/admin/acl-impact', {
          body: {
            resource_type: kind,
            resource_id: id,
            subject_type: subjectType,
            subject_id: subjectId,
            inherit,
          },
          signal,
        }),
      ),
  });
  if (!q.data) return null;
  return (
    <p className="mt-1 text-xs" data-testid="acl-impact">
      <strong>{q.data.subject_label}</strong>: {q.data.note}
    </p>
  );
}
