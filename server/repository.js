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
const MAX_IN_CLAUSE = 999;

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

export function listPatients(db, { limit, offset, search, createdBy } = {}) {
  const paging = normalisePaging({ limit, offset });
  const term = typeof search === 'string' ? search.trim() : '';

  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
    const nameHash = blindIndex(term);
    const clauses = ["active = 1", "(patient_number LIKE ? ESCAPE '\\' OR full_name_index = ?)"];
    const values = [pattern, nameHash];
    if (createdBy) {
      clauses.push('created_by = ?');
      values.push(createdBy);
    }
    const where = clauses.join(' AND ');

    const total = db
      .prepare(`SELECT COUNT(*) AS n FROM patients WHERE ${where}`)
      .get(...values).n;

    const rows = db
      .prepare(
        `SELECT * FROM patients WHERE ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...values, paging.limit, paging.offset);

    return {
      items: attachSampleSummaries(db, rows.map(mapPatient)),
      ...paging,
      total,
      search: term
    };
  }

  const whereClause = createdBy ? 'WHERE active = 1 AND created_by = ?' : 'WHERE active = 1';
  const countValues = createdBy ? [createdBy] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM patients ${whereClause}`).get(...countValues).n;
  const rows = db
    .prepare(`SELECT * FROM patients ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...countValues, paging.limit, paging.offset);

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

export function listSamples(db, { limit, offset, patientId, createdBy } = {}) {
  const paging = normalisePaging({ limit, offset });
  const filters = [];
  const values = [];
  if (patientId) {
    filters.push('s.patient_id = ?');
    values.push(patientId);
  }
  if (createdBy) {
    filters.push('s.created_by = ?');
    values.push(createdBy);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS n FROM samples s ${where}`).get(...values).n;
  const rows = db
    .prepare(`SELECT s.* FROM samples s ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, paging.limit, paging.offset);
  return { items: rows.map(mapSample), ...paging, total };
}

/** Sample rows for a set of ids, in one query, keyed by id. */
export function samplesByIds(db, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const clamped = ids.slice(0, MAX_IN_CLAUSE);
  const placeholders = clamped.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM samples WHERE id IN (${placeholders})`)
    .all(...clamped);
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
export function listAnalyses(db, { limit, offset, sampleId, status, createdBy } = {}) {
  const paging = normalisePaging({ limit, offset });

  const filters = ['p.active = 1'];
  const params = [];
  if (sampleId) {
    filters.push('a.sample_id = ?');
    params.push(sampleId);
  }
  if (status) {
    filters.push('a.status = ?');
    params.push(status);
  }
  if (createdBy) {
    filters.push('a.initiated_by = ?');
    params.push(createdBy);
  }
  const where = `WHERE ${filters.join(' AND ')}`;

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM analyses a JOIN samples s ON s.id = a.sample_id JOIN patients p ON p.id = s.patient_id ${where}`)
    .get(...params).n;

  const analysisRows = db
    .prepare(`SELECT a.* FROM analyses a JOIN samples s ON s.id = a.sample_id JOIN patients p ON p.id = s.patient_id ${where} ORDER BY a.started_at DESC LIMIT ? OFFSET ?`)
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
      patientId: sample?.patient_id ?? '',
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
    patientId: sample?.patient_id ?? '',
    fieldsExamined: sample?.fields_examined ?? 10,
    detections: mapped,
    findings: quantifyDetections(mapped, sample?.fields_examined ?? 10)
  };
}

/** All detections for many analyses in a single query, grouped by analysis id. */
export function detectionsByAnalysis(db, analysisIds) {
  const map = new Map();
  if (!analysisIds.length) return map;
  const clamped = analysisIds.slice(0, MAX_IN_CLAUSE);
  const placeholders = clamped.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM detections WHERE analysis_id IN (${placeholders}) ORDER BY class_name, id`)
    .all(...clamped);
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
  const clamped = analysisIds.slice(0, MAX_IN_CLAUSE);
  const placeholders = clamped.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT analysis_id, COUNT(*) AS n
      FROM detections
      WHERE analysis_id IN (${placeholders}) AND confirmed = 0 AND rejected = 0
      GROUP BY analysis_id
    `)
    .all(...clamped);
  for (const row of rows) counts.set(row.analysis_id, row.n);
  return counts;
}

// -------------------------------------------------------------- reports ----

export function listReports(db, { limit, offset, status, createdBy } = {}) {
  const paging = normalisePaging({ limit, offset });
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (createdBy) {
    clauses.push('technologist_id = ?');
    params.push(createdBy);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM reports ${where}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM reports ${where} ORDER BY generated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, paging.limit, paging.offset);

  return {
    items: rows.map(row => ({ ...mapReport(row), ...reportContext(db, row) })),
    ...paging,
    total
  };
}

export function getReport(db, id) {
  const row = db.prepare('SELECT * FROM reports WHERE id = ? AND deleted_at IS NULL').get(id);
  return row ? { ...mapReport(row), ...reportContext(db, row) } : null;
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
    imageUrl: row.image_path,
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
