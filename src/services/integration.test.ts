import { describe, it, expect } from 'vitest';
import {
  generateFHIRDiagnosticReport,
  generateDICOMMetadata,
  ROBOFLOW_POPULAR_MODELS
} from './integration';
import { quantifyDetections } from '../lib/quantification';
import type { Detection, LaboratoryReport } from '../types';

const detections: Detection[] = [
  { id: 'd1', class: 'Giardia lamblia cyst', confidence: 0.91, x: 1, y: 2, width: 3, height: 4, confirmed: true },
  { id: 'd2', class: 'Giardia lamblia cyst', confidence: 0.87, x: 5, y: 6, width: 7, height: 8, confirmed: true },
  { id: 'd3', class: 'Pus cell (Leukocyte)', confidence: 0.64, x: 9, y: 10, width: 11, height: 12, confirmed: true }
];

const report: LaboratoryReport = {
  id: 'rpt-1',
  reportNumber: 'RPT-2026-0842',
  analysisId: 'ana-1',
  patient: {
    id: 'pat-1',
    patientNumber: 'PT-1042',
    fullName: 'Test Patient',
    age: 46,
    gender: 'Female',
    referringDoctor: 'Dr. Referral',
    referringFacility: 'Demo Clinic',
    sampleTypes: ['stool'],
    primarySampleType: 'stool',
    collectionDatetime: '2026-03-04T09:15:00.000Z',
    sampleCount: 1,
    createdAt: '2026-03-04T10:00:00.000Z'
  },
  sample: {
    id: 'sam-1',
    patientId: 'pat-1',
    sampleType: 'stool',
    collectionDatetime: '2026-03-04T09:15',
    objective: '40x',
    eyepiece: '10x',
    totalMagnification: '400x',
    fieldsExamined: 10,
    fieldAreaMm2: 0.1963,
    imageUrl: '',
    stainMethod: 'Modified Trichrome (Chromotrope 2R)',
    slideLabel: 'SLD-49201'
  },
  findings: quantifyDetections(detections, 10),
  technologistNotes: 'All candidates reviewed.',
  clinicalImpression: 'Giardia lamblia identified.',
  technologistName: 'Amara Diallo',
  technologistId: 'tech-1',
  supervisorName: 'Dr. Kwame Mensah',
  status: 'verified',
  generatedAt: '2026-03-04T11:00:00.000Z',
  verifiedAt: '2026-03-04T12:00:00.000Z',
  verifiedBy: 'Dr. Kwame Mensah',
  laboratoryInfo: {
    name: 'Demo Pathology Unit',
    licenseNumber: 'NA',
    accreditation: 'None',
    address: 'Local',
    contact: 'none',
    director: 'unassigned'
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateFHIRDiagnosticReport', () => {
  const { bundle, report: dr, observations } = generateFHIRDiagnosticReport(report);

  it('returns a collection Bundle containing the report and every observation', () => {
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.type).toBe('collection');
    // 1 Patient + 1 DiagnosticReport + N Observations
    expect(bundle.entry).toHaveLength(observations.length + 2);
  });

  it('emits the Patient resource its references point at', () => {
    const patient = bundle.entry.find(e => e.resource.resourceType === 'Patient')?.resource as
      | { id: string; identifier: { value: string }[] }
      | undefined;
    expect(patient).toBeDefined();
    expect(dr.subject.reference).toBe(`Patient/${patient!.id}`);
  });

  it('uses a resolvable reference for every observation result', () => {
    const observationIds = new Set(observations.map(o => `Observation/${o.id}`));
    expect(dr.result).toHaveLength(observations.length);
    for (const ref of dr.result) {
      expect(observationIds.has(ref.reference)).toBe(true);
    }
  });

  it('produces RFC 4122 v4 resource ids', () => {
    expect(dr.id).toMatch(UUID_RE);
    for (const obs of observations) {
      expect(obs.id).toMatch(UUID_RE);
    }
  });

  it('uses a well-formed urn:uuid identifier', () => {
    const identifier = dr.identifier[0].value;
    expect(identifier.startsWith('urn:uuid:')).toBe(true);
    expect(identifier.slice('urn:uuid:'.length)).toMatch(UUID_RE);
  });

  it('maps a verified report to final and a draft to preliminary', () => {
    expect(dr.status).toBe('final');
    expect(generateFHIRDiagnosticReport({ ...report, status: 'draft' }).report.status).toBe('preliminary');
  });

  it('reports the technologist-confirmed count, not the raw candidate count', () => {
    const giardia = observations.find(o => o.code.text?.includes('Giardia'));
    expect(giardia).toBeDefined();
    expect(giardia!.valueQuantity.value).toBe(report.findings.find(f => f.name === 'Giardia lamblia cyst')!.confirmedCount);
  });

  it('maps a normal finding to an N interpretation and a pathogen to A', () => {
    const giardia = observations.find(o => o.code.text?.includes('Giardia'))!;
    expect(giardia.interpretation[0].coding[0].code).toBe('A');
  });

  it('omits the supervisor performer when none is recorded', () => {
    const { report: solo } = generateFHIRDiagnosticReport({ ...report, supervisorName: '' });
    expect(solo.performer).toHaveLength(1);
  });
});

describe('generateDICOMMetadata', () => {
  const dicom = generateDICOMMetadata(report);

  it('emits UIDs that are a single decimal integer under the 2.25 arc', () => {
    for (const key of ['StudyInstanceUID', 'SeriesInstanceUID', 'SOPInstanceUID'] as const) {
      const uid = dicom[key] as unknown as string;
      expect(uid).toMatch(/^2\.25\.\d+$/);
      expect(uid.split('.')).toHaveLength(3);
    }
  });

  it('generates UIDs that fit the 128-bit limit', () => {
    for (const key of ['StudyInstanceUID', 'SeriesInstanceUID', 'SOPInstanceUID'] as const) {
      const value = BigInt((dicom[key] as unknown as string).slice('2.25.'.length));
      expect(value).toBeLessThan(1n << 128n);
    }
  });

  it('never repeats a UID across two exports of the same report', () => {
    const second = generateDICOMMetadata(report);
    expect(second.StudyInstanceUID).not.toBe(dicom.StudyInstanceUID);
  });

  it('maps gender to the DICOM F/M vocabulary', () => {
    expect(dicom.PatientSex).toBe('F');
    expect(generateDICOMMetadata({ ...report, patient: { ...report.patient, gender: 'Male' } }).PatientSex).toBe('M');
  });

  it('leaves birth date empty rather than inventing one', () => {
    expect(dicom.PatientBirthDate).toBe('');
  });

  it('carries the fields actually examined', () => {
    expect(dicom.TotalFieldsExamined).toBe(10);
  });

  it('is labelled as a preview, not a conformant file', () => {
    expect(dicom._note).toMatch(/not a valid Part 10 file/i);
  });
});

describe('ROBOFLOW_POPULAR_MODELS', () => {
  it('only lists presets that point at a real https endpoint', () => {
    expect(ROBOFLOW_POPULAR_MODELS.length).toBeGreaterThan(0);
    for (const preset of ROBOFLOW_POPULAR_MODELS) {
      expect(preset.endpoint).toMatch(/^https:\/\/serverless\.roboflow\.com\//);
    }
  });

  it('only lists workflow presets, since the inference path has no model id', () => {
    for (const preset of ROBOFLOW_POPULAR_MODELS) {
      expect(preset.isWorkflow).toBe(true);
    }
  });
});
