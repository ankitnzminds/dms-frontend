'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Building2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMe } from '@/features/auth/session';
import { setActiveOrganizationId, useActiveOrganizationId } from './org-store';

/** Shown only when the user has more than one active organization. */
export function OrgSwitcher() {
  const { data: me } = useMe();
  const active = useActiveOrganizationId();
  const qc = useQueryClient();
  const memberships = me?.memberships.filter((m) => m.status === 'active') ?? [];
  if (memberships.length < 2) return null;
  const current = memberships.find((m) => m.organization_id === active) ?? memberships[0]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className="max-w-44"
          aria-label={`Organization: ${current.organization_name}. Switch organization`}
        >
          <Building2 />
          <span className="truncate">{current.organization_name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.organization_id}
            onSelect={() => {
              if (m.organization_id === current.organization_id) return;
              setActiveOrganizationId(m.organization_id);
              qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
              void qc.invalidateQueries({ queryKey: ['me'] });
            }}
          >
            <span className="truncate">{m.organization_name}</span>
            <span className="ml-auto text-xs capitalize text-muted">{m.role}</span>
            {m.organization_id === current.organization_id && <Check className="!text-accent" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
