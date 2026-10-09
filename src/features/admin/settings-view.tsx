'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Field, Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useOrganization } from '@/features/sharing/hooks';
import { friendlyMessage, isApiError } from '@/lib/api-client';
import { useUpdateOrganization } from './hooks';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter an organization name').max(200),
  mask_shared_breadcrumbs: z.boolean(),
  require_share_expiry: z.boolean(),
  max_share_days: z
    .number({ error: 'Enter a number of days' })
    .int('Use whole days')
    .min(1, 'At least 1 day')
    .max(3650, 'At most 3650 days'),
});
type Values = z.infer<typeof schema>;

export function SettingsView() {
  const org = useOrganization();
  const update = useUpdateOrganization();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      mask_shared_breadcrumbs: false,
      require_share_expiry: false,
      max_share_days: 365,
    },
  });

  useEffect(() => {
    if (!org.data) return;
    const s = org.data.settings as Partial<Values>;
    form.reset({
      name: org.data.name,
      mask_shared_breadcrumbs: !!s.mask_shared_breadcrumbs,
      require_share_expiry: !!s.require_share_expiry,
      max_share_days: typeof s.max_share_days === 'number' ? s.max_share_days : 365,
    });
  }, [org.data, form]);

  if (org.isError) return <ErrorState error={org.error} onRetry={() => org.refetch()} />;
  if (org.isPending) return <Skeleton className="h-64 max-w-xl" />;

  return (
    <>
      <PageHeader title="Organization settings" />
      <Panel className="max-w-xl p-5">
        <form
          noValidate
          className="grid gap-5"
          onSubmit={form.handleSubmit((v) =>
            update.mutate(
              {
                name: v.name,
                settings: {
                  ...(org.data.settings as Record<string, unknown>),
                  mask_shared_breadcrumbs: v.mask_shared_breadcrumbs,
                  require_share_expiry: v.require_share_expiry,
                  max_share_days: v.max_share_days,
                },
              },
              {
                onSuccess: () => toast.success('Settings saved'),
                onError: (e) => {
                  if (isApiError(e) && e.status === 422) {
                    const fe = e.fieldErrors;
                    if (fe.name) form.setError('name', { message: fe.name });
                    if (fe.max_share_days)
                      form.setError('max_share_days', { message: fe.max_share_days });
                  }
                  toast.error(friendlyMessage(e));
                },
              },
            ),
          )}
        >
          <Field id="s-name" label="Organization name" error={form.formState.errors.name?.message}>
            {(p) => <Input {...p} {...form.register('name')} />}
          </Field>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="s-mask">Hide folder names in shared paths</Label>
              <p className="text-xs text-muted">
                Recipients see only the item, not the names of the folders above it.
              </p>
            </div>
            <Controller
              control={form.control}
              name="mask_shared_breadcrumbs"
              render={({ field }) => (
                <Switch id="s-mask" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="s-req">Require an expiry on every share</Label>
              <p className="text-xs text-muted">People cannot create shares that never expire.</p>
            </div>
            <Controller
              control={form.control}
              name="require_share_expiry"
              render={({ field }) => (
                <Switch id="s-req" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <Field
            id="s-max"
            label="Longest allowed share (days)"
            error={form.formState.errors.max_share_days?.message}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={3650}
                className="w-32"
                {...form.register('max_share_days', { valueAsNumber: true })}
              />
            )}
          </Field>

          <div>
            <Button
              type="submit"
              variant="primary"
              disabled={update.isPending || !form.formState.isDirty}
            >
              {update.isPending && <Loader2 className="animate-spin" aria-hidden />} Save changes
            </Button>
          </div>
        </form>
      </Panel>
    </>
  );
}
