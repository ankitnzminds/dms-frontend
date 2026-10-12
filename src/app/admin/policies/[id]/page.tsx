import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PolicyEditorView } from '@/features/policies/policy-editor-view';

export const metadata: Metadata = { title: 'Policy' };

export default function Page() {
  return (
    <Suspense>
      <PolicyEditorView />
    </Suspense>
  );
}
