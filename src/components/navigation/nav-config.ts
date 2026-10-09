import {
  Activity,
  Archive,
  Bell,
  ClipboardCheck,
  Clock,
  Database,
  FileSignature,
  FolderTree,
  Gavel,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldAlert,
  Share2,
  Star,
  Trash2,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown with a small "Soon" tag; the page is an honest "Not available yet" page. */
  unavailable?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
  /** 'admin' = owner/admin only. 'auditor' = admin or auditor. */
  requires?: 'admin' | 'auditor-or-admin';
}

export const mainNav: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/my-files', label: 'My Files', icon: FolderTree },
      { href: '/recent', label: 'Recent', icon: Clock },
      { href: '/starred', label: 'Starred', icon: Star },
    ],
  },
  {
    title: 'Sharing',
    items: [
      { href: '/shared-with-me', label: 'Shared with me', icon: Share2 },
      { href: '/shared-by-me', label: 'Shared by me', icon: Share2 },
    ],
  },
  {
    title: 'Library',
    items: [
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/trash', label: 'Trash', icon: Trash2 },
      { href: '/workflows', label: 'Workflows', icon: Workflow, unavailable: true },
      { href: '/signatures', label: 'Signatures', icon: FileSignature, unavailable: true },
    ],
  },
];

export const adminNav: NavSection[] = [
  {
    title: 'Administration',
    requires: 'admin',
    items: [
      { href: '/admin', label: 'Overview', icon: Activity },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/groups', label: 'Groups', icon: UsersRound },
      { href: '/admin/quarantine', label: 'Quarantine', icon: ShieldAlert },
      { href: '/admin/storage', label: 'Storage', icon: Database },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
  {
    requires: 'auditor-or-admin',
    items: [{ href: '/admin/audit', label: 'Audit log', icon: Archive }],
  },
  {
    title: 'Not available yet',
    requires: 'admin',
    items: [
      { href: '/admin/identity', label: 'Identity & SSO', icon: KeyRound, unavailable: true },
      { href: '/admin/workflows', label: 'Workflows', icon: ClipboardCheck, unavailable: true },
      { href: '/admin/governance', label: 'Governance', icon: Gavel, unavailable: true },
    ],
  },
];
