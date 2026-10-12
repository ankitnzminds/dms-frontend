'use client';

import {
  Check,
  ChevronDown,
  Cloud,
  FileText,
  Globe,
  Lock,
  Search,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
/* eslint-disable @next/next/no-img-element -- one static brand illustration */
import { ThemeToggle } from '@/components/theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Everything on the sign-in screens is sized in `em` from one font-size that follows the viewport height, so the
 * whole composition scales together: it fits a 720px-high laptop and fills a 1080px-high monitor.
 */
const SCALE = 'text-[clamp(11px,1.72vh,16.5px)]';

const POINTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Secure by design',
    body: 'Enterprise-grade security and access control',
  },
  { icon: Users, title: 'Collaborate Effortlessly', body: 'Share, approve, and manage documents' },
  { icon: Search, title: 'Find What You Need', body: 'Powerful search with AI and OCR' },
  { icon: Cloud, title: 'Access Anywhere', body: 'Work from any device, anytime' },
];

interface TrustItem {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The three trust badges. These are statements about the organization, so they are configuration, not code:
 * set NEXT_PUBLIC_LOGIN_TRUST to a JSON list such as
 *   [{"title":"ISO 27001","body":"Certified"},{"title":"GDPR","body":"Compliant"},{"title":"Enterprise Ready","body":"On-premise or Cloud"}]
 * Only publish a certification once it is actually held.
 */
// Defaults only state things the product itself does; no certification is claimed until configured.
const DEFAULT_TRUST: Omit<TrustItem, 'icon'>[] = [
  { title: 'Private files', body: 'Never public' },
  { title: 'Audit trail', body: 'All actions logged' },
  { title: 'Access control', body: 'Roles and policies' },
];
const TRUST_ICONS: LucideIcon[] = [ShieldCheck, Lock, Cloud];

function trustItems(): TrustItem[] {
  let list = DEFAULT_TRUST;
  try {
    const raw = process.env.NEXT_PUBLIC_LOGIN_TRUST;
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((x) => x && typeof x.title === 'string' && typeof x.body === 'string')
      )
        list = parsed.slice(0, 3);
    }
  } catch {
    /* keep the defaults */
  }
  return list.map((t, i) => ({ ...t, icon: TRUST_ICONS[i % TRUST_ICONS.length]! }));
}

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid place-items-center rounded-[1.1em] bg-gradient-to-b from-[#2f74ff] to-[#155EEF] text-white shadow-[0_8px_20px_-6px_rgba(21,94,239,0.7)]',
        className,
      )}
      aria-hidden
    >
      <FileText className="size-1/2" />
    </span>
  );
}

