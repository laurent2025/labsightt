import type { Detection, QuantifiedFinding, MicroscopeObjective } from '../types';

export interface HPFMetrics {
  fieldDiameterMm: number;
  fieldAreaMm2: number;
  totalAreaExaminedMm2: number;
  standardizedReportingUnit: string;
}

export function calculateHPFMetrics(
  objective: MicroscopeObjective,
  fieldsExamined?: number,
  fieldNumber?: number
): HPFMetrics;

export function getClinicalSignificance(
  className: string,
  count: number
): 'normal' | 'low_grade' | 'pathological' | 'critical';

export function formatStandardizedQuantity(
  className: string,
  count: number,
  fieldsExamined?: number
): string;

export function quantifyDetections(
  detections: Detection[],
  fieldsExamined?: number
): QuantifiedFinding[];
