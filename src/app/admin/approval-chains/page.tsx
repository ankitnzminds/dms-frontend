import type { Metadata } from 'next';
import { SignatureChainEditorView } from '@/features/signatures/chain-editor-view';

export const metadata: Metadata = { title: 'Approval chains' };

export default function Page() {
  return <SignatureChainEditorView kind="approval" />;
}