function BrandPanel() {
  const trust = trustItems();
  return (
    <aside
      aria-label="About NZM DMS"
      className={cn(
        'relative hidden h-full min-h-0 flex-col justify-between overflow-hidden px-[4.4em] py-[2.6em] text-white lg:flex',
        SCALE,
      )}
      style={{
        background:
          'radial-gradient(ellipse 70% 55% at 100% 100%, #2f7af9 0%, rgba(24,89,222,0.55) 38%, rgba(8,37,105,0) 72%), radial-gradient(ellipse 60% 50% at 100% 35%, rgba(21,94,239,0.35) 0%, rgba(8,37,105,0) 70%), linear-gradient(165deg, #021737 0%, #03204c 45%, #052c64 100%)',
      }}
    >
      {/* soft curved shapes */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 970 941"
        preserveAspectRatio="none"
      >
        <path
          d="M970 120 C 760 230, 700 520, 500 700 S 160 960, 0 941 L 970 941 Z"
          fill="rgba(56,125,255,0.07)"
        />
        <path
          d="M970 300 C 820 380, 760 600, 640 760 S 420 960, 300 941 L 970 941 Z"
          fill="rgba(56,189,248,0.06)"
        />
        <circle cx="905" cy="560" r="230" fill="none" stroke="rgba(120,180,255,0.18)" />
      </svg>

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-[0.95em]">
          <Logo className="size-[3.5em]" />
          <div>
            <p className="text-[1.95em] font-semibold leading-none tracking-tight">NZM DMS</p>
            <p className="mt-[0.35em] text-[1.05em] text-white/75">
              Enterprise Document Management
            </p>
          </div>
        </div>
        <p className="hidden items-center gap-[1em] pr-[2em] text-[1.15em] text-white/90 xl:flex">
          Secure{' '}
          <span className="text-[#38BDF8]" aria-hidden>
            •
          </span>{' '}
          Auditable{' '}
          <span className="text-[#38BDF8]" aria-hidden>
            •
          </span>{' '}
          Controlled
        </p>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="relative z-10 flex h-full max-w-[30em] flex-col justify-center">
          <h2 className="whitespace-nowrap text-[3.7em] font-semibold leading-[1.02] tracking-tight">
            Your Documents.
            <br />
            <span className="bg-gradient-to-r from-[#38BDF8] to-[#1d7bff] bg-clip-text text-transparent">
              More Secure.
            </span>
            <br />
            More Productive.
          </h2>
          <p className="mt-[1.1em] max-w-[24em] text-[1.3em] leading-snug text-white/80">
            A modern and centralized document management system for your organization.
          </p>
          <ul className="mt-[1.9em] grid gap-[1.15em]">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-center gap-[1.1em]">
                <span className="grid size-[4.15em] shrink-0 place-items-center rounded-[1.1em] bg-gradient-to-b from-[#1d4fb8] to-[#123a8c] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-white/10">
                  <Icon className="size-[2em]" aria-hidden />
                </span>
                <span className="max-w-[17em]">
                  <span className="block text-[1.2em] font-semibold leading-tight">{title}</span>
                  <span className="mt-[0.2em] block text-[1em] leading-snug text-white/75">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <img
          src="/login-illustration.webp"
          alt=""
          draggable={false}
          className="pointer-events-none absolute right-[-1.5em] top-[0.5em] hidden w-[min(34em,56%)] select-none min-[1700px]:block"
          style={{ top: '4%' }}
        />
      </div>

      <ul className="relative grid w-[min(100%,44em)] grid-cols-3 divide-x divide-white/15 rounded-[1.5em] border border-white/20 bg-white/[0.04] px-[1.4em] py-[1.2em]">
        {trust.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="flex items-center gap-[0.85em] px-[0.9em] first:pl-0 last:pr-0"
          >
            <span className="grid size-[3.1em] shrink-0 place-items-center rounded-[0.9em] ring-1 ring-white/25">
              <Icon className="size-[1.5em]" aria-hidden />
            </span>
            <span className="min-w-0 text-[1em] leading-tight">
              <span className="block truncate text-[1.1em] font-semibold">{title}</span>
              <span className="mt-[0.2em] block truncate text-white/75">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Shared frame of every sign-in screen (sign in, forgot / reset password): branding panel on the left,
 * the card on the right. Fits the viewport on desktop; on small screens it is a scrolling single column.
 */
export function AuthShell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle: React.ReactNode;
}) {
  return (
    <main className="grid h-screen h-dvh min-h-0 overflow-hidden bg-bg max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-y-auto lg:grid-cols-[58fr_42fr]">
      <BrandPanel />
      <div className="relative grid min-h-0 place-items-center overflow-hidden bg-[linear-gradient(160deg,#f8fbfe_0%,#eef4fd_55%,#d9e8fe_100%)] p-[2.2vh] max-lg:overflow-visible dark:bg-none dark:bg-bg">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 bottom-[-9rem] size-[34rem] rounded-full bg-[#2f7af9]/20 blur-3xl dark:bg-[#155EEF]/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-[-8rem] size-[22rem] rounded-full bg-white/60 blur-3xl dark:hidden"
        />
        <div className="absolute right-4 top-4 flex items-center gap-2.5 sm:right-6 sm:top-[3.2vh]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[14px] shadow-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-[#155EEF]"
                aria-label="Language"
              >
                <Globe className="size-[18px]" aria-hidden /> English
                <ChevronDown className="size-4 text-muted" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem>
                <Check /> English
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
        <div
          className={cn(
            'relative w-[34em] max-w-full rounded-[1.5em] border border-line bg-surface p-[2em] shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)]',
            SCALE,
          )}
        >
          <div className="mb-[1.3em] text-center">
            <Logo className="mx-auto size-[4.4em]" />
            <h1 className="mt-[0.45em] text-[2.1em] font-semibold leading-tight tracking-tight">
              NZM DMS
            </h1>
            <p className="mt-[0.2em] text-[1.15em] text-muted">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}

const FIELD =
  'h-[3.1em] w-full rounded-[0.75em] border border-line-strong bg-surface pl-[2.8em] pr-3 text-[1em] text-text placeholder:text-faint transition-colors focus-visible:border-[#155EEF] focus-visible:outline-2 focus-visible:outline-[#155EEF]/30 aria-[invalid=true]:border-danger';

/** Labelled input with a leading icon and an inline error; shared by every auth form. */
export function IconField({
  id,
  label,
  error,
  icon: Icon,
  trailing,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  icon: LucideIcon;
  trailing?: React.ReactNode;
  children: (p: {
    id: string;
    className: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  return (
    <div className="grid gap-[0.45em]">
      <label htmlFor={id} className="text-[1em] font-medium">
        {label}
      </label>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute left-[0.95em] top-1/2 size-[1.3em] -translate-y-1/2 text-faint"
          aria-hidden
        />
        {children({
          id,
          className: cn(FIELD, trailing && 'pr-[3em]'),
          'aria-invalid': !!error,
          'aria-describedby': error ? `${id}-err` : undefined,
        })}
        {trailing}
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-[0.85em] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const PRIMARY_BUTTON =
  'h-[3.1em] w-full rounded-[0.75em] bg-gradient-to-b from-[#1f6bff] to-[#155EEF] text-[1.05em] font-medium shadow-[0_8px_18px_-8px_rgba(21,94,239,0.8)] transition-transform hover:-translate-y-px';
