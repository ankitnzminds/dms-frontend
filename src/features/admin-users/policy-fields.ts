/** UI catalogue for the policy editor. Keys mirror the backend schema (app/modules/policies/schema.py);
 *  the backend remains the only authority on validation, precedence and enforcement. */

export type FieldKind = 'bool' | 'days' | 'count' | 'bytes' | 'select' | 'xml';

export interface PolicyField {
  key: string;
  label: string;
  help: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
}

export interface PolicyTab {
  id: string;
  label: string;
  intro?: string;
  fields: PolicyField[];
}

const b = (key: string, label: string, help: string): PolicyField => ({
  key,
  label,
  help,
  kind: 'bool',
});

export const POLICY_TABS: PolicyTab[] = [
  {
    id: 'general',
    label: 'General',
    fields: [
      {
        key: 'share_mode',
        label: 'Share mode',
        help: 'Allow all shares, or turn sharing off for these accounts.',
        kind: 'select',
        options: [
          { value: 'allow_all', label: 'Allow all shares' },
          { value: 'no_shares', label: 'No sharing' },
        ],
      },
      {
        key: 'default_share_expiry_days',
        label: 'Default share expiry (days)',
        help: '0 means no default expiry. Applied when a share is created without an expiry.',
        kind: 'days',
      },
      {
        key: 'default_max_downloads',
        label: 'Default max downloads per share',
        help: '0 means unlimited.',
        kind: 'count',
      },
      {
        key: 'user_storage_quota_bytes',
        label: 'User storage quota',
        help: '0 means no per-user limit (the organization quota still applies).',
        kind: 'bytes',
      },
      b(
        'privacy_settings_enabled',
        'Enable privacy settings',
        'Governs which privacy controls users see.',
      ),
      b(
        'recycle_bin_enabled',
        'Store deleted files in the recycle bin',
        'Deleted files can be restored.',
      ),
      {
        key: 'recycle_bin_auto_delete_days',
        label: 'Empty recycle bin after (days)',
        help: '0 means never delete automatically.',
        kind: 'days',
      },
      {
        key: 'recycle_bin_max_file_bytes',
        label: 'Do not keep deleted files larger than',
        help: '0 means no size limit.',
        kind: 'bytes',
      },
    ],
  },
  {
    id: 'mfa',
    label: 'MFA',
    intro:
      'Multi-factor authentication is performed by your identity provider. This switch is stored but DMS does not enforce it yet.',
    fields: [
      b(
        'require_mfa',
        'Require multi-factor authentication',
        'Recorded as intent for the identity provider.',
      ),
    ],
  },
  {
    id: 'user_policy',
    label: 'User policy',
    fields: [
      b(
        'disable_invitations',
        'Disable invitations to new users',
        'Prevents inviting new people while sharing.',
      ),
      b(
        'create_account_on_share',
        'Create account on new-user share',
        'Create the recipient account when a share invitation is sent.',
      ),
      b(
        'code_device_auth',
        'Enable code-based device authentication',
        'For client devices that sign in with a code.',
      ),
      b(
        'code_device_auth_requires_approval',
        'Require admin approval for code-based device authentication',
        'An administrator approves each device.',
      ),
      b(
        'enforce_device_session_timeout',
        'Enforce session timeout for client devices',
        'Client sessions end after inactivity.',
      ),
      b(
        'allow_folder_level_security',
        'Allow folder-level security',
        'Users may set permissions on folders.',
      ),
      b('enable_web_edit', 'Enable web edit', 'Allows editing Office files in the browser.'),
      b(
        'enable_recycle_bin_clearing',
        'Enable recycle-bin clearing',
        'Users may empty their recycle bin.',
      ),
      b(
        'disallow_default_share_change',
        'Disallow changing default share settings',
        'Users cannot override the default share settings.',
      ),
      b(
        'disable_send_for_approval',
        'Disable "Send file for approval"',
        'Hides the approval shortcut.',
      ),
      b(
        'disable_everyone_group_sharing',
        'Disable sharing with the Everyone group',
        'Blocks organization-wide shares.',
      ),
      b('allow_group_creation', 'Allow group creation', 'Let these users create groups.'),
      b(
        'allow_group_management',
        'Allow group management',
        'Let these users manage group members.',
      ),
      b('allow_group_deletion', 'Allow group deletion', 'Let these users delete groups.'),
      b(
        'allow_workflow_sharing',
        'Allow workflow automation sharing',
        'Share automations with others.',
      ),
      b(
        'disable_workflow_automation',
        'Disable workflow automation',
        'Turns automation off for these users.',
      ),
      b('require_share_approval', 'Require share approval workflow', 'Shares wait for approval.'),
      b('esignature_enabled', 'Enable eSignature', 'Allows sending documents for signature.'),
      {
        key: 'max_upload_bytes',
        label: 'Max file upload size',
        help: '0 means the platform maximum. The platform limit always applies on top.',
        kind: 'bytes',
      },
      b(
        'save_zip_session_password',
        'Save ZIP file session password',
        'Remember encrypted-ZIP passwords for the session. Increases risk if a device is shared.',
      ),
    ],
  },
  {
    id: 'client_app',
    label: 'Client application',
    intro:
      'Rules for mobile and desktop clients. There is no mobile client yet, so these are stored only.',
    fields: [
      b('require_passcode_lock', 'Require passcode lock', 'Only on clients that support it.'),
      b('disable_mobile_apps', 'Disable all mobile apps from connecting', ''),
      b('disable_mobile_edit', 'Disable edit functions in mobile apps', ''),
      b('disable_print', 'Disable print option', ''),
      b('disable_download', 'Disable download option', ''),
      b('disable_open_with', 'Disable "Open with"', ''),
      b('disable_share', 'Disable share options', ''),
      b('disable_favorites', 'Disable "Add to favorites"', ''),
      b(
        'disable_screenshots',
        'Disable screenshots and screen recording',
        'Only where the operating system lets an app enforce it.',
      ),
    ],
  },
  {
    id: 'device_config',
    label: 'Device configuration',
    intro:
      'Versioned XML for client devices. Saved only when well-formed. Delivery to devices is not confirmed because there is no device channel yet.',
    fields: [
      {
        key: 'client_configuration_xml',
        label: 'Client configuration',
        help: 'XML. DTDs and entities are rejected.',
        kind: 'xml',
      },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    fields: [
      b('disable_all', 'Disable notifications', 'Suppresses all notifications for these accounts.'),
      b(
        'disable_user_override',
        'Disable user override',
        'Users cannot turn notifications back on.',
      ),
      b('disable_new_file', 'Disable notifications for new files in shared folders', ''),
      b('disable_update', 'Disable update notifications', ''),
      b('disable_delete', 'Disable delete notifications', ''),
      b('disable_download', 'Disable download notifications', ''),
      b('disable_preview', 'Disable preview notifications', ''),
      b('disable_lock', 'Disable lock/unlock notifications', ''),
      b(
        'disable_share',
        'Disable share notifications',
        'Share notifications are suppressed for the recipient.',
      ),
      b('disable_rename', 'Disable rename notifications', ''),
      b(
        'disable_self',
        'Disable self notifications',
        'Do not notify the person who performed the action.',
      ),
    ],
  },
];

export const BYTE_UNITS = [
  { label: 'MB', factor: 1024 ** 2 },
  { label: 'GB', factor: 1024 ** 3 },
  { label: 'TB', factor: 1024 ** 4 },
] as const;

/** 1073741824 -> { amount: 1, unit: 'GB' }. */
export function splitBytes(bytes: number): {
  amount: number;
  unit: (typeof BYTE_UNITS)[number]['label'];
} {
  if (bytes > 0) {
    for (const u of [...BYTE_UNITS].reverse()) {
      if (bytes % u.factor === 0) return { amount: bytes / u.factor, unit: u.label };
    }
  }
  return { amount: bytes > 0 ? Math.round((bytes / 1024 ** 2) * 100) / 100 : 0, unit: 'MB' };
}

export function joinBytes(amount: number, unit: string): number {
  const f = BYTE_UNITS.find((u) => u.label === unit)?.factor ?? 1024 ** 2;
  return Math.round(amount * f);
}
