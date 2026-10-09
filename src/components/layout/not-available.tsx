import { Construction } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Panel } from './page-header';

/** Honest placeholder for backend capabilities that do not exist yet. No fake data, no dead controls. */
export function NotAvailable({
  title,
  summary,
  planned,
  backendStatus = 'Not implemented in the backend yet',
}: {
  title: string;
  summary: string;
  planned: string[];
  backendStatus?: string;
}) {
  return (
    <>
      <PageHeader title={title} actions={<Badge tone="warn">Not available yet</Badge>} />
      <Panel className="max-w-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-warn-soft text-warn">
            <Construction className="size-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-semibold">{backendStatus}</h2>
            <p className="mt-1 text-[13px] text-muted">{summary}</p>
            <h3 className="mt-4 text-[13px] font-semibold">What this area will cover</h3>
            <ul className="mt-1 list-disc pl-5 text-[13px] text-muted">
              {planned.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-faint">Nothing on this page is wired to data. It will be enabled when the backend ships the feature.</p>
          </div>
        </div>
      </Panel>
    </>
  );
}
