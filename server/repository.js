/**
 * Data access for the laboratory record.
 *
 * Centralised so pagination, search, and batching are applied consistently and
 * so no route can accidentally reintroduce an N+1 query. Every list function
 * returns `{ items, total, limit, offset }` so the UI can paginate without
 * guessing whether it has reached the end.
 */
import { quantifyDetections } from '../src/lib/quantification.js';
import { decryptPHI, blindIndex } from './encryption.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Clamps caller-supplied paging so a huge `limit` cannot exhaust memory. */
export function normalisePaging({ limit, offset } = {}) {
  const parsedLimit = Number(limit);
  const parsedOffset = Number(offset);
  return {
    limit: Number.isFinite(parsedLimit)
      ? Math.min(Math.max(1, Math.trunc(parsedLimit)), MAX_LIMIT)
      : DEFAULT_LIMIT,
    offset: Number.isFinite(parsedOffset) ? Math.max(0, Math.trunc(parsedOffset)) : 0
  };
}

// ------------------------------------------------------------- patients ----

/**
 * Specimen types per patient, in one query for the whole page.
 *
 * `sample_type` lives on `samples`, not `patients`, so a patient row on its own
 * cannot say what specimen was taken. The client needs this for the specimen
 * filter and the list badge. Fetching it per patient would be an N+1, so it is
 * a single grouped query over the ids already in hand.
 */
function attachSampleSummaries(db, patients) {
  if (patients.length === 0) return patients;

  const placeholders = patients.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT patient_id, sample_type, MIN(collection_datetime) AS earliest
       FROM samples
       WHERE patient_id IN (${placeholders})
       GROUP BY patient_id, sample_type
       ORDER BY patient_id, sample_type`
    )
    .all(...patients.map(p => p.id));

  const byPatient = new Map();
  for (const row of rows) {
    if (!byPatient.has(row.patient_id)) byPatient.set(row.patient_id, []);
    byPatient.get(row.patient_id).push({ type: row.sample_type, collected: row.earliest });
  }

  for (const patient of patients) {
    const summary = byPatient.get(patient.id) ?? [];
    // A patient may legitimately have several specimens of different types, so
    // this is a list rather than a single value. `sampleTypes` is what the
    // client filters on; `primarySampleType` is the earliest, for a one-line
    // label. Neither is invented when the patient has no specimen yet.
    patient.sampleTypes = summary.map(s => s.type);
    patient.primarySampleType = summary[0]?.type ?? null;
    patient.collectionDatetime = summary[0]?.collected ?? null;
    patient.sampleCount = summary.length;
  }
  return patients;
}

export function listPatients(db, { limit, offset, search } = {}) {
  const paging = normalisePaging({ limit, offset });
  const term = typeof search === 'string' ? search.trim() : '';

  if (term) {
    // Escape LIKE wildcards so a literal % or _ does not match everything.
    const pattern = `%${term.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;

    // The name column is ciphertext, so it can only be matched through the
    // blind index (exact, case/whitespace insensitive). The patient number is
    // not encrypted, so substring search works there.
    const nameHash = blindIndex(term);
    const where = `(patient_number LIKE ? ESCAPE '\\' OR full_name_index = ?)`;

    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM patients WHERE ${where}`)
      .get(pattern, nameHash).n;

    const rows = db
      .prepare(
        `SELECT * FROM patients WHERE ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(pattern, nameHash, paging.limit, paging.offset);

    return {
      items: attachSampleSummaries(db, rows.map(mapPatient)),
      ...paging,
      total,
      search: term
    };
  }

  const total = db.prepare('SELECT COUNT(*) AS n FROM patients').get().n;
  const rows = db
    .prepare('SELECT * FROM patients ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(paging.limit, paging.offset);

  return {
    items: attachSampleSummaries(db, rows.map(mapPatient)),
    ...paging,
    total,
    search: null
  };
}

export function getPatient(db, id) {
  const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!row) return null;
  return attachSampleSummaries(db, [mapPatient(row)])[0];
}

