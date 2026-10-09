import { Suspense } from 'react';
import { SearchView } from '@/features/search/search-view';

export default function SearchPage() {
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
