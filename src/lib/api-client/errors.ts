export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  requestId?: string | null;
  details?: unknown;
  retryAfterSeconds?: number | null;
}

/** Standardised error for every non-2xx response and for network failures (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: unknown;
  readonly retryAfterSeconds: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  get isNotFound() {
    return this.status === 404;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isNetwork() {
    return this.status === 0 && this.code === 'network_error';
  }
  get isAborted() {
    return this.code === 'aborted';
  }

  /** Field errors from a 422 (`details[].loc` / `msg`) keyed by the last loc segment. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as Array<{ loc?: unknown[]; msg?: string }>) {
        if (!d || !Array.isArray(d.loc) || typeof d.msg !== 'string') continue;
        const key = String(d.loc[d.loc.length - 1]);
        if (!(key in out)) out[key] = d.msg;
      }
    }
    return out;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

function parseRetryAfter(h: string | null): number | null {
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(h);
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

/** Build an ApiError from a Response (body shape: {"error": {code,message,request_id,details}}). */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const err = (body as { error?: Record<string, unknown> } | null)?.error;
  const detail = (body as { detail?: unknown } | null)?.detail; // FastAPI default shape fallback
  return new ApiError({
    status: res.status,
    code: typeof err?.code === 'string' ? err.code : res.status === 422 ? 'validation_error' : `http_${res.status}`,
    message:
      typeof err?.message === 'string'
        ? err.message
        : typeof detail === 'string'
          ? detail
          : res.statusText || `Request failed (${res.status})`,
    requestId:
      (typeof err?.request_id === 'string' ? err.request_id : null) ?? res.headers.get('x-request-id'),
    details: err?.details ?? (Array.isArray(detail) ? detail : null),
    retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
  });
}

const FRIENDLY: Record<string, string> = {
  unauthenticated: 'Your session has expired. Sign in again.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'This item was not found, or you do not have access to it.',
  name_conflict: 'An item with that name already exists in this location.',
  stale_version: 'Someone else changed this item. Reload to see the latest version.',
  quota_exceeded: 'Your organization has run out of storage.',
  invalid_state: 'This item is not in a state that allows that action.',
  payload_too_large: 'That file is too large. The maximum upload size is 100 MB.',
  blocked_file_type: 'This file type is not allowed.',
  not_previewable: 'This file type cannot be previewed. Download it instead.',
  unknown_recipient:
    'That person is not an active member of this organization. Sharing outside the organization is not enabled.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  validation_error: 'Some of the information you entered is not valid.',
  network_error: 'Cannot reach the server. Check your connection and try again.',
  parent_deleted: 'The original folder is in the trash. Restore it first, or choose another location.',
  checksum_mismatch: 'The uploaded file did not match its checksum. Try uploading it again.',
  size_mismatch: 'The uploaded size did not match the declared size. Try uploading it again.',
  last_owner: 'An organization must keep at least one owner.',
  already_member: 'That person is already a member of this organization.',
  invalid_recipient: 'One of the recipients is not valid.',
  action_not_shareable: 'One of the selected permissions cannot be shared.',
  not_available: 'This is not available for this item.',
  link_expired: 'This download link has expired. Request a new one.',
  quarantined: 'This file was quarantined by the malware scanner and cannot be opened.',
  processing: 'This file is still being scanned. Try again in a moment.',
  not_released: 'This file has not been released yet.',
  session_expired: 'The upload session expired. Start the upload again.',
  too_many_uploads: 'Too many uploads in progress. Wait for some to finish.',
  unknown_subject: 'That user or group could not be found in this organization.',
  not_deleted: 'This item is not in the trash.',
  dependency_unavailable: 'A backend dependency is unavailable. Try again shortly.',
  account_disabled: 'This account is disabled.',
};

/** Human-friendly text for an error. Falls back to the server message. */
export function friendlyMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (!isApiError(e)) return e instanceof Error && e.message ? e.message : fallback;
  if (e.status === 413) return FRIENDLY.payload_too_large;
  if (e.status === 429) {
    return e.retryAfterSeconds
      ? `Too many requests. Try again in ${e.retryAfterSeconds} seconds.`
      : FRIENDLY.rate_limited;
  }
  if (e.status === 404) return FRIENDLY.not_found;
  return FRIENDLY[e.code] ?? (e.message || fallback);
}
