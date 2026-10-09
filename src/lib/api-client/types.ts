/**
 * Convenience aliases over the GENERATED schema (schema.d.ts). Never hand-write API shapes here.
 */
import type { components, paths } from './schema';

export type { paths, components };
export type Schemas = components['schemas'];

export type Me = Schemas['MeOut'];
export type Membership = Schemas['MembershipOut'];
export type Role = NonNullable<Me['role']>;
export type Organization = Schemas['OrganizationOut'];
export type Usage = Schemas['UsageOut'];
export type Folder = Schemas['FolderOut'];
export type Document = Schemas['DocumentOut'];
export type Version = Schemas['VersionOut'];
export type TreeItem = Schemas['TreeItem'];
export type Breadcrumb = Schemas['BreadcrumbSegmentOut'];
export type TrashItem = Schemas['TrashItem'];
export type SearchResult = Schemas['SearchResult'];
export type Share = Schemas['ShareOut'];
export type ReceivedShare = Schemas['ReceivedShare'];
export type ShareCreate = Schemas['ShareCreate'];
export type Recipient = Schemas['RecipientIn'];
export type PermissionGrant = Schemas['PermissionGrantOut'];
export type PermissionGrantIn = Schemas['PermissionGrantIn'];
export type Notification = Schemas['NotificationOut'];
export type NotificationPage = Schemas['NotificationPage'];
export type Member = Schemas['MemberOut'];
export type Group = Schemas['GroupOut'];
export type AuditEvent = Schemas['AuditEventOut'];
export type QuarantineItem = Schemas['QuarantineItem'];
export type UploadSession = Schemas['UploadSessionOut'];
export type UploadFinalize = Schemas['UploadFinalizeOut'];
export type DocumentStatus = Document['status'];

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageParams {
  limit?: number;
  offset?: number;
}
