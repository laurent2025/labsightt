/**
 * Synthetic evaluation data.
 *
 * This writes FAKE patient records. Every generated name is prefixed
 * `SYNTHETIC-` so a seeded row is impossible to mistake for a real accession,
 * and the referring facilities are invented. Nothing here came from a patient,
 * a hospital, or a validated measurement.
 *
 * What this is for: exercising the workflow end to end — pagination, search,
 * adjudication, the two-person verification gate, audit chain integrity — so
 * those paths can be reviewed with data present. What it is not for: anything
 * resembling clinical evidence. A synthetic cohort is not a validation set, and
 * running this script does not make the software a medical device.
 *
 * Usage:
 *   node --env-file=.env scripts/seed.js            # refuses if data exists
 *   node --env-file=.env scripts/seed.js --reset    # wipes synthetic rows first
 *   node --env-file=.env scripts/seed.js --scale 3  # more patients
 */
import { openDatabase, installImmutabilityGuards } from '../server/db.js';
import { appendAudit, verifyChain } from '../server/audit.js';
import { encryptPHI, blindIndex, selfTest } from '../server/encryption.js';
import { newId } from '../server/crypto.js';

const DB_PATH = process.env.DB_PATH || './data/labsight.db';
const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const SCALE = Math.max(1, Math.min(50, Number(readFlag('--scale')) || 1));

function readFlag(name) {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
}

const MODEL_ID = 'model-labsight-yolo26m-workflow';

// Classes drawn from the configured presets in src/lib/constants.ts. These are
// model label strings, not findings: the confidences below are arbitrary values
// chosen to exercise the UI, and mean nothing.
const CLASSES = {
  stool: [
    'Giardia lamblia cyst',
    'Entamoeba histolytica',
    'Ascaris lumbricoides ovum',
    'Hookworm egg',
    'Schistosoma mansoni ovum',
    'Trichuris trichiura'
  ],
  blood: [
    'Erythrocyte (RBC)',
    'Polymorphonuclear Neutrophil',
    'Lymphocyte',
    'Monocyte',
    'Plasmodium falciparum ring',
    'Platelet clump'
  ],
  urine: [
    'Calcium oxalate dihydrate',
    'Pus cell (Leukocyte)',
    'Squamous epithelial cell',
    'Triple phosphate crystal',
    'Uric acid crystal',
    'Hyaline cast'
  ]
};

const SPECIMEN = {
  stool: {
    objective: '40x',
    eyepiece: '10x',
    totalMagnification: '400x',
    fieldsExamined: 10,
    fieldAreaMm2: 0.159,
    stainMethod: "Lugol's Iodine Wet Mount"
  },
  blood: {
    objective: '100x_oil',
    eyepiece: '10x',
    totalMagnification: '1000x',
    fieldsExamined: 20,
    fieldAreaMm2: 0.025,
    stainMethod: 'Giemsa Thin Blood Film'
  },
  urine: {
    objective: '40x',
    eyepiece: '10x',
    totalMagnification: '400x',
    fieldsExamined: 10,
    fieldAreaMm2: 0.159,
    stainMethod: 'Unstained Centrifuged Sediment'
  }
};

const SURNAMES = [
  'Alder', 'Brennan', 'Castellan', 'Duarte', 'Eriksen', 'Farrow',
  'Gallo', 'Haddad', 'Ivarsson', 'Jansen', 'Kowal', 'Lindqvist'
];
const GIVEN = ['Ada', 'Bram', 'Cleo', 'Dara', 'Emil', 'Fen', 'Greta', 'Hal', 'Ines', 'Joris', 'Kai', 'Lior'];

