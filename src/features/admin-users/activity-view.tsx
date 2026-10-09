'use client';

import { PageHeader, Panel } from '@/components/layout/page-header';
import { ActivityPanel } from './activity-panel';

export function ActivityView() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="What people did and what was done to accounts, from the append-only audit log. Opening or exporting this page is itself recorded."
      />
      <Panel className="p-4">
        <ActivityPanel />
      </Panel>
    </>
  );
}
