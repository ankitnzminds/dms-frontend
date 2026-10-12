import type { Metadata } from 'next';
import { SignatureChainEditorView } from '@/features/signatures/chain-editor-view';

export const metadata: Metadata = { title: 'Signature chains' };

export default function Page() {
  return <SignatureChainEditorView />;
}