/** Deterministic PRNG so a given --scale always produces the same cohort. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function fail(message) {
  console.error(`\n  Refusing to seed: ${message}\n`);
  process.exit(1);
}

async function main() {
  if (!process.env.PHI_ENCRYPTION_KEY) {
    fail('PHI_ENCRYPTION_KEY is not set. Synthetic names are still patient-shaped data and are encrypted the same way.');
  }
  if (process.env.NODE_ENV === 'production') {
    fail('NODE_ENV=production. Seeding synthetic records into a production database is not a supported operation.');
  }
  if (!selfTest()) {
    fail('the PHI encryption self-test failed. Check PHI_ENCRYPTION_KEY.');
  }

  const db = openDatabase(DB_PATH);
  installImmutabilityGuards(db);

  const counts = tableCounts(db);

  if (!RESET && (counts.patients > 0 || counts.samples > 0 || counts.analyses > 0)) {
    db.close();
    fail(
      `this database already holds ${counts.patients} patient(s), ${counts.samples} sample(s), ` +
        `${counts.analyses} analysis/analyses. Seeding on top would mix synthetic and real ` +
        'records in the same tables. Use --reset to delete the existing rows first, or a ' +
        'separate DB_PATH for a throwaway evaluation database.'
    );
  }

  if (RESET) {
    wipeSynthetic(db);
    // The audit log is append-only by trigger, so a --reset cannot erase history.
    // That is the correct behaviour, not a limitation to work around: the reset
    // itself is recorded and the chain remains verifiable.
    appendAudit(db, {
      actorName: 'system',
      action: 'SYNTHETIC_DATA_RESET',
      entity: 'database',
      details: `Synthetic rows deleted before reseeding. Remaining: ${JSON.stringify(tableCounts(db))}`
    });
  }

  console.log(`\n  Seeding synthetic evaluation data into ${DB_PATH}\n`);

  const staff = resolveStaff(db);
  if (!staff.tech || !staff.supervisor) {
    db.close();
    fail(
      'the database has no technologist and supervisor account. Start the server once ' +
        'so it bootstraps the role accounts, then run the seed again.'
    );
  }

  const cohort = seedCohort(db, staff, SCALE);

  const chain = verifyChain(db);
  const final = tableCounts(db);

  console.log('  Created:');
  for (const [table, n] of Object.entries(final)) {
    if (table === 'users') continue;
    console.log(`    ${table.padEnd(11)} ${n}`);
  }

  console.log(
    `\n  ${cohort} synthetic patients, samples, analyses, detections and reports.` +
      '\n  Every name is prefixed SYNTHETIC-. None of this is clinical data.' +
      '\n  Analyses were attributed to ' + staff.tech.display_name + ', verified by ' +
      staff.supervisor.display_name + '.' +
      `\n\n  Audit chain: ${chain.intact ? `intact across ${chain.total} entries` : `BROKEN at ${chain.brokenAt} — ${chain.reason}`}` +
      (chain.intact ? '' : '\n') +
      '\n  Set DB_PATH to a throwaway file for evaluation, or run --reset to clear these rows.\n'
  );

  db.close();
  if (!chain.intact) process.exit(1);
}

function tableCounts(db) {
  const out = {};
  for (const t of ['users', 'patients', 'samples', 'analyses', 'detections', 'reports', 'audit_log']) {
    out[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  }
  return out;
}

/**
 * Deletes synthetic rows. Foreign keys cascade, so removing the patients
 * removes their samples, analyses, detections and reports.
 *
 * Patients are identified by the `SYN-` patient-number prefix. `full_name` is
 * encrypted and cannot be matched with LIKE, but `patient_number` is stored in
 * the clear, so it is the reliable marker.
 *
 * Staff accounts are deliberately kept. `audit_log.actor_id` references
 * `users(id)` without ON DELETE, and the immutability triggers block the UPDATE
 * that would be needed to detach them — so deleting a seeded operator would
 * either fail or require forging past the audit trail. Keeping the accounts
 * costs three rows and preserves the chain.
 */
function wipeSynthetic(db) {
  const before = tableCounts(db);
  const result = db.prepare("DELETE FROM patients WHERE patient_number LIKE 'SYN-%'").run();
  return { before, deletedPatients: result.changes, after: tableCounts(db) };
}

/**
 * Staff accounts are the server's job, not this script's.
 *
 * The server bootstraps one account per role on startup (technologist,
 * supervisor, director). Creating a second set here meant four technologists
 * and three directors, and made it unclear which pair to sign in as to test the
 * two-person verification gate. So this only resolves the ids it needs.
 */
function resolveStaff(db) {
  const byRole = role =>
    db.prepare('SELECT id, username, display_name FROM users WHERE role = ? AND active = 1 ORDER BY created_at ASC LIMIT 1').get(role);

  return {
    tech: byRole('technologist'),
    supervisor: byRole('supervisor')
  };
}

