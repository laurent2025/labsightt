import { createClient } from '@supabase/supabase-js';
import { quantifyDetections } from '../src/lib/quantification.js';
import { encryptPHI, decryptPHI, blindIndex } from './encryption.js';

export function hasSupabaseConfig() {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export function hasSupabaseDatabaseConfig() {
  return (
    process.env.USE_SUPABASE_DB === 'true' &&
    Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

export function getSupabaseClient({ admin = false } = {}) {
  if (!hasSupabaseConfig()) return null;

  const url = new URL(process.env.SUPABASE_URL);
  if (url.pathname.replace(/\/+$/, '') === '/rest/v1') url.pathname = '';
  const key = admin
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  return createClient(url.toString().replace(/\/$/, ''), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

export async function getSupabaseProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('email, username, display_name, role, approved, approved_at, approved_by')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Loads the profile for a Supabase auth user, auto-creating it if the row is
 * missing (e.g. when the database trigger was never applied or failed silently).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase – an admin client (service-role)
 * @param {{ id: string; email?: string; user_metadata?: Record<string, unknown> }} authUser
 * @returns {Promise<{ email: string; username: string; display_name: string }>}
 */
export async function ensureSupabaseProfile(supabase, authUser) {
  let existing = null;
  try {
    existing = await getSupabaseProfile(supabase, authUser.id);
  } catch {
    // Surface profile lookup failures explicitly instead of silently
    // fabricating identity or retrying blindly.
    throw new Error('Account profile could not be verified during login.');
  }
  if (existing) return existing;

  const email = (authUser.email ?? '').toLowerCase();
  const localPart = email.split('@')[0] || 'user';
  const username = `${localPart}_${authUser.id.slice(0, 8)}`;
  const displayName =
    authUser.user_metadata?.display_name ||
    authUser.user_metadata?.full_name ||
    localPart;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: authUser.id,
        email,
        username,
        display_name: displayName
      },
      { onConflict: 'id' }
    )
    .select('email, username, display_name, role, approved, approved_at, approved_by')
    .single();

  if (error) {
    console.error('[ensureSupabaseProfile] failed to auto-create profile:', error.message);
    throw new Error('Account profile could not be created. Contact support.');
  }
  return data;
}

/**
 * Approves or revokes a Supabase user's access. Mirrors the database functions
 * `approve_lab_user` / `revoke_lab_user_approval`; the service-role client
 * bypasses RLS, so the admin check happens in the API layer instead.
 *
 * @returns {Promise<true>}
 */
export async function setSupabaseUserApproval(supabase, userId, { approved, approvedBy }) {
  const { error } = await supabase
    .from('profiles')
    .update({
      approved: Boolean(approved),
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? (approvedBy ?? null) : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) throw error;
  return true;
}

export async function getSupabaseUserByToken(supabase, token) {
  if (!supabase || !token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function mapSupabasePatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientNumber: row.patient_number,
    fullName: decryptPHI(row.full_name),
    age: row.age,
    gender: row.gender,
    referringDoctor: decryptPHI(row.referring_doctor),
    referringFacility: decryptPHI(row.referring_facility),
    clinicalNotes: decryptPHI(row.clinical_notes),
    createdAt: row.created_at
  };
}

async function attachSupabaseSampleSummaries(supabase, patients) {
  if (!patients || patients.length === 0) return patients;

  const patientIds = patients.map(p => p.id);
  const { data, error } = await supabase
    .from('samples')
    .select('patient_id, sample_type, collection_datetime')
    .in('patient_id', patientIds);

  if (error) throw error;

  const byPatient = new Map();
  for (const row of (data || [])) {
    if (!byPatient.has(row.patient_id)) byPatient.set(row.patient_id, new Map());
    const types = byPatient.get(row.patient_id);
    if (!types.has(row.sample_type)) {
      types.set(row.sample_type, row.collection_datetime);
    } else {
      const existing = types.get(row.sample_type);
      if (new Date(row.collection_datetime) < new Date(existing)) {
        types.set(row.sample_type, row.collection_datetime);
      }
    }
  }

  for (const patient of patients) {
    const summaryMap = byPatient.get(patient.id);
    const summary = summaryMap
      ? Array.from(summaryMap.entries())
          .map(([type, collected]) => ({ type, collected }))
          .sort((a, b) => a.type.localeCompare(b.type))
      : [];

    patient.sampleTypes = summary.map(s => s.type);
    patient.primarySampleType = summary[0]?.type ?? null;
    patient.collectionDatetime = summary[0]?.collected ?? null;
    patient.sampleCount = summary.length;
  }
  return patients;
}

function mapSupabaseReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportNumber: row.report_number,
    analysisId: row.analysis_id,
    technologistId: row.technologist_id,
    technologistName: row.technologist_name,
    supervisorName: row.supervisor_name,
    status: row.status,
    technologistNotes: decryptPHI(row.technologist_notes),
    clinicalImpression: decryptPHI(row.clinical_impression),
    generatedAt: row.generated_at,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    releasedAt: row.released_at
  };
}

export async function listSupabasePatients(supabase, { limit = 50, offset = 0, search, allowedIds } = {}) {
  let query = supabase
    .from('patients')
    .select('*', { count: 'exact' })
    .eq('active', true);

  if (allowedIds && allowedIds.length > 0) {
    query = query.in('id', allowedIds);
  }

  if (typeof search === 'string' && search.trim()) {
    const term = search.trim().replace(/[\\%_]/g, '\\$&');
    query = query.or(`patient_number.ilike.%${term}%,full_name_index.ilike.%${term}%`);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);

  if (error) throw error;
  const items = await attachSupabaseSampleSummaries(supabase, (data ?? []).map(mapSupabasePatient));
  return {
    items,
    total: count ?? (data ?? []).length,
    limit: Number(limit) || 50,
    offset: Number(offset) || 0,
    search: typeof search === 'string' ? search.trim() : null
  };
}

export async function getSupabasePatient(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();

  if (error) throw error;
  const mapped = mapSupabasePatient(data);
  if (!mapped) return null;
  const attached = await attachSupabaseSampleSummaries(supabase, [mapped]);
  return attached[0];
}

export async function createSupabasePatient(supabase, payload) {
  const patientNumber = String(payload.patientNumber ?? '').trim();
  const fullName = String(payload.fullName ?? '').trim();
  const id = payload.id ?? `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await supabase
    .from('patients')
    .insert({
      id,
      patient_number: patientNumber,
      full_name: encryptPHI(fullName),
      full_name_index: blindIndex(fullName),
      age: Number(payload.age) || 0,
      gender: payload.gender ?? 'Other',
      referring_doctor: encryptPHI(payload.referringDoctor ?? ''),
      referring_facility: encryptPHI(payload.referringFacility ?? ''),
      clinical_notes: encryptPHI(payload.clinicalNotes ?? ''),
      created_at: new Date().toISOString(),
      created_by: payload.createdBy ?? null,
      active: true
    })
    .select()
    .single();

  if (error) throw error;
  return getSupabasePatient(supabase, data.id);
}

export async function updateSupabasePatient(supabase, id, updates) {
  const payload = {};
  if (updates.fullName !== undefined) {
    payload.full_name = encryptPHI(updates.fullName);
    payload.full_name_index = blindIndex(updates.fullName);
  }
  if (updates.age !== undefined) payload.age = updates.age;
  if (updates.gender !== undefined) payload.gender = updates.gender;
  if (updates.referringDoctor !== undefined) payload.referring_doctor = encryptPHI(updates.referringDoctor);
  if (updates.referringFacility !== undefined) payload.referring_facility = encryptPHI(updates.referringFacility);
  if (updates.clinicalNotes !== undefined) payload.clinical_notes = encryptPHI(updates.clinicalNotes);

  if (Object.keys(payload).length === 0) {
    return getSupabasePatient(supabase, id);
  }

  const { data, error } = await supabase
    .from('patients')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return getSupabasePatient(supabase, data.id);
}

export async function deleteSupabasePatient(supabase, id) {
  const { error } = await supabase
    .from('patients')
    .update({ active: false })
    .eq('id', id);
  if (error) throw error;
  return true;
}

export async function listSupabaseReports(supabase, { limit = 50, offset = 0, status } = {}) {
  let query = supabase.from('reports').select('*', { count: 'exact' }).is('deleted_at', null);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query
    .order('generated_at', { ascending: false })
    .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);

  if (error) throw error;
  const items = await attachSupabaseReportContext(supabase, (data ?? []).map(mapSupabaseReport), {
    includeSampleImages: false
  });
  return {
    items,
    total: count ?? (data ?? []).length,
    limit: Number(limit) || 50,
    offset: Number(offset) || 0
  };
}

/**
 * Attaches the patient, sample, and computed findings a report needs to
 * render, in batched queries rather than one round trip per report.
 * Mirrors `reportContext` in repository.js for the local SQLite path.
 */
export async function attachSupabaseReportContext(supabase, reports, { includeSampleImages = true } = {}) {
  if (!reports || reports.length === 0) return reports;

  const analysisIds = [...new Set(reports.map(r => r.analysisId).filter(Boolean))];
  if (analysisIds.length === 0) {
    for (const report of reports) {
      report.patient = null;
      report.sample = null;
      report.findings = [];
    }
    return reports;
  }

  const { data: analysisRows, error: analysisError } = await supabase
    .from('analyses')
    .select('id, sample_id')
    .in('id', analysisIds);
  if (analysisError) throw analysisError;
  const analysisMap = new Map((analysisRows ?? []).map(row => [row.id, row]));

  const sampleIds = [...new Set((analysisRows ?? []).map(row => row.sample_id).filter(Boolean))];
  const sampleMap = new Map();
  if (sampleIds.length) {
    const sampleSelect = includeSampleImages
      ? '*'
      : 'id, patient_id, sample_type, slide_label, stain_method, objective, eyepiece, total_magnification, fields_examined, field_area_mm2, collection_datetime, notes, created_at, created_by';
    const { data: sampleRows, error: sampleError } = await supabase
      .from('samples')
      .select(sampleSelect)
      .in('id', sampleIds);
    if (sampleError) throw sampleError;
    for (const row of sampleRows ?? []) sampleMap.set(row.id, mapSupabaseSample(row));
  }

  const patientIds = [...new Set([...sampleMap.values()].map(s => s.patientId).filter(Boolean))];
  const patientMap = new Map();
  if (patientIds.length) {
    const { data: patientRows, error: patientError } = await supabase
      .from('patients')
      .select('*')
      .in('id', patientIds);
    if (patientError) throw patientError;
    for (const row of patientRows ?? []) patientMap.set(row.id, mapSupabasePatient(row));
  }

  const { data: detectionRows, error: detectionError } = await supabase
    .from('detections')
    .select('*')
    .in('analysis_id', analysisIds);
  if (detectionError) throw detectionError;
  const detectionMap = new Map();
  for (const row of detectionRows ?? []) {
    if (!detectionMap.has(row.analysis_id)) detectionMap.set(row.analysis_id, []);
    detectionMap.get(row.analysis_id).push(mapSupabaseDetection(row));
  }

  for (const report of reports) {
    const analysis = analysisMap.get(report.analysisId);
    const sample = analysis ? sampleMap.get(analysis.sample_id) ?? null : null;
    const patient = sample ? patientMap.get(sample.patientId) ?? null : null;
    const detections = analysis ? (detectionMap.get(analysis.id) ?? []) : [];

    report.patient = patient;
    report.sample = sample;
    report.findings = quantifyDetections(detections, sample?.fieldsExamined ?? 10);
  }
  return reports;
}

export async function getSupabaseReport(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  const mapped = mapSupabaseReport(data);
  if (!mapped) return null;
  return (await attachSupabaseReportContext(supabase, [mapped]))[0];
}

export async function createSupabaseReport(supabase, payload) {
  const id = payload.id ?? `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reportNumber = payload.reportNumber ?? `RPT-${new Date().getFullYear()}-${id.slice(-6).toUpperCase()}`;

  const { data, error } = await supabase
    .from('reports')
    .insert({
      id,
      report_number: reportNumber,
      analysis_id: payload.analysisId,
      technologist_id: payload.technologistId,
      technologist_name: payload.technologistName,
      supervisor_name: payload.supervisorName ?? null,
      status: 'pending_verification',
      technologist_notes: encryptPHI(payload.technologistNotes ?? ''),
      clinical_impression: encryptPHI(payload.clinicalImpression ?? ''),
      generated_at: new Date().toISOString(),
      deleted_at: null
    })
    .select()
    .single();

  if (error) throw error;
  const created = mapSupabaseReport(data);
  return (await attachSupabaseReportContext(supabase, [created]))[0];
}

export async function verifySupabaseReport(supabase, id, verifierId) {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: 'verified',
      verified_at: new Date().toISOString(),
      verified_by: verifierId
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return (await attachSupabaseReportContext(supabase, [mapSupabaseReport(data)]))[0];
}

export async function releaseSupabaseReport(supabase, id) {
  const { data, error } = await supabase
    .from('reports')
    .update({
      status: 'released',
      released_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return (await attachSupabaseReportContext(supabase, [mapSupabaseReport(data)]))[0];
}

export async function updateSupabaseReport(supabase, id, updates) {
  const payload = {};
  if (updates.technologistNotes !== undefined) payload.technologist_notes = encryptPHI(updates.technologistNotes);
  if (updates.clinicalImpression !== undefined) payload.clinical_impression = encryptPHI(updates.clinicalImpression);

  if (Object.keys(payload).length === 0) {
    return getSupabaseReport(supabase, id);
  }

  const { data, error } = await supabase
    .from('reports')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return (await attachSupabaseReportContext(supabase, [mapSupabaseReport(data)]))[0];
}

export async function deleteSupabaseReport(supabase, id) {
  const { error } = await supabase
    .from('reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return true;
}

function mapSupabaseSample(row) {
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patient_id,
    sampleType: row.sample_type,
    slideLabel: row.slide_label,
    stainMethod: row.stain_method,
    objective: row.objective,
    eyepiece: row.eyepiece,
    totalMagnification: row.total_magnification,
    fieldsExamined: row.fields_examined,
    fieldAreaMm2: row.field_area_mm2,
    collectionDatetime: row.collection_datetime,
    imageUrl: row.image_path,
    notes: decryptPHI(row.notes),
    createdAt: row.created_at
  };
}

function mapSupabaseDetection(row) {
  if (!row) return null;
  return {
    id: row.id,
    analysisId: row.analysis_id,
    class: row.class_name,
    confidence: row.confidence,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    confirmed: Boolean(row.confirmed),
    rejected: Boolean(row.rejected),
    manual: Boolean(row.manual),
    note: row.note,
    imageRef: row.image_ref ?? 'primary',
    adjudicatedBy: row.adjudicated_by,
    adjudicatedAt: row.adjudicated_at
  };
}

function mapSupabaseAnalysis(row, sample, detections) {
  const detectionList = (detections ?? []).map(mapSupabaseDetection);
  return {
    id: row.id,
    sampleId: row.sample_id,
    patientId: sample?.patient_id ?? '',
    modelId: row.model_id,
    status: row.status,
    totalDetections: row.total_detections,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    initiatedBy: row.initiated_by,
    fieldsExamined: sample?.fields_examined ?? 10,
    detections: detectionList,
    findings: quantifyDetections(detectionList, sample?.fields_examined ?? 10)
  };
}

export async function listSupabaseSamples(supabase, { limit = 50, offset = 0, patientId } = {}) {
  // Lists omit the stored slide image: with a handful of samples the payload
  // reaches 20+ MB of base64, which is the dominant cost of every refresh.
  // The single-sample endpoint still returns it on demand.
  let query = supabase
    .from('samples')
    .select(
      'id, patient_id, sample_type, slide_label, stain_method, objective, eyepiece, total_magnification, fields_examined, field_area_mm2, collection_datetime, notes, created_at, created_by',
      { count: 'exact' }
    );
  if (patientId) query = query.eq('patient_id', patientId);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);

  if (error) throw error;
  return {
    items: (data ?? []).map(mapSupabaseSample),
    total: count ?? (data ?? []).length,
    limit: Number(limit) || 50,
    offset: Number(offset) || 0
  };
}

export async function getSupabaseSample(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from('samples')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return mapSupabaseSample(data);
}

export async function createSupabaseSample(supabase, payload) {
  const id = payload.id ?? `sam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('samples')
    .insert({
      id,
      patient_id: payload.patientId,
      sample_type: payload.sampleType ?? 'stool',
      slide_label: payload.slideLabel ?? id,
      stain_method: payload.stainMethod ?? '',
      objective: payload.objective ?? '40x',
      eyepiece: payload.eyepiece ?? '10x',
      total_magnification: payload.totalMagnification ?? '400x',
      fields_examined: Number(payload.fieldsExamined) || 1,
      field_area_mm2: Number(payload.fieldAreaMm2) || 0,
      collection_datetime: payload.collectionDatetime ?? new Date().toISOString(),
      image_path: payload.imageUrl ?? null,
      notes: encryptPHI(payload.notes ?? ''),
      created_at: new Date().toISOString(),
      created_by: payload.createdBy ?? null
    })
    .select()
    .single();

  if (error) throw error;
  return mapSupabaseSample(data);
}

export async function listSupabaseAnalyses(supabase, { limit = 50, offset = 0, sampleId, status } = {}) {
  let query = supabase.from('analyses').select('*', { count: 'exact' });
  if (sampleId) query = query.eq('sample_id', sampleId);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query
    .order('started_at', { ascending: false })
    .range(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 50) - 1);

  if (error) throw error;
  const rows = data ?? [];
  const sampleIds = [...new Set(rows.map(row => row.sample_id))];
  const sampleMap = new Map();
  if (sampleIds.length) {
    const { data: sampleRows, error: sampleError } = await supabase
      .from('samples')
      .select(
        'id, patient_id, sample_type, slide_label, stain_method, objective, eyepiece, total_magnification, fields_examined, field_area_mm2, collection_datetime, notes, created_at, created_by'
      )
      .in('id', sampleIds);
    if (sampleError) throw sampleError;
    for (const sampleRow of sampleRows ?? []) sampleMap.set(sampleRow.id, sampleRow);
  }

  const analysisIds = rows.map(row => row.id);
  let detectionMap = new Map();
  if (analysisIds.length) {
    const { data: detectionRows, error: detectionError } = await supabase
      .from('detections')
      .select('*')
      .in('analysis_id', analysisIds);
    if (detectionError) throw detectionError;
    for (const detectionRow of detectionRows ?? []) {
      if (!detectionMap.has(detectionRow.analysis_id)) detectionMap.set(detectionRow.analysis_id, []);
      detectionMap.get(detectionRow.analysis_id).push(detectionRow);
    }
  }

  return {
    items: rows.map(row => mapSupabaseAnalysis(row, sampleMap.get(row.sample_id), detectionMap.get(row.id) ?? [])),
    total: count ?? rows.length,
    limit: Number(limit) || 50,
    offset: Number(offset) || 0
  };
}

export async function getSupabaseAnalysis(supabase, id) {
  if (!id) return null;
  const { data: analysis, error: analysisError } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (analysisError) throw analysisError;
  if (!analysis) return null;

  const { data: sample, error: sampleError } = await supabase
    .from('samples')
    .select('*')
    .eq('id', analysis.sample_id)
    .maybeSingle();

  if (sampleError) throw sampleError;

  const { data: detections, error: detectionError } = await supabase
    .from('detections')
    .select('*')
    .eq('analysis_id', id);

  if (detectionError) throw detectionError;
  return mapSupabaseAnalysis(analysis, sample, detections ?? []);
}

export async function createSupabaseAnalysis(supabase, payload) {
  const id = payload.id ?? `ana_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('analyses')
    .insert({
      id,
      sample_id: payload.sampleId,
      model_id: payload.modelId ?? 'server-configured',
      status: payload.status ?? 'processing',
      total_detections: 0,
      started_at: payload.startedAt ?? new Date().toISOString(),
      initiated_by: payload.initiatedBy ?? null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function saveSupabaseDetections(supabase, analysisId, detections = [], imageRef = 'primary') {
  if (!detections.length) return [];
  const rows = detections.map(d => ({
    id: d.id ?? `det_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    analysis_id: analysisId,
    class_name: d.class,
    confidence: Number(d.confidence) || 0,
    x: Number(d.x) || 0,
    y: Number(d.y) || 0,
    width: Number(d.width) || 0,
    height: Number(d.height) || 0,
    confirmed: false,
    rejected: false,
    manual: false,
    note: d.note ?? null,
    image_ref: imageRef
  }));

  const { data, error } = await supabase
    .from('detections')
    .insert(rows)
    .select();

  if (error) throw error;
  return data ?? [];
}

export async function finalizeSupabaseAnalysis(supabase, id, { totalDetections, status, completedAt } = {}) {
  const { data, error } = await supabase
    .from('analyses')
    .update({
      total_detections: Number(totalDetections) || 0,
      status: status ?? 'in_review',
      completed_at: completedAt ?? new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function adjudicateSupabaseDetection(supabase, id, { confirmed, rejected, userId } = {}) {
  const patch = {
    confirmed: Boolean(confirmed),
    rejected: Boolean(rejected),
    adjudicated_by: userId ?? null,
    adjudicated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('detections')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return mapSupabaseDetection(data);
}
