'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader, Panel } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { Field, Input, Label } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useOrganization } from '@/features/sharing/hooks';
import { CLASSIFICATIONS, friendlyMessage, isApiError } from '@/lib/api-client';
import { useUpdateOrganization } from './hooks';

const int = (msg: string, min: number, max: number) =>
  z
    .number({ error: msg })
    .int('Use whole days')
    .min(min, `At least ${min} day${min === 1 ? '' : 's'}`)
    .max(max, `At most ${max} days`);

const schema = z.object({
  name: z.string().trim().min(1, 'Enter an organization name').max(200),
  mask_shared_breadcrumbs: z.boolean(),
  require_share_expiry: z.boolean(),
  max_share_days: int('Enter a number of days', 1, 3650),
  trash_retention_days: int('Enter a number of days', 1, 3650),
  share_blocked_classifications: z.array(z.string()),
  email_include_titles: z.boolean(),
  signatures_enabled: z.boolean(),
  allow_external_signers: z.boolean(),
});
type Values = z.infer<typeof schema>;

function Toggle({
  form,
  name,
  label,
  hint,
}: {
  form: ReturnType<typeof useForm<Values>>;
  name:
    | 'mask_shared_breadcrumbs'
    | 'require_share_expiry'
    | 'email_include_titles'
    | 'signatures_enabled'
    | 'allow_external_signers';
  label: string;
  hint: string;
}) {
  const id = `s-${name}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
        )}
      />
    </div>
  );
}

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
      trash_retention_days: 30,
      share_blocked_classifications: ['restricted'],
      email_include_titles: false,
      signatures_enabled: false,
      allow_external_signers: false,
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
      trash_retention_days:
        typeof s.trash_retention_days === 'number' ? s.trash_retention_days : 30,
      share_blocked_classifications: Array.isArray(s.share_blocked_classifications)
        ? s.share_blocked_classifications
        : [],
      email_include_titles: !!s.email_include_titles,
      signatures_enabled: !!s.signatures_enabled,
      allow_external_signers: !!s.allow_external_signers,
    });
  }, [org.data, form]);

  if (org.isError) return <ErrorState error={org.error} onRetry={() => org.refetch()} />;
  if (org.isPending) return <Skeleton className="h-64 max-w-xl" />;

  const errors = form.formState.errors;
  return (
    <>
      <PageHeader title="Organization settings" />
      <Panel className="max-w-xl p-5">
        <form
          noValidate
          className="grid gap-5"
          onSubmit={form.handleSubmit((v) => {
            const { name, ...settings } = v;
            update.mutate(
              {
                name,
                settings: { ...(org.data.settings as Record<string, unknown>), ...settings },
              },
              {
                onSuccess: () => toast.success('Settings saved'),
                onError: (e) => {
                  if (isApiError(e) && e.status === 422) {
                    const fe = e.fieldErrors;
                    if (fe.name) form.setError('name', { message: fe.name });
                    if (fe.max_share_days)
                      form.setError('max_share_days', { message: fe.max_share_days });
                    if (fe.trash_retention_days)
                      form.setError('trash_retention_days', { message: fe.trash_retention_days });
                  }
                  toast.error(friendlyMessage(e));
                },
              },
            );
          })}
        >
          <Field id="s-name" label="Organization name" error={errors.name?.message}>
            {(p) => <Input {...p} {...form.register('name')} />}
          </Field>

          <h2 className="-mb-2 text-sm font-semibold">Sharing</h2>
          <Toggle
            form={form}
            name="mask_shared_breadcrumbs"
            label="Hide folder names in shared paths"
            hint="Recipients see only the item, not the names of the folders above it."
          />
          <Toggle
            form={form}
            name="require_share_expiry"
            label="Require an expiry on every share"
            hint="People cannot create shares that never expire."
          />
          <Field
            id="s-max"
            label="Longest allowed share (days)"
            error={errors.max_share_days?.message}
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
          <fieldset className="grid gap-1.5">
            <legend className="text-[13px] font-medium">
              Classifications that cannot be shared
            </legend>
            <p className="text-xs text-muted">
              Documents with these classifications are blocked from new shares.
            </p>
            <Controller
              control={form.control}
              name="share_blocked_classifications"
              render={({ field }) => (
                <div className="flex flex-wrap gap-4">
                  {CLASSIFICATIONS.map((c) => (
                    <div key={c} className="flex items-center gap-2">
                      <Checkbox
                        id={`blk-${c}`}
                        checked={field.value.includes(c)}
                        onCheckedChange={(on) =>
                          field.onChange(
                            on ? [...field.value, c] : field.value.filter((x) => x !== c),
                          )
                        }
                      />
                      <Label htmlFor={`blk-${c}`} className="font-normal">
                        {c}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            />
          </fieldset>

          <h2 className="-mb-2 text-sm font-semibold">Trash and notifications</h2>
          <Field
            id="s-trash"
            label="Keep items in trash for (days)"
            hint="After this period trashed items may be removed automatically."
            error={errors.trash_retention_days?.message}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={3650}
                className="w-32"
                {...form.register('trash_retention_days', { valueAsNumber: true })}
              />
            )}
          </Field>
          <Toggle
            form={form}
            name="email_include_titles"
            label="Include document titles in e-mails"
            hint="Off by default so notification e-mails never reveal file names."
          />

          <h2 className="-mb-2 text-sm font-semibold">E-signature</h2>
          <Toggle
            form={form}
            name="signatures_enabled"
            label="Enable e-signatures"
            hint="Lets people request signatures on documents. Non-PDF files are signed on a PDF copy."
          />
          <Toggle
            form={form}
            name="allow_external_signers"
            label="Allow signers outside the organization"
            hint="External signers receive a signing link by e-mail."
          />

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