function seedCohort(db, staff, scale) {
  const tech = staff.tech;
  const superUser = staff.supervisor;
  const techId = tech.id;
  const superId = superUser.id;
  const rng = makeRng(0x5eed1);
  const base = Date.UTC(2026, 8, 1);
  let patients = 0;

  for (let i = 0; i < scale; i += 1) {
    for (const sampleType of ['stool', 'blood', 'urine']) {
      const n = patients;
      const surname = SURNAMES[n % SURNAMES.length];
      const given = GIVEN[(n * 5) % GIVEN.length];
      // The SYNTHETIC- prefix is applied to the encrypted plaintext, so it
      // travels through encryption and decryption exactly as a real name would.
      const fullName = `SYNTHETIC-${given} ${surname}`;
      const patientId = newId('pat');
      const collected = new Date(base + n * 3_600_000).toISOString();

      db.prepare(`
        INSERT INTO patients (id, patient_number, full_name, full_name_index, age, gender,
                              referring_doctor, referring_facility, clinical_notes,
                              created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        patientId,
        `SYN-${String(n + 1).padStart(4, '0')}`,
        encryptPHI(fullName),
        blindIndex(fullName),
        18 + Math.floor(rng() * 60),
        rng() > 0.5 ? 'Female' : 'Male',
        encryptPHI(`SYNTHETIC-DR. ${surname.toUpperCase()}`),
        'Synthetic Evaluation Hospital (fictional)',
        encryptPHI('SYNTHETIC evaluation record. Not a real patient. Not clinical evidence.'),
        collected,
        techId
      );

      const spec = SPECIMEN[sampleType];
      const sampleId = newId('smp');
      db.prepare(`
        INSERT INTO samples (id, patient_id, sample_type, slide_label, stain_method, objective,
                             eyepiece, total_magnification, fields_examined, field_area_mm2,
                             collection_datetime, notes, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sampleId,
        patientId,
        sampleType,
        `SLD-SYN-${String(n + 1).padStart(4, '0')}${sampleType[0].toUpperCase()}`,
        spec.stainMethod,
        spec.objective,
        spec.eyepiece,
        spec.totalMagnification,
        spec.fieldsExamined,
        spec.fieldAreaMm2,
        collected,
        encryptPHI('SYNTHETIC evaluation specimen.'),
        collected,
        techId
      );

      // Cycle the cohort across the workflow states so every gate has something
      // to act on: pending adjudication, fully adjudicated, and verified.
      const stage = n % 3;
      const analysisId = newId('ana');
      const classes = CLASSES[sampleType];
      const detectionCount = 2 + Math.floor(rng() * 4);
      const detections = [];

      for (let d = 0; d < detectionCount; d += 1) {
        detections.push({
          id: newId('det'),
          className: classes[Math.floor(rng() * classes.length)],
          // Arbitrary, in-range, and meaningless. A real confidence comes from a
          // model actually running on the image.
          confidence: Number((0.55 + rng() * 0.44).toFixed(3)),
          x: Number((rng() * 0.7).toFixed(4)),
          y: Number((rng() * 0.7).toFixed(4)),
          width: Number((0.05 + rng() * 0.12).toFixed(4)),
          height: Number((0.05 + rng() * 0.12).toFixed(4))
        });
      }

      // Stage 0: one detection left unadjudicated, so report generation is
      // correctly refused with 409 and the gate can be seen working.
      const adjudicated = stage === 0 ? detections.slice(0, -1) : detections;
      // Stage 2 rejects its last detection, so the "rejected" path and the
      // confirmed-vs-candidate counts are always exercised. Earlier versions
      // used an index test that silently did nothing on short detection lists.
      const rejectedIndex = stage === 2 ? adjudicated.length - 1 : -1;

      const analysisStatus = stage === 2 ? 'verified' : 'in_review';
      const started = new Date(new Date(collected).getTime() + 1_800_000).toISOString();

      db.prepare(`
        INSERT INTO analyses (id, sample_id, model_id, status, total_detections,
                              started_at, completed_at, initiated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        analysisId,
        sampleId,
        MODEL_ID,
        analysisStatus,
        detections.length,
        started,
        new Date(new Date(started).getTime() + 45_000).toISOString(),
        techId
      );

      const insertDetection = db.prepare(`
        INSERT INTO detections (id, analysis_id, class_name, confidence, x, y, width, height,
                                confirmed, rejected, manual, adjudicated_by, adjudicated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      detections.forEach(det => {
        const position = adjudicated.indexOf(det);
        const decided = position !== -1;
        const isRejected = decided && position === rejectedIndex;
        insertDetection.run(
          det.id,
          analysisId,
          det.className,
          det.confidence,
          det.x,
          det.y,
          det.width,
          det.height,
          decided && !isRejected ? 1 : 0,
          isRejected ? 1 : 0,
          0,
          decided ? techId : null,
          decided ? new Date(new Date(started).getTime() + 300_000).toISOString() : null
        );
      });

      // Only stage 2 (fully adjudicated, verified) reaches the report table,
      // and only stage 2 is consistent with a released status. Stages 0 and 1
      // deliberately have no report, which is the real behaviour.
      if (stage === 2) {
        const reportId = newId('rpt');
        const generated = new Date(new Date(started).getTime() + 600_000).toISOString();
        const verified = new Date(new Date(started).getTime() + 900_000).toISOString();

        db.prepare(`
          INSERT INTO reports (id, report_number, analysis_id, technologist_id, technologist_name,
                               supervisor_name, status, technologist_notes, clinical_impression,
                               generated_at, verified_at, verified_by, released_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          reportId,
          `RPT-SYN-${String(n + 1).padStart(4, '0')}`,
          analysisId,
          techId,
          tech.display_name,
          superUser.display_name,
          n % 2 === 0 ? 'released' : 'verified',
          'SYNTHETIC evaluation note. Generated from a fabricated cohort.',
          'SYNTHETIC evaluation impression. Not a diagnostic statement.',
          generated,
          verified,
          superId,
          n % 2 === 0 ? verified : null
        );
      }

      appendAudit(db, {
        actorId: techId,
        actorName: tech.display_name,
        action: 'SYNTHETIC_ANALYSIS_SEEDED',
        entity: 'analysis',
        entityId: analysisId,
        timestamp: started,
        details: `${detections.length} synthetic detections on a synthetic ${sampleType} specimen`
      });

      patients += 1;
    }
  }

  return patients;
}

await main();
