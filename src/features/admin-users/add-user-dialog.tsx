'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { useMe } from '@/features/auth/session';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { useCreateUser } from './api';

export const ACCESS_LEVELS = [
  { value: 'full', label: 'Full', hint: 'Licensed account with storage' },
  { value: 'guest', label: 'Guest', hint: 'Licensed account with no storage' },
  { value: 'external', label: 'External', hint: 'Free account with no storage' },
] as const;

const schema = z.object({
  email: z.string().trim().min(1, 'Enter an email address').email('Enter a valid email address'),
  username: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === '' || /^[A-Za-z0-9][A-Za-z0-9._@-]{1,99}$/.test(v), {
      message: 'Use letters, digits and . _ @ - (2-100 characters)',
    }),
  display_name: z.string().trim().max(200),
  access_level: z.enum(['full', 'guest', 'external']),
  role: z.enum(['owner', 'admin', 'member', 'auditor']),
});
type Form = z.infer<typeof schema>;

export function AddUserDialog({
  open,
  onOpenChange,
  defaultRole = 'member',
  title = 'Add user',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultRole?: 'member' | 'admin' | 'auditor';
  title?: string;
}) {
  const { data: me } = useMe();
  const create = useCreateUser();
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      username: '',
      display_name: '',
      access_level: 'full',
      role: defaultRole,
    },
  });
  const level = form.watch('access_level');
  const roles =
    me?.role === 'owner' ? ['member', 'auditor', 'admin', 'owner'] : ['member', 'auditor', 'admin'];

  return (
    <Dialog open={open} onOpenChange={(o) => (onOpenChange(o), !o && form.reset())}>
      <DialogContent
        title={title}
        description="Creates the account and a pending invitation. The person signs in through your identity provider."
      >
        <form
          noValidate
          onSubmit={form.handleSubmit((v) =>
            create.mutate(
              {
                email: v.email,
                username: v.username || null,
                display_name: v.display_name || null,
                access_level: v.access_level,
                role: v.role,
              },
              {
                onSuccess: (r) => {
                  toast.success(
                    r.invitation_email === 'not_configured'
                      ? `Added ${v.email}. No email was sent: email delivery is not configured.`
                      : `Added ${v.email}. Invitation queued.`,
                  );
                  onOpenChange(false);
                  form.reset();
                },
                onError: (e) => {
                  if (isApiError(e) && e.code === 'already_member')
                    form.setError('email', { message: 'That person is already a member.' });
                  else if (isApiError(e) && e.code === 'username_taken')
                    form.setError('username', { message: 'That user name is already in use.' });
                  else if (isApiError(e) && e.fieldErrors.email)
                    form.setError('email', { message: e.fieldErrors.email });
                  else toast.error(friendlyMessage(e));
                },
              },
            ),
          )}
        >
          <DialogBody className="grid gap-3">
            <Field
              id="au-auth"
              label="Authentication"
              hint="Directory (AD/LDAP) accounts are created by directory sync, not here."
            >
              {(p) => (
                <Select {...p} defaultValue="default">
                  <option value="default">Default authentication</option>
                  <option value="directory" disabled>
                    Active Directory / LDAP (use Directory sync)
                  </option>
                </Select>
              )}
            </Field>
            <Field
              id="au-level"
              label="Access level"
              hint={ACCESS_LEVELS.find((a) => a.value === level)?.hint}
            >
              {(p) => (
                <Select {...p} {...form.register('access_level')}>
                  {ACCESS_LEVELS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label} ({a.hint})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              id="au-username"
              label="User name"
              error={form.formState.errors.username?.message}
            >
              {(p) => <Input {...p} autoComplete="off" {...form.register('username')} />}
            </Field>
            <Field id="au-display" label="Display name">
              {(p) => <Input {...p} {...form.register('display_name')} />}
            </Field>
            <Field id="au-email" label="Email" error={form.formState.errors.email?.message}>
              {(p) => <Input {...p} type="email" autoComplete="off" {...form.register('email')} />}
            </Field>
            <Field
              id="au-role"
              label="Role"
              hint="Admin roles can manage people; Auditor is read-only."
            >
              {(p) => (
                <Select {...p} {...form.register('role')}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
              No password is set in DMS: sign-in and password resets belong to your identity
              provider. “Send email notification” is unavailable until an email provider is
              configured on the server.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />} Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
