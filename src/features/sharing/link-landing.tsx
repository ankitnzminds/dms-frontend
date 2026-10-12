'use client';

import { Download, File as FileIcon, Folder, Loader2, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/session';
import { isApiError } from '@/lib/api-client';
import { apiRoot } from '@/lib/config';
import { formatBytes } from '@/lib/format';
import { resolveShareLink } from './link-hooks';

interface Entry {
  kind: 'folder' | 'document';
  id: string;
  name: string;
  size_bytes?: number | null;
}
interface Meta {
  resource_type: 'folder' | 'document';
  id: string;
  name: string;
  size_bytes?: number | null;
  can_download: boolean;
}

const base = (token: string) => `${apiRoot}/api/v1/public/shares/${encodeURIComponent(token)}`;

/**
 * What a share link opens. Signed-in members are sent to the item (the share is added to them if the link
 * is open to the organization). Everyone else sees a read-only page, and only when the organization allows
 * public links and the share is open: otherwise the same neutral "not valid" message for every failure.
 */
export function ShareLinkLanding({ token }: { token: string }) {
  const { status } = useSession();
  const router = useRouter();
  const [state, setState] = useState<'working' | 'invalid' | 'public'>('working');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    (async () => {
      if (status === 'signedIn') {
        try {
          const r = await resolveShareLink(token);
          if (!cancelled)
            router.replace(
              r.resource_type === 'folder'
                ? `/files/${r.resource_id}`
                : `/documents/${r.resource_id}`,
            );
          return;
        } catch (e) {
          if (!isApiError(e) || e.status !== 404) {
            if (!cancelled) {
              setError(e instanceof Error ? e.message : 'Could not open the link.');
              setState('invalid');
            }
            return;
          }
          // not a member of this organization, or the link is for outsiders: fall through to the public view
        }
      }
      try {
        const res = await fetch(base(token), { cache: 'no-store' });
        if (!res.ok) throw new Error('invalid');
        const m = (await res.json()) as Meta;
        if (cancelled) return;
        setMeta(m);
        setTrail(m.resource_type === 'folder' ? [{ id: m.id, name: m.name }] : []);
        if (m.resource_type === 'folder') {
          const kids = await fetch(`${base(token)}/children`, { cache: 'no-store' });
          if (kids.ok) setEntries((await kids.json()) as Entry[]);
        }
        setState('public');
      } catch {
        if (!cancelled) setState('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, router]);

  async function open(folder: { id: string; name: string }, truncateAt?: number) {
    const res = await fetch(`${base(token)}/children?folder_id=${folder.id}`, {
      cache: 'no-store',
    });
    if (!res.ok) return setError('That folder is not available.');
    setEntries((await res.json()) as Entry[]);
    setTrail((t) => (truncateAt !== undefined ? t.slice(0, truncateAt + 1) : [...t, folder]));
  }

  const here = typeof window === 'undefined' ? '' : window.location.pathname;
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-2xl content-center gap-4 p-6">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
        {state === 'working' && (
          <p className="flex items-center gap-2 text-[13px] text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening the link…
          </p>
        )}
        {state === 'invalid' && (
          <div className="grid gap-3 text-center">
            <Lock className="mx-auto size-8 text-muted" aria-hidden />
            <h1 className="text-lg font-semibold">This link is not valid</h1>
            <p className="text-[13px] text-muted">
              It may have expired, been turned off or replaced with a new one, or it may be meant
              for people who are signed in. {error}
            </p>
            {status !== 'signedIn' && (
              <Button variant="primary" asChild className="justify-self-center">
                <Link href={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link>
              </Button>
            )}
          </div>
        )}
        {state === 'public' && meta && (
          <div className="grid gap-3">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              {meta.resource_type === 'folder' ? (
                <Folder className="size-5" aria-hidden />
              ) : (
                <FileIcon className="size-5" aria-hidden />
              )}
              {meta.name}
            </h1>
            <p className="text-xs text-muted">
              Shared with you. This page is read-only
              {meta.can_download ? '' : ' and downloading is not enabled'}.
            </p>
            {meta.resource_type === 'document' ? (
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-muted">{formatBytes(meta.size_bytes)}</span>
                {meta.can_download && (
                  <Button variant="primary" asChild>
                    <a href={`${base(token)}/documents/${meta.id}/download`}>
                      <Download /> Download
                    </a>
                  </Button>
                )}
              </div>
            ) : (
              <>
                <nav
                  aria-label="Folder path"
                  className="flex flex-wrap items-center gap-1 text-xs text-muted"
                >
                  {trail.map((t, i) => (
                    <span key={t.id} className="flex items-center gap-1">
                      {i > 0 && <span aria-hidden>/</span>}
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => void open(t, i)}
                      >
                        {t.name}
                      </button>
                    </span>
                  ))}
                </nav>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {entries.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                      {e.kind === 'folder' ? (
                        <Folder className="size-4 text-accent" aria-hidden />
                      ) : (
                        <FileIcon className="size-4 text-muted" aria-hidden />
                      )}
                      {e.kind === 'folder' ? (
                        <button
                          type="button"
                          className="flex-1 text-left hover:underline"
                          onClick={() => void open({ id: e.id, name: e.name })}
                        >
                          {e.name}
                        </button>
                      ) : (
                        <span className="flex-1 truncate">{e.name}</span>
                      )}
                      {e.kind === 'document' && (
                        <>
                          <span className="text-xs text-muted">{formatBytes(e.size_bytes)}</span>
                          {meta.can_download && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              asChild
                              aria-label={`Download ${e.name}`}
                            >
                              <a href={`${base(token)}/documents/${e.id}/download`}>
                                <Download />
                              </a>
                            </Button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                  {entries.length === 0 && (
                    <li className="px-3 py-6 text-center text-xs text-muted">
                      This folder is empty.
                    </li>
                  )}
                </ul>
              </>
            )}
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
