/**
 * Typed client for the LenziAI API.
 *
 * Every request carries the session cookie; the model credential never appears
 * here because it never leaves the server.
 */
import type { Analysis, DetectionImage, LaboratoryReport, Patient, Sample } from '../types';

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, message: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, 'Your session has ended. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

const BASE = import.meta.env.VITE_API_URL || '/api';

type Listener = (expired: boolean) => void;
const sessionListeners = new Set<Listener>();

/** Notifies the app shell when the server rejects our session. */
export function onSessionExpired(listener: Listener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/**
 * Deduplicates concurrent identical requests so a burst of components
 * asking for the same list at once issues a single fetch. Keys are method +
 * path + body; results resolve to every caller. Expired after 10 seconds so
 * a genuinely stale response never hides a later mutation.
 */
const inflight = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { value: unknown; expiresAt: number }>();
const GET_CACHE_TTL_MS = 5_000;
const inflightKey = (path: string, init: RequestInit = {}) =>
  `${init.method ?? 'GET'}|${path}|${JSON.stringify(init.body ?? '')}`;

/**
 * Clears cached reads after a write or session change. The cache is deliberately
 * small and in-memory: it speeds up tab navigation without persisting PHI in
 * browser storage or allowing an old user's data to survive sign-out.
 */
export function clearApiCache(): void {
  responseCache.clear();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = inflightKey(path, init);
  const method = (init.method ?? 'GET').toUpperCase();
  const isRead = method === 'GET';

  if (isRead) {
    const cached = responseCache.get(key);
    if (cached) {
      if (cached.expiresAt > Date.now()) return cached.value as T;
      responseCache.delete(key);
    }
  } else {
    clearApiCache();
  }

  if (inflight.has(key)) return inflight.get(key) as Promise<T>;

  const promise = (async () => {
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        // Session is a SameSite=Strict httpOnly cookie.
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        ...init
      });
    } catch {
      throw new ApiError(
        0,
        'Cannot reach the LenziAI server. Confirm the API is running and try again.'
      );
    }

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      const text = await response.text();
      if (!response.ok) {
        throw new ApiError(response.status, text || `Request failed (${response.status})`, { error: text });
      }
      return text as T;
    }

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text };
      }
    }

    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') {
        clearApiCache();
        for (const listener of sessionListeners) listener(true);
        throw new SessionExpiredError();
      }
      throw new ApiError(response.status, String(payload.error ?? `Request failed (${response.status})`), payload);
    }

    const result = payload as T;
    if (isRead) {
      responseCache.set(key, { value: result, expiresAt: Date.now() + GET_CACHE_TTL_MS });
    }
    return result;
  })();

  const timer = setTimeout(() => inflight.delete(key), 10_000);
  promise.then(() => clearTimeout(timer), () => clearTimeout(timer));
  inflight.set(key, promise);
  return promise;
}

/**
 * Fetches a file rather than JSON.
 *
 * The generic `request` reader decodes every response as text, which corrupts
 * a picture, so a download reads the body as a blob and hands back the
 * filename the server offered it under.
 */
async function requestFile(
  path: string,
  init: RequestInit = {}
): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the LenziAI server. Confirm the API is running and try again.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearApiCache();
      for (const listener of sessionListeners) listener(true);
      throw new SessionExpiredError();
    }
    const text = await response.text();
    let message = text;
    try {
      message = String(JSON.parse(text).error ?? text);
    } catch {
      // A non-JSON body is already the message.
    }
    throw new ApiError(response.status, message || `Request failed (${response.status})`);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  return {
    blob: await response.blob(),
    filename: match ? match[1] : `download-${Date.now()}`
  };
}

/** Saves a fetched file to the operator's machine. */
export function saveFile({ blob, filename }: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in some browsers before it has read the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Builds a query string, dropping undefined values so the URL stays clean. */
function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '' && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ------------------------------------------------------------------ auth ----

export interface SessionUser {
  id: string;
  displayName: string;
  email: string | null;
  role: 'member' | 'admin';
  active: boolean;
}

// -------------------------------------------------------------- admin users ----

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: 'member' | 'admin';
  /** Admin approval: only approved accounts can sign in and use the app. */
  active: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  /** Recorded audit entries this user is the actor of. */
  auditCount: number;
  lastAction: string | null;
  lastActionAt: string | null;
}

