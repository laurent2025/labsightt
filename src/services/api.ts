/**
 * Typed client for the LenziAI API.
 *
 * Every request carries the session cookie; the model credential never appears
 * here because it never leaves the server.
 */
import type { Analysis, LaboratoryReport, Patient, Sample } from '../types';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      for (const listener of sessionListeners) listener(true);
      throw new SessionExpiredError();
    }
    throw new ApiError(response.status, String(payload.error ?? `Request failed (${response.status})`), payload);
  }

  return payload as T;
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
  active: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  /** Recorded audit entries this user is the actor of. */
  auditCount: number;
  lastAction: string | null;
  lastActionAt: string | null;
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

  removeUser: (id: string) =>
    request<{ ok: true; id: string; suspended: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
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
    request<{ sample: Sample }>('/samples', { method: 'POST', body: JSON.stringify(payload) })
};

// ------------------------------------------------------------- analyses ----

export const analysesApi = {
  list: (params: { limit?: number; offset?: number; sampleId?: string; status?: string } = {}) =>
    request<{ analyses: Analysis[]; pagination: Pagination }>(`/analyses${query(params)}`),

  /** Runs inference on the server. The model credential stays server-side. */
  run: (sampleId: string, imageBase64: string, confidence?: number) =>
    request<{ analysis: Analysis }>('/analyses', {
      method: 'POST',
      body: JSON.stringify({ sampleId, imageBase64, confidence })
    })
};

// ------------------------------------------------------------ detections ----

export const detectionsApi = {
  adjudicate: (id: string, decision: { confirmed?: boolean; rejected?: boolean }) =>
    request<{ detection: Analysis['detections'][number] }>(`/detections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(decision)
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

