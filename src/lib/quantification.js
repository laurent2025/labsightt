/**
 * Detection quantification and standardization.
 *
 * This is plain JavaScript with a sibling `quantification.d.ts`, so the exact
 * same implementation is consumed by the Vite/TypeScript client and by the
 * Node API server. Duplicating this logic would let the server and the client
 * drift, and the server's report numbers must match what the operator saw.
 *
 * Nothing here invents a result: every value is derived from the detections
 * that were actually adjudicated.
 */

/**
 * Field of view and examined area for a microscope objective, using the
 * standard field number 20 (FN 20).
 */
export function calculateHPFMetrics(objective, fieldsExamined = 10, fieldNumber = 20) {
  let mag = 40;
  if (objective === '10x') mag = 10;
  if (objective === '40x') mag = 40;
  if (objective === '100x_oil') mag = 100;

  const fieldDiameterMm = fieldNumber / mag;
  const radius = fieldDiameterMm / 2;
  const fieldAreaMm2 = Math.PI * radius * radius;
  const totalAreaExaminedMm2 = fieldAreaMm2 * fieldsExamined;

  let unit = 'HPF';
  if (objective === '10x') unit = 'LPF (Low Power Field)';
  if (objective === '40x') unit = 'HPF (High Power Field)';
  if (objective === '100x_oil') unit = 'OIF (Oil Immersion Field)';

  return {
    fieldDiameterMm: Number(fieldDiameterMm.toFixed(3)),
    fieldAreaMm2: Number(fieldAreaMm2.toFixed(4)),
    totalAreaExaminedMm2: Number(totalAreaExaminedMm2.toFixed(4)),
    standardizedReportingUnit: unit
  };
}

/**
 * Clinical significance banding by organism class and count.
 *
 * These thresholds are a starting point for review, not validated criteria.
 * They are applied identically on the client and the server so a report can
 * never disagree with what the operator saw on screen.
 */
export function getClinicalSignificance(className, count) {
  const lower = String(className).toLowerCase();

  // Frank pathogens.
  if (
    lower.includes('giardia') ||
    lower.includes('entamoeba') ||
    lower.includes('hookworm') ||
    lower.includes('ascaris') ||
    lower.includes('schistosoma') ||
    lower.includes('trichuris') ||
    lower.includes('plasmodium')
  ) {
    return count > 3 ? 'critical' : 'pathological';
  }

  if (lower.includes('pus') || lower.includes('leukocyte') || lower.includes('wbc')) {
    if (count > 10) return 'critical';
    if (count >= 1) return 'pathological';
    return 'normal';
  }

  if (lower.includes('erythrocyte') || lower.includes('rbc')) {
    if (count >= 1) return 'pathological';
    return 'normal';
  }

  if (lower.includes('crystal') || lower.includes('oxalate') || lower.includes('phosphate')) {
    if (count >= 1) return 'pathological';
    return 'normal';
  }

  return count >= 1 ? 'pathological' : 'normal';
}

/**
 * Standardized reporting string (WHO-style grading for parasitology, CLSI-style
 * bands for cellular elements in urinalysis).
 */
export function formatStandardizedQuantity(className, count, fieldsExamined = 10) {
  // Guards a division by zero when a specimen records no fields examined.
  const avgPerField = count / Math.max(1, fieldsExamined);
  const lower = String(className).toLowerCase();

  if (lower.includes('giardia') || lower.includes('entamoeba') || lower.includes('parasite')) {
    if (count === 0) return 'Not Detected';
    if (count <= 2) return `${count} / ${fieldsExamined} HPFs (Rare 1+)`;
    if (count <= 6) return `${count} / ${fieldsExamined} HPFs (Moderate 2+)`;
    return `${count} / ${fieldsExamined} HPFs (Abundant 3+)`;
  }

  if (lower.includes('egg') || lower.includes('ovum') || lower.includes('hookworm') || lower.includes('ascaris')) {
    if (count === 0) return 'Not Detected';
    if (count === 1) return `1 / ${fieldsExamined} HPFs (Low burden)`;
    if (count <= 4) return `${count} / ${fieldsExamined} HPFs (Moderate burden)`;
    return `${count} / ${fieldsExamined} HPFs (Heavy burden)`;
  }

  if (lower.includes('pus') || lower.includes('leukocyte') || lower.includes('rbc')) {
    if (avgPerField < 1) return '< 1 / HPF (Rare)';
    if (avgPerField <= 3) return '1 - 3 / HPF (Occasional)';
    if (avgPerField <= 10) return '4 - 10 / HPF (Moderate)';
    return '> 10 / HPF (Markedly elevated)';
  }

  return `${count} identified (${avgPerField.toFixed(1)} / HPF)`;
}

/**
 * Quantifies adjudicated detections into structured findings.
 *
 * Rejected detections are excluded entirely. `count` is the surviving
 * candidate set; `confirmedCount` is how many a person explicitly confirmed.
 * Both are reported so a reader can tell a model proposal from a human finding.
 */
export function quantifyDetections(detections, fieldsExamined = 10) {
  const groups = new Map();

  for (const det of detections) {
    if (det.rejected) continue;
    const existing = groups.get(det.class) || [];
    existing.push(det);
    groups.set(det.class, existing);
  }

  return Array.from(groups.entries()).map(([name, items]) => {
    const totalConfidence = items.reduce((acc, curr) => acc + curr.confidence, 0);
    const avgConfidence = items.length > 0 ? totalConfidence / items.length : 0;
    const confirmedCount = items.filter(d => d.confirmed).length;

    let category = 'parasite';
    const lower = name.toLowerCase();
    if (
      lower.includes('erythrocyte') ||
      lower.includes('neutrophil') ||
      lower.includes('lymphocyte') ||
      lower.includes('plasmodium')
    ) {
      category = 'hematology';
    } else if (lower.includes('epithelial') || lower.includes('pus') || lower.includes('leukocyte')) {
      category = 'cytology';
    } else if (lower.includes('crystal') || lower.includes('oxalate') || lower.includes('phosphate')) {
      category = 'crystal';
    }

    const significance = getClinicalSignificance(name, items.length);
    const quantity = formatStandardizedQuantity(name, items.length, fieldsExamined);

    let remarks = `Identified with ${Math.round(avgConfidence * 100)}% mean AI model confidence.`;
    if (significance === 'critical' || significance === 'pathological') {
      remarks += ` Diagnostic confirmation indicated.`;
    }

    return {
      // Derived from the class name so the id is stable across
      // re-quantification. A time-based id changed on every confirm/reject and
      // remounted the findings table, losing focus and selection.
      id: `qf-${lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      name,
      displayName: name,
      category,
      count: items.length,
      confirmedCount,
      averageConfidence: avgConfidence,
      standardizedQuantity: quantity,
      clinicalSignificance: significance,
      remarks
    };
  });
}
