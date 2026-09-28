import { LaboratoryReport } from '../types';

/** RFC 4122 v4 UUID, required for FHIR `urn:uuid:` identifiers. */
function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * DICOM UID under the 2.25 arc: a single decimal integer of up to 128 bits.
 * The previous form (2.25.<Date.now()>.<random>) contains a second dot and is
 * rejected by strict PACS validators.
 */
function dicomUid(): string {
  const hex = uuidv4().replace(/-/g, '');
  // Take the low 122 bits so the decimal stays inside the 2.25 arc.
  const value = BigInt(`0x${hex}`) & ((1n << 122n) - 1n);
  return `2.25.${value.toString(10)}`;
}

/**
 * FHIR R4 DiagnosticReport with the Patient resource it references.
 * Returned as a Bundle so the Observation references resolve.
 */
export function generateFHIRDiagnosticReport(report: LaboratoryReport) {
  const patientResourceId = uuidv4();

  const patientResource = {
    resourceType: "Patient",
    id: patientResourceId,
    identifier: [
      {
        system: "urn:ietf:rfc:3986",
        value: report.patient.patientNumber
      }
    ],
    name: [{ text: report.patient.fullName }],
    gender:
      report.patient.gender === 'Male'
        ? 'male'
        : report.patient.gender === 'Female'
        ? 'female'
        : 'unknown'
  };

  const fhirObservations = report.findings.map(finding => ({
    resourceType: "Observation",
    id: uuidv4(),
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "laboratory",
            display: "Laboratory"
          }
        ]
      }
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: finding.category === 'parasite' ? "10701-1" : "33214-8",
          display: finding.displayName
        }
      ],
      text: finding.displayName
    },
    subject: {
      reference: `Patient/${patientResourceId}`,
      display: report.patient.fullName
    },
    effectiveDateTime: report.sample.collectionDatetime,
    // Reports the technologist-verified count, not raw AI candidates.
    valueQuantity: {
      value: finding.confirmedCount,
      unit: "count/HPF",
      system: "http://unitsofmeasure.org",
      code: "{HPF}"
    },
    interpretation: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            code: finding.clinicalSignificance === 'normal' ? "N" : "A",
            display: finding.clinicalSignificance === 'normal' ? "Normal" : "Abnormal"
          }
        ]
      }
    ],
    note: [
      {
        text: `${finding.standardizedQuantity}. ${finding.remarks} AI candidates proposed: ${finding.count}.`
      }
    ]
  }));

  const fhirDiagnosticReport = {
    resourceType: "DiagnosticReport",
    id: uuidv4(),
    identifier: [
      {
        system: "urn:ietf:rfc:3986",
        value: `urn:uuid:${uuidv4()}`
      }
    ],
    status: report.status === 'verified' ? "final" : "preliminary",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v2-0074",
            code: "MB",
            display: "Microbiology / Pathology"
          }
        ]
      }
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: "10701-1",
          display: `${report.sample.sampleType.toUpperCase()} Microscopic Examination with AI Decision Support`
        }
      ],
      text: `${report.sample.sampleType} Microscopy Specimen Analysis`
    },
    subject: {
      reference: `Patient/${patientResourceId}`,
      display: report.patient.fullName
    },
    issued: report.generatedAt,
    performer: [
      { display: report.technologistName },
      ...(report.supervisorName ? [{ display: report.supervisorName }] : [])
    ],
    specimen: [
      {
        display: `${report.sample.slideLabel} (${report.sample.stainMethod}, ${report.sample.totalMagnification})`
      }
    ],
    result: fhirObservations.map(o => ({ reference: `Observation/${o.id}` })),
    conclusion: report.clinicalImpression
  };

  return {
    bundle: {
      resourceType: "Bundle",
      type: "collection",
      entry: [patientResource, fhirDiagnosticReport, ...fhirObservations].map(r => ({
        resource: r
      }))
    },
    report: fhirDiagnosticReport,
    observations: fhirObservations
  };
}

/**
 * DICOM attribute set for slide microscopy. This is a metadata PREVIEW, not a
 * conformant DICOM Part 10 file: real WSI archiving requires pixel data, a
 * file meta header and explicit VR encoding.
 */
export function generateDICOMMetadata(report: LaboratoryReport) {
  return {
    _note: 'DICOM attribute preview only - not a valid Part 10 file',
    SOPClassUID: "1.2.840.10008.5.1.4.1.1.77.1.6", // VL Whole Slide Microscopy Image Storage
    StudyInstanceUID: dicomUid(),
    SeriesInstanceUID: dicomUid(),
    SOPInstanceUID: dicomUid(),
    PatientID: report.patient.patientNumber,
    PatientName: report.patient.fullName,
    PatientBirthDate: "", // not collected by this build
    PatientSex:
      report.patient.gender === 'Male' ? 'M' : report.patient.gender === 'Female' ? 'F' : '',
    Modality: "SM", // Slide Microscopy
    Manufacturer: "LabSight Demonstration Build",
    SpecimenIdentifier: report.sample.slideLabel,
    SpecimenPreparationSequence: {
      StainingSubstanceItem: report.sample.stainMethod,
      ObjectiveLensMagnification: report.sample.objective,
      NominalMagnification: report.sample.totalMagnification
    },
    TotalFieldsExamined: report.sample.fieldsExamined,
    PhotometricInterpretation: "RGB",
    BitsAllocated: 8,
    BitsStored: 8,
    HighBit: 7,
    PixelRepresentation: 0,
    InstitutionName: report.laboratoryInfo.name
  };
}

/**
 * Model presets bundled with this build. Only entries with a real, reachable
 * endpoint are listed: applying a fabricated workspace id would silently
 * repoint a configured pipeline at a model that does not exist.
 */
export const ROBOFLOW_POPULAR_MODELS = [
  {
    id: "labsight-yolo26m-workflow",
    name: "LABSIGHT vlabsight-1-yolo26m-t1 Logic",
    workspace: "laurent-kashinje",
    project: "labsight-vlabsight-1-yolo26m-t1-logic",
    version: 1,
    description: "Serverless workflow bundled with this build for enteric parasite detection",
    category: "stool" as const,
    endpoint: "https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-1-yolo26m-t1-logic",
    isWorkflow: true,
    classes: [
      "Giardia lamblia cyst",
      "Entamoeba histolytica",
      "Ascaris lumbricoides ovum",
      "Hookworm egg",
      "Schistosoma mansoni ovum"
    ]
  }
];