/** True when the server rejects a request because the account is unapproved. */
export function isNotApprovedError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 403 && (err.payload as { code?: string })?.code === 'NOT_APPROVED';
}

export interface AdminAnalysis {
  id: string;
  sampleId: string;
  patientId: string | null;
  patientNumber: string | null;
  patientName: string | null;
  sampleType: string | null;
  slideLabel: string | null;
  status: string;
  totalDetections: number;
  startedAt: string;
  completedAt: string | null;
  initiatedBy: string | null;
  modelId: string | null;
  modelName: string | null;
}

export const adminApi = {
  listUsers: () => request<{ users: AdminUser[] }>('/admin/users'),

  setRole: (id: string, role: 'member' | 'admin') =>
    request<{ user: { id: string; role: 'member' | 'admin' } }>(
      `/admin/users/${encodeURIComponent(id)}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) }
    ),

  approveUser: (id: string) =>
    request<{ ok: true; id: string; approved: boolean }>(`/admin/users/${encodeURIComponent(id)}/approve`, {
      method: 'POST'
    }),

  removeUser: (id: string) =>
    request<{ ok: true; id: string; approved: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }),

  listAnalyses: (params: { limit?: number; offset?: number; status?: string; sampleId?: string } = {}) =>
    request<{ items: AdminAnalysis[]; total: number; limit: number; offset: number }>(
      `/admin/analyses${query(params)}`
    ),

  updateAnalysis: (id: string, payload: { status: string; notes?: string }) =>
    request<{ analysis: { id: string; status: string; completed_at: string | null } }>(
      `/admin/analyses/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ),

  deleteAnalysis: (id: string) =>
    request<void>(`/admin/analyses/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

/** What a saved scanned image is held as, and where it is addressed from. */
export type ScannedImageKind = 'specimen' | 'slide' | 'evidence';

export interface SavedScanImage {
  kind: ScannedImageKind;
  id: string;
  sampleId: string | null;
  specimenLabel: string;
  label: string;
  sampleType: string | null;
  createdAt: string | null;
  /** Unavailable in metadata-only Supabase listings; the image is loaded on demand. */
  sizeBytes: number | null;
}

export interface SavedScanCounts {
  specimens: number;
  specimen: number;
  slide: number;
  evidence: number;
}

export const scanImagesApi = {
  /** Every saved scanned image, for choosing from. Carries no image data. */
  list: () =>
    request<{ images: SavedScanImage[]; counts: SavedScanCounts }>('/admin/scans/images'),

  /**
   * Downloads the chosen saved images.
   *
   * One image downloads as the image itself; several download as a zip, which
   * is what a case review takes away.
   */
  download: (images: { kind: ScannedImageKind; id: string }[]) =>
    requestFile('/admin/scans/images/download', {
      method: 'POST',
      body: JSON.stringify({ images })
    }),

  /** Every saved scanned image in the system, as one archive. */
  downloadAll: () => requestFile('/admin/scans/export')
};

export const authApi = {
  login: (email: string, password: string) =>
    request<{ user: SessionUser; expiresAt: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

  signup: (email: string, password: string, displayName: string) =>
    request<{ ok: true; message: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName })
    }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  me: () => request<{ user: SessionUser }>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    })
};

// --------------------------------------------------------------- system ----

export interface SystemStatus {
  service: string;
  inference: { configured: boolean; endpoint: string | null; credentialSource: string };
  audit: { head: string | null; intact: boolean; total: number };
  serverTime: string;
}

export const systemApi = {
  status: () => request<SystemStatus>('/system/status')
};

// -------------------------------------------------------------- patients ----

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

export const patientsApi = {
  list: (params: { limit?: number; offset?: number; search?: string } = {}) =>
    request<{ patients: Patient[]; pagination: Pagination }>(`/patients${query(params)}`),

  exportCsv: (search?: string) =>
    request<string>(`/patients/export${search ? `?search=${encodeURIComponent(search)}` : ''}`, {
      headers: { Accept: 'text/csv' }
    }),

  create: (payload: {
    patientNumber: string;
    fullName: string;
    age: number;
    gender: string;
    referringDoctor?: string;
    referringFacility?: string;
    clinicalNotes?: string;
  }) => request<{ patient: Patient }>('/patients', { method: 'POST', body: JSON.stringify(payload) }),

  update: (id: string, updates: Partial<Patient>) =>
    request<{ patient: Patient }>(`/patients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    }),

  delete: (id: string) =>
    request<void>(`/patients/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

// --------------------------------------------------------------- samples ----

export const samplesApi = {
  list: (params: { limit?: number; offset?: number; patientId?: string } = {}) =>
    request<{ samples: Sample[]; pagination: Pagination }>(`/samples${query(params)}`),

  /** Single-sample detail, including the stored slide image. */
  detail: (id: string) => request<{ sample: Sample }>(`/samples/${encodeURIComponent(id)}`),

  create: (payload: Partial<Sample> & { patientId: string; fieldsExamined: number }) =>
    request<{ sample: Sample }>('/samples', { method: 'POST', body: JSON.stringify(payload) }),

  slides: (sampleId: string, metadataOnly = false) =>
    request<{ slides: SpecimenSlide[] }>(
      `/samples/${encodeURIComponent(sampleId)}/slides${metadataOnly ? '?metadata=1' : ''}`
    ),

  slide: (sampleId: string, slideId: string) =>
    request<{ slide: SpecimenSlide }>(
      `/samples/${encodeURIComponent(sampleId)}/slides/${encodeURIComponent(slideId)}`
    ),

  addSlide: (sampleId: string, payload: { name: string; imageData: string }) =>
    request<{ slide: SpecimenSlide }>(`/samples/${encodeURIComponent(sampleId)}/slides`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  removeSlide: (sampleId: string, slideId: string) =>
    request<void>(`/samples/${encodeURIComponent(sampleId)}/slides/${encodeURIComponent(slideId)}`, {
      method: 'DELETE'
    })
};

/**
 * A finding a technologist marked by hand.
 *
 * Written as a real detection so it survives a reload rather than existing only
 * in the browser tab that made it. The server stores it confirmed and attributed
 * to whoever made it, because it is an observation and not a model proposal.
 */
export interface ManualDetection {
  analysisId: string;
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  note?: string;
  imageRef?: string;
  /**
   * Crop of the slide at the box, stored with the finding so the mark can be
   * reviewed later against the same picture. The server treats it as
   * evidence, not as a requirement: the finding is recorded either way.
   */
  imageData?: string;
}

export interface SpecimenSlide {
  id: string;
  sampleId: string;
  name: string;
  imageData: string;
  createdAt: string;
}

// ------------------------------------------------------------- analyses ----

/** One crop of a slide, with where it was taken from in whole-slide pixels. */
export interface ScanTile {
  imageBase64: string;
  offsetX?: number;
  offsetY?: number;
}

export const analysesApi = {
  list: (params: { limit?: number; offset?: number; sampleId?: string; status?: string } = {}) =>
    request<{ analyses: Analysis[]; pagination: Pagination }>(`/analyses${query(params)}`),

  /**
   * Progress of an in-flight scan, polled while a slide is being read.
   *
   * A slide is read as many tiles and a 63-tile scan takes far longer than the
   * request body it returns from, so the operator gets a real progress bar
   * instead of a spinner. The client chooses a token before issuing the scan
   * request and polls with it, so it can watch progress while the request is
   * still in flight rather than waiting for the analysis id the server assigns.
   */
  scanProgress: (token: string) =>
    request<{ running: boolean; total?: number; completed?: number; failed?: number; elapsedMs?: number; etaMs?: number | null }>(
      `/scan-progress/${encodeURIComponent(token)}`
    ),

 /**
    * Runs inference on a slide and persists the proposals. The model credential
    * stays server-side.
    *
    * The slide is sent as every tile it was cut into, so one scan is one request
    * that the server reads in parallel. The tiles are not sent as separate
    * requests: a 3024x4032 field is 63 tiles, and 63 round trips in series took
    * minutes, while the tiles racing each other for the one analysis row a
    * sample may have open could drop findings. `offsetX`/`offsetY` say where
    * each crop sits on the slide so its detections land in the right place.
    */
  run: (
    sampleId: string,
    tiles: ScanTile[],
    confidence?: number,
    imageRef?: string,
    scanToken?: string
  ) => {
    const path = scanToken
      ? `/analyses?scanToken=${encodeURIComponent(scanToken)}`
      : '/analyses';
    return request<{ analysis: Analysis }>(path, {
      method: 'POST',
      body: JSON.stringify({
        sampleId,
        images: (tiles ?? []).map(tile => ({
          imageBase64: tile.imageBase64,
          offsetX: Number(tile.offsetX) || 0,
          offsetY: Number(tile.offsetY) || 0
        })),
        confidence,
        imageRef
      })
    });
  },
};

// ------------------------------------------------------------ detections ----

export const detectionsApi = {
  /**
   * Records a ruling on a candidate.
   *
   * `imageData` carries the crop of the slide at the box, so what the
   * technologist was looking at when they confirmed or rejected it is stored
   * with the ruling. It is evidence, not a precondition: the ruling is the
   * clinical act and is recorded whether or not a picture travels with it.
   */
  adjudicate: (
    id: string,
    decision: { confirmed?: boolean; rejected?: boolean },
    imageData?: string
  ) =>
    request<{ detection: Analysis['detections'][number] }>(`/detections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...decision, imageData })
    }),

  /**
   * Records a finding a technologist marked by hand.
   *
   * The server stores it as a real detection, confirmed and attributed, so it
   * survives a reload rather than living only in this browser tab.
   */
  create: (detection: ManualDetection) =>
    request<{ detection: Analysis['detections'][number] }>('/detections', {
      method: 'POST',
      body: JSON.stringify(detection)
    })
};

