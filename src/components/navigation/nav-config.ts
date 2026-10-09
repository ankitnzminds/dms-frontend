import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  Bot,
  Clock,
  Database,
  FileSignature,
  FolderTree,
  Gavel,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Network,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Share2,
  Star,
  Tags,
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
  /** Header toggles the group open/closed (state is remembered per browser). */
  collapsible?: boolean;
}

export const mainNav: NavSection[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/my-files', label: 'My Files', icon: FolderTree },
      { href: '/recent', label: 'Recent', icon: Clock },
      { href: '/starred', label: 'Quick Access', icon: Star },
    ],
  },
  {
    title: 'Sharing',
    items: [
      { href: '/shared-with-me', label: 'Shared with me', icon: Share2 },
      { href: '/shared-by-me', label: 'Shared by me', icon: Share2 },
      { href: '/requests', label: 'Access requests', icon: Inbox },
    ],
  },
  {
    title: 'Library',
    items: [
      { href: '/assistant', label: 'Assistant', icon: Bot },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/trash', label: 'Trash', icon: Trash2 },
      { href: '/approvals', label: 'My approvals', icon: ListChecks },
      { href: '/signatures', label: 'Signatures', icon: FileSignature },
    ],
  },
];

export const adminNav: NavSection[] = [
  {
    title: 'Users / Groups',
    requires: 'admin',
    collapsible: true,
    items: [
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/groups', label: 'Groups', icon: UsersRound },
      { href: '/admin/admins', label: 'Admins', icon: ShieldCheck },
    ],
  },
  {
    title: 'Administration',
    requires: 'admin',
    items: [
      { href: '/admin', label: 'Overview', icon: Activity },
      { href: '/admin/directory', label: 'Directory sync', icon: Network },
      { href: '/admin/workflows', label: 'Workflows', icon: Workflow },
      { href: '/admin/metadata', label: 'Metadata fields', icon: Tags },
      { href: '/admin/quarantine', label: 'Quarantine', icon: ShieldAlert },
      { href: '/admin/storage', label: 'Storage', icon: Database },
      { href: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
  {
    title: 'Oversight',
    requires: 'auditor-or-admin',
    items: [
      { href: '/admin/governance', label: 'Governance', icon: Gavel },
      { href: '/admin/activity', label: 'Activity', icon: History },
      { href: '/admin/audit', label: 'Audit log', icon: Archive },
      { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    title: 'Not available yet',
    requires: 'admin',
    items: [
      { href: '/admin/identity', label: 'SSO sign-in setup', icon: KeyRound, unavailable: true },
    ],
  },
];