export function updatePatient(db, id, updates) {
  const allowed = {
    fullName: 'full_name',
    age: 'age',
    gender: 'gender',
    referringDoctor: 'referring_doctor',
    referringFacility: 'referring_facility',
    clinicalNotes: 'clinical_notes'
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (updates[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(updates[key]);
    }
  }
  // Keep the blind index in step with the encrypted name.
  if (updates.fullName !== undefined) {
    sets.push('full_name_index = ?');
    values.push(blindIndex(updates.fullName));
  }
  if (sets.length === 0) return getPatient(db, id);

  values.push(id);
  db.prepare(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getPatient(db, id);
}

// -------------------------------------------------------------- samples ----

export function listSamples(db, { limit, offset, patientId } = {}) {
  const paging = normalisePaging({ limit, offset });

  if (patientId) {
    const total = db
      .prepare('SELECT COUNT(*) AS n FROM samples WHERE patient_id = ?')
      .get(patientId).n;
    const rows = db
      .prepare('SELECT * FROM samples WHERE patient_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(patientId, paging.limit, paging.offset);
    return { items: rows.map(mapSample), ...paging, total };
  }

  const total = db.prepare('SELECT COUNT(*) AS n FROM samples').get().n;
  const rows = db
    .prepare('SELECT * FROM samples ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(paging.limit, paging.offset);
  return { items: rows.map(mapSample), ...paging, total };
}

/** Sample rows for a set of ids, in one query, keyed by id. */
export function samplesByIds(db, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM samples WHERE id IN (${placeholders})`)
    .all(...ids);
  for (const row of rows) map.set(row.id, row);
  return map;
}

export function getSample(db, id) {
  const row = db.prepare('SELECT * FROM samples WHERE id = ?').get(id);
  return row ? mapSample(row) : null;
}

// ------------------------------------------------------------ analyses ----

/**
 * Analyses with their detections and computed findings.
 *
 * Detections for the whole page are fetched in ONE query and grouped in
 * memory. The previous implementation ran a query per analysis and mapped
 * detections twice each, and it hardcoded fieldsExamined to 10 — which meant
 * the server could report a different quantity than the technologist saw.
 */
export function listAnalyses(db, { limit, offset, sampleId, status } = {}) {
  const paging = normalisePaging({ limit, offset });

  const filters = [];
  const params = [];
  if (sampleId) {
    filters.push('sample_id = ?');
    params.push(sampleId);
  }
  if (status) {
    filters.push('status = ?');
    params.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM analyses ${where}`)
    .get(...params).n;

  const analysisRows = db
    .prepare(`SELECT * FROM analyses ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset);

  if (analysisRows.length === 0) {
    return { items: [], ...paging, total };
  }

  const analysisIds = analysisRows.map(r => r.id);
  const sampleMap = samplesByIds(db, [...new Set(analysisRows.map(r => r.sample_id))]);
  const detectionMap = detectionsByAnalysis(db, analysisIds);

  const items = analysisRows.map(row => {
    const sample = sampleMap.get(row.sample_id);
    const rawDetections = detectionMap.get(row.id) ?? [];
    const detections = rawDetections.map(mapDetection);
    return {
      ...mapAnalysisRow(row),
      fieldsExamined: sample?.fields_examined ?? 10,
      detections,
      findings: quantifyDetections(detections, sample?.fields_examined ?? 10)
    };
  });

  return { items, ...paging, total };
}

export function getAnalysis(db, id) {
  const row = db.prepare('SELECT * FROM analyses WHERE id = ?').get(id);
  if (!row) return null;

  const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(row.sample_id);
  const detections = detectionsByAnalysis(db, [id]).get(id) ?? [];
  const mapped = detections.map(mapDetection);

  return {
    ...mapAnalysisRow(row),
    fieldsExamined: sample?.fields_examined ?? 10,
    detections: mapped,
    findings: quantifyDetections(mapped, sample?.fields_examined ?? 10)
  };
}

/** All detections for many analyses in a single query, grouped by analysis id. */
export function detectionsByAnalysis(db, analysisIds) {
  const map = new Map();
  if (!analysisIds.length) return map;
  const placeholders = analysisIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM detections WHERE analysis_id IN (${placeholders}) ORDER BY class_name, id`)
    .all(...analysisIds);
  for (const row of rows) {
    if (!map.has(row.analysis_id)) map.set(row.analysis_id, []);
    map.get(row.analysis_id).push(row);
  }
  return map;
}

/** Count of detections that still need a ruling, per analysis, in one query. */
export function pendingAdjudicationCounts(db, analysisIds) {
  const counts = new Map();
  if (!analysisIds.length) return counts;
  const placeholders = analysisIds.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT analysis_id, COUNT(*) AS n
      FROM detections
      WHERE analysis_id IN (${placeholders}) AND confirmed = 0 AND rejected = 0
      GROUP BY analysis_id
    `)
    .all(...analysisIds);
  for (const row of rows) counts.set(row.analysis_id, row.n);
  return counts;
}

// -------------------------------------------------------------- reports ----

export function listReports(db, { limit, offset, status } = {}) {
  const paging = normalisePaging({ limit, offset });
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];

  const total = db.prepare(`SELECT COUNT(*) AS n FROM reports ${where}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM reports ${where} ORDER BY generated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset);

  return { items: rows.map(mapReport), ...paging, total };
}

export function getReport(db, id) {
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(id);
  return row ? mapReport(row) : null;
}

/** Patient + sample context a report needs to render. One query each, not N. */
export function reportContext(db, reportRow) {
  if (!reportRow) return null;
  const analysis = db
    .prepare('SELECT * FROM analyses WHERE id = ?')
    .get(reportRow.analysis_id);
  if (!analysis) return null;

  const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(analysis.sample_id);
  if (!sample) return null;

  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(sample.patient_id);
  const detections = (detectionsByAnalysis(db, [analysis.id]).get(analysis.id) ?? []).map(mapDetection);

  return {
    patient: patient ? mapPatient(patient) : null,
    sample: mapSample(sample),
    findings: quantifyDetections(detections, sample.fields_examined)
  };
}

// --------------------------------------------------------------- mappers ----

function mapPatient(row) {
  return {
    id: row.id,
    patientNumber: row.patient_number,
    // PHI columns are stored as ciphertext; decrypt on the way out.
    fullName: decryptPHI(row.full_name),
    age: row.age,
    gender: row.gender,
    referringDoctor: decryptPHI(row.referring_doctor),
    referringFacility: decryptPHI(row.referring_facility),
    clinicalNotes: decryptPHI(row.clinical_notes),
    createdAt: row.created_at
  };
}

function mapSample(row) {
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
    imagePath: row.image_path,
    notes: decryptPHI(row.notes),
    createdAt: row.created_at
  };
}

function mapDetection(row) {
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
    adjudicatedBy: row.adjudicated_by,
    adjudicatedAt: row.adjudicated_at
  };
}

function mapAnalysisRow(row) {
  return {
    id: row.id,
    sampleId: row.sample_id,
    modelId: row.model_id,
    status: row.status,
    totalDetections: row.total_detections,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    initiatedBy: row.initiated_by
  };
}

function mapReport(row) {
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

export { mapPatient, mapSample, mapDetection, mapReport };
export { MAX_LIMIT, DEFAULT_LIMIT };
