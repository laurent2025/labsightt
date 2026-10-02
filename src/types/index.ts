export type SampleType = 'stool' | 'blood' | 'urine' | 'csf' | 'other';

export type MicroscopeObjective = '10x' | '40x' | '100x_oil';
export type EyepieceMagnification = '10x' | '15x';

export interface Patient {
  id: string;
  patientNumber: string; // e.g. PT-2026-00021
  fullName: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  referringDoctor: string;
  referringFacility: string;
  clinicalNotes?: string;
  /**
   * Specimen types for this patient, derived from their samples on the server.
   *
   * This used to be a single `sampleType` on the patient row. There is no such
   * column: the type belongs to a sample, a patient can have several specimens,
   * and the server was never sending the field. Anything reading it got
   * `undefined`, which silently emptied the specimen filter. It is a list, and
   * it is empty for a patient with no specimen accessioned yet.
   */
  sampleTypes: SampleType[];
  /** Earliest accessioned specimen, for a single-line label. Null if none. */
  primarySampleType: SampleType | null;
  /** Earliest specimen collection time, ISO 8601. Null if none. */
  collectionDatetime: string | null;
  sampleCount: number;
  createdAt: string;
}

/**
 * What a new accession actually sends. Excludes `id`, `createdAt`, and the
 * specimen fields, because those are derived by the server from the accompanying
 * sample rather than supplied by the operator.
 */
export type NewPatient = Pick<
  Patient,
  | 'patientNumber'
  | 'fullName'
  | 'age'
  | 'gender'
  | 'referringDoctor'
  | 'referringFacility'
  | 'clinicalNotes'
>;

export interface Sample {
  id: string;
  patientId: string;
  sampleType: SampleType;
  collectionDatetime: string;
  objective: MicroscopeObjective;
  eyepiece: EyepieceMagnification;
  totalMagnification: string; // e.g. "400x", "1000x"
  fieldsExamined: number; // e.g. 10 HPFs
  currentField?: number; // current field of view (e.g. 3 of 10)
  fieldAreaMm2: number;
  imageUrl: string;
  thumbnailUrl?: string;
  stainMethod: string; // e.g., "Lugol's Iodine", "Giemsa Thin Smear", "Unstained Wet Mount"
  slideLabel: string;
  opticalMode?: 'brightfield' | 'phase_contrast' | 'darkfield' | 'fluorescence';
  notes?: string;
}

export interface Detection {
  id: string;
  class: string;
  confidence: number; // 0 to 1
  x: number; // center x coordinate in pixel space
  y: number; // center y coordinate in pixel space
  width: number; // box width in pixel space
  height: number; // box height in pixel space
  confirmed: boolean;
  rejected?: boolean;
  manual?: boolean;
  note?: string;
}

export interface QuantifiedFinding {
  id: string;
  name: string;
  displayName: string;
  category: 'parasite' | 'hematology' | 'cytology' | 'crystal' | 'microorganism';
  count: number;
  confirmedCount: number;
  averageConfidence: number;
  standardizedQuantity: string; // e.g. "3 / 10 HPF (Moderate 2+)", "Rare (1-2 / HPF)"
  clinicalSignificance: 'normal' | 'low_grade' | 'pathological' | 'critical';
  remarks: string;
}

export type AnalysisStatus = 'processing' | 'in_review' | 'confirmed' | 'verified';

export interface Analysis {
  id: string;
  sampleId: string;
  patientId: string;
  modelId: string;
  modelName: string;
  status: AnalysisStatus;
  detections: Detection[];
  findings: QuantifiedFinding[];
  totalDetections: number;
  technologistNotes: string;
  clinicalImpression: string;
  analyzedAt: string;
  /** Auth user id that initiated the run; the server records it on creation. */
  initiatedBy?: string | null;
  reviewedAt?: string;
  reviewedBy?: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface LaboratoryReport {
  id: string;
  reportNumber: string; // e.g. "RPT-2026-0842"
  analysisId: string;
  patient: Patient;
  sample: Sample;
  findings: QuantifiedFinding[];
  technologistNotes: string;
  clinicalImpression: string;
  technologistName: string;
  technologistId: string;
  supervisorName: string;
  status: 'draft' | 'pending_verification' | 'verified' | 'released';
  generatedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  laboratoryInfo: {
    name: string;
    licenseNumber: string;
    accreditation: string;
    address: string;
    contact: string;
    director: string;
  };
}

export interface AIModelConfig {
  id: string;
  name: string;
  category: SampleType;
  architecture: string;
  version: string;
  endpoint: string;
  roboflowWorkspace?: string;
  roboflowWorkflowId?: string;
  isWorkflow?: boolean;
  roboflowModel: string;
  roboflowVersion: string;
  confidenceThreshold: number; // 0.10 to 0.95
  iouThreshold: number;
  active: boolean;
  classes: string[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
}

export interface RoboflowDetectionResult {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
}

export interface RoboflowAPIResponse {
  predictions: RoboflowDetectionResult[];
  image: {
    width: number;
    height: number;
  };
}
