'use client';

import {
  BarChart3,
  Clock,
  Database,
  FileText,
  FolderOpen,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react';

interface Capability {
  icon: LucideIcon;
  title: string;
  hint: string;
  prompt: string;
  tone: string;
}

/** The four things the assistant is built for; each one asks the real assistant. */
const CAPABILITIES: Capability[] = [
  {
    icon: Search,
    title: 'Find Documents',
    hint: 'Search documents and folders using natural language.',
    prompt: 'Find documents about contracts',
    tone: 'bg-accent-soft text-accent-soft-fg',
  },
  {
    icon: FileText,
    title: 'Check Approvals',
    hint: 'Find pending approvals and approval status.',
    prompt: 'What is waiting for my approval?',
    tone: 'bg-warn-soft text-warn',
  },
  {
    icon: FolderOpen,
    title: 'Get Information',
    hint: 'Ask about policies, storage and permissions you can see.',
    prompt: 'How can I share a document?',
    tone: 'bg-ok-soft text-ok',
  },
  {
    icon: Sparkles,
    title: 'Summarize & Analyze',
    hint: 'Summarize documents and compare authorized files.',
    prompt: 'Summarize the document I am looking at',
    tone: 'bg-info-soft text-info',
  },
];

interface Suggestion {
  icon: LucideIcon;
  text: string;
  /** Only offered to organization administrators. */
  adminOnly?: boolean;
}

/** Edit this list to change the suggested questions; nothing else needs to change. */
export const SUGGESTIONS: Suggestion[] = [
  { icon: Search, text: 'Find documents about contracts' },
  { icon: FileText, text: 'Summarize this document' },
  { icon: Clock, text: 'What is waiting for my approval?' },
  { icon: BarChart3, text: 'Show my recent activity' },
  { icon: Database, text: 'Show my storage usage' },
  { icon: ShieldCheck, text: 'What are our retention policies?' },
  { icon: Share2, text: 'How can I share a document?' },
  { icon: User, text: 'Help me understand folder permissions' },
  { icon: BarChart3, text: 'Show storage used by each user', adminOnly: true },
];

export function Welcome({
  name,
  admin,
  disabled,
  onAsk,
}: {
  name?: string | null;
  admin: boolean;
  disabled: boolean;
  onAsk: (prompt: string) => void;
}) {
  const first = name?.split(' ')[0];
  const suggestions = SUGGESTIONS.filter((s) => !s.adminOnly || admin);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-6" data-testid="chat-welcome">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="size-6 text-accent" aria-hidden />
          Hello{first ? `, ${first}` : ''} <span aria-hidden>👋</span>
        </h2>
        <p className="mt-2 max-w-xl text-[14px] text-muted">
          I can help you find documents, understand policies, check approvals, and manage your
          document workflows. I only see what you are allowed to see, and I always ask before
          changing anything.
        </p>
      </div>
      <ul
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="What I can do"
      >
        {CAPABILITIES.map(({ icon: Icon, title, hint, prompt, tone }) => (
          <li key={title}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAsk(prompt)}
              className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left shadow-sm transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
            >
              <span className={`grid size-10 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="text-[13px] font-semibold">{title}</span>
              <span className="text-xs text-muted">{hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <section aria-label="Suggested questions">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-warn" aria-hidden /> Suggested questions
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {suggestions.map(({ icon: Icon, text }) => (
            <li key={text}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAsk(text)}
                className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-[13px] transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
              >
                <Icon className="size-4 shrink-0 text-accent" aria-hidden />
                {text}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
