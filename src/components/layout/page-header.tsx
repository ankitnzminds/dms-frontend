import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  trail,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  trail?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        // Stays put while the content below scrolls inside <main>.
        'sticky -top-3 z-20 -mx-3 -mt-3 bg-bg px-3 pt-3 sm:-mx-5 sm:-top-5 sm:-mt-5 sm:px-5 sm:pt-5 mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-2',
        className,
      )}
    >
      <div className="min-w-0">
        {trail && <div className="mb-1">{trail}</div>}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 max-w-prose text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface', className)} {...p} />;
}