// ------------------------------------------------------ detection images ----

export const detectionImagesApi = {
  /**
   * The evidence pictures saved against an analysis.
   *
   * Listed without their payloads: the review panel only needs to know which
   * findings have a picture and what decision it recorded, and carrying every
   * crop would make reloading an analysis carry the specimen's images again.
   */
  list: (analysisId: string) =>
    request<{ images: DetectionImage[] }>(
      `/analyses/${encodeURIComponent(analysisId)}/detection-images`
    ),

  /** One saved picture, with the crop itself. */
  detail: (id: string) =>
    request<{ image: DetectionImage }>(`/detection-images/${encodeURIComponent(id)}`)
};

// --------------------------------------------------------------- webhooks ----

/**
 * Outbound webhooks.
 *
 * An audit trail is only useful if the people who need to know about a
 * decision can find out without polling, so a lab information system, a pager,
 * or a compliance archive can subscribe to the same events the
 * administrators read in the UI. The server signs each event with
 * AUDIENCE_WEBHOOK_SECRET so the receiver can tell it came from this server
 * rather than an attacker replaying it.
 */
export const webhooksApi = {
  /** Delivers one audit event to every configured webhook URL. */
  sendAuditEvent: (payload: {
    event: string;
    entity?: string | null;
    entityId?: string | null;
    details?: string | null;
    actor?: { id: string; name: string } | null;
  }) =>
    request<{ ok: true; delivered: string[] }>('/webhooks/audit', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
};

// --------------------------------------------------------------- reports ----

export const reportsApi = {
  list: (params: { limit?: number; offset?: number; status?: string } = {}) =>
    request<{ reports: LaboratoryReport[]; pagination: Pagination }>(`/reports${query(params)}`),

  /** Full payload including patient, specimen, and findings. */
  detail: (id: string) => request<{ report: LaboratoryReport }>(`/reports/${encodeURIComponent(id)}`),

  generate: (analysisId: string, payload: { technologistNotes?: string; clinicalImpression?: string; supervisorName?: string } = {}) =>
    request<{ report: LaboratoryReport }>('/reports', {
      method: 'POST',
      body: JSON.stringify({ analysisId, ...payload })
    }),

  update: (id: string, payload: { technologistNotes?: string; clinicalImpression?: string }) =>
    request<{ report: LaboratoryReport }>(`/reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  verify: (id: string) =>
    request<{ report: LaboratoryReport }>(`/reports/${encodeURIComponent(id)}/verify`, { method: 'POST' }),

  release: (id: string) =>
    request<{ report: LaboratoryReport }>(`/reports/${encodeURIComponent(id)}/release`, { method: 'POST' }),

  delete: (id: string) =>
    request<void>(`/reports/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

// ----------------------------------------------------------------- audit ----

/** Server-shaped audit row. Distinct from the UI's flattened AuditLog. */
export interface AuditEntry {
  seq: number;
  id: string;
  timestamp: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: string | null;
  rowHash: string;
  prevHash: string;
}

export interface ChainIntegrity {
  intact: boolean;
  total: number;
  brokenAt: number | null;
  reason: string | null;
  head?: string;
}

export const auditApi = {
  list: (limit = 200) =>
    request<{ entries: AuditEntry[]; integrity: ChainIntegrity }>(`/audit?limit=${limit}`),
  verify: () => request<ChainIntegrity>('/audit/verify')
};
