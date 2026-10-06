import { describe, it, expect } from 'vitest';
import {
  calculateHPFMetrics,
  getClinicalSignificance,
  formatStandardizedQuantity,
  quantifyDetections
} from './quantification';
import type { Detection } from '../types';

function detection(overrides: Partial<Detection> & { id: string; class: string }): Detection {
  return {
    confidence: 0.9,
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    confirmed: true,
    ...overrides
  };
}

describe('calculateHPFMetrics', () => {
  it('uses the correct reporting unit per objective', () => {
    expect(calculateHPFMetrics('10x').standardizedReportingUnit).toMatch(/LPF/);
    expect(calculateHPFMetrics('40x').standardizedReportingUnit).toMatch(/HPF/);
    expect(calculateHPFMetrics('100x_oil').standardizedReportingUnit).toMatch(/OIF/);
  });

  it('scales field diameter inversely with magnification', () => {
    const low = calculateHPFMetrics('10x');
    const high = calculateHPFMetrics('100x_oil');
    expect(high.fieldDiameterMm).toBeCloseTo(low.fieldDiameterMm / 10, 5);
  });

  it('reports total area examined as field area times field count', () => {
    const single = calculateHPFMetrics('40x', 1);
    const ten = calculateHPFMetrics('40x', 10);
    expect(ten.totalAreaExaminedMm2).toBeCloseTo(single.totalAreaExaminedMm2 * 10, 3);
  });

  it('matches the closed-form area for FN 20 at 40x', () => {
    // diameter 0.5 mm -> area = pi * 0.25^2 = 0.19635 mm^2
    const result = calculateHPFMetrics('40x', 1);
    expect(result.fieldDiameterMm).toBe(0.5);
    expect(result.fieldAreaMm2).toBeCloseTo(Math.PI * 0.25 * 0.25, 4);
  });
});

describe('getClinicalSignificance', () => {
  it('escalates frank pathogens from pathological to critical', () => {
    expect(getClinicalSignificance('Giardia lamblia cyst', 1)).toBe('pathological');
    expect(getClinicalSignificance('Giardia lamblia cyst', 3)).toBe('pathological');
    expect(getClinicalSignificance('Giardia lamblia cyst', 4)).toBe('critical');
  });

  it('grades the additional helminth targets as frank pathogens', () => {
    expect(getClinicalSignificance('Schistosoma haematobium', 1)).toBe('pathological');
    expect(getClinicalSignificance('Schistosoma haematobium', 4)).toBe('critical');
    expect(getClinicalSignificance('Enterobius vermicularis', 1)).toBe('pathological');
    expect(getClinicalSignificance('Enterobius vermicularis', 4)).toBe('critical');
    expect(getClinicalSignificance('Trichuris trichiura', 1)).toBe('pathological');
  });

  it('is case insensitive', () => {
    expect(getClinicalSignificance('HOOKWORM EGG', 10)).toBe('critical');
  });

  it('grades pus cells on the CLSI scale', () => {
    expect(getClinicalSignificance('Pus cell', 0)).toBe('normal');
    expect(getClinicalSignificance('Pus cell', 5)).toBe('pathological');
    expect(getClinicalSignificance('Pus cell', 11)).toBe('critical');
  });

  it('classifies any count of 1 or above as pathological', () => {
    expect(getClinicalSignificance('Pus cell', 1)).toBe('pathological');
    expect(getClinicalSignificance('Pus cell', 3)).toBe('pathological');
    expect(getClinicalSignificance('Erythrocyte (RBC)', 1)).toBe('pathological');
    expect(getClinicalSignificance('Erythrocyte (RBC)', 5)).toBe('pathological');
    expect(getClinicalSignificance('Calcium oxalate dihydrate', 1)).toBe('pathological');
    expect(getClinicalSignificance('Phosphate amorphous', 1)).toBe('pathological');
  });

  it('keeps a zero count normal for cellular elements and crystals', () => {
    expect(getClinicalSignificance('Erythrocyte (RBC)', 0)).toBe('normal');
    expect(getClinicalSignificance('Calcium oxalate dihydrate', 0)).toBe('normal');
    expect(getClinicalSignificance('Phosphate amorphous', 0)).toBe('normal');
  });

  it('treats unknown classes with zero count as normal, and count >= 1 as pathological', () => {
    expect(getClinicalSignificance('Debris artifact', 0)).toBe('normal');
    expect(getClinicalSignificance('Debris artifact', 1)).toBe('pathological');
  });
});

describe('formatStandardizedQuantity', () => {
  it('denominates parasite counts by the fields actually examined', () => {
    expect(formatStandardizedQuantity('Giardia lamblia cyst', 3, 10)).toBe('3 / 10 HPFs (Moderate 2+)');
    expect(formatStandardizedQuantity('Giardia lamblia cyst', 3, 25)).toBe('3 / 25 HPFs (Moderate 2+)');
  });

  it('never divides by zero when no fields were examined', () => {
    expect(() => formatStandardizedQuantity('Pus cell', 5, 0)).not.toThrow();
    expect(formatStandardizedQuantity('Pus cell', 5, 0)).toMatch(/HPF/);
  });

  it('averages per field for cellular elements', () => {
    // 20 cells over 10 fields is 2/HPF, not a markedly elevated result.
    expect(formatStandardizedQuantity('Leukocyte', 20, 10)).toBe('1 - 3 / HPF (Occasional)');
    expect(formatStandardizedQuantity('Leukocyte', 200, 10)).toBe('> 10 / HPF (Markedly elevated)');
    expect(formatStandardizedQuantity('Leukocyte', 2, 10)).toBe('< 1 / HPF (Rare)');
  });

  it('gradelines change with the field denominator for the same count', () => {
    // The same 10 cells are far more significant when found in 2 fields than in 100.
    const concentrated = formatStandardizedQuantity('Leukocyte', 10, 2);
    const diluted = formatStandardizedQuantity('Leukocyte', 10, 100);
    expect(concentrated).toBe('4 - 10 / HPF (Moderate)');
    expect(diluted).toBe('< 1 / HPF (Rare)');
  });

  it('reports a zero count as not detected', () => {
    expect(formatStandardizedQuantity('Hookworm egg', 0, 10)).toBe('Not Detected');
  });

  it('grades the additional helminth ova by burden', () => {
    expect(formatStandardizedQuantity('Enterobius vermicularis', 1, 10)).toBe('1 / 10 HPFs (Low burden)');
    expect(formatStandardizedQuantity('Schistosoma haematobium', 3, 10)).toBe('3 / 10 HPFs (Moderate burden)');
    expect(formatStandardizedQuantity('Trichuris trichiura', 7, 10)).toBe('7 / 10 HPFs (Heavy burden)');
  });
});

describe('quantifyDetections', () => {
  it('excludes rejected detections entirely', () => {
    const findings = quantifyDetections(
      [
        detection({ id: 'a', class: 'Giardia lamblia cyst', confirmed: true }),
        detection({ id: 'b', class: 'Giardia lamblia cyst', confirmed: false, rejected: true })
      ],
      10
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].count).toBe(1);
    expect(findings[0].confirmedCount).toBe(1);
  });

  it('keeps unconfirmed candidates in the count but not the confirmed count', () => {
    const findings = quantifyDetections(
      [
        detection({ id: 'a', class: 'Pus cell', confirmed: true }),
        detection({ id: 'b', class: 'Pus cell', confirmed: true }),
        detection({ id: 'c', class: 'Pus cell', confirmed: false })
      ],
      10
    );
    expect(findings[0].count).toBe(3);
    expect(findings[0].confirmedCount).toBe(2);
  });

  it('produces stable ids across repeated quantification', () => {
    const dets = [
      detection({ id: 'a', class: 'Ascaris lumbricoides ovum' }),
      detection({ id: 'b', class: 'Ascaris lumbricoides ovum' })
    ];
    const first = quantifyDetections(dets, 10);
    const second = quantifyDetections(dets, 10);
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id).toBe('qf-ascaris-lumbricoides-ovum');
  });

  it('does not mutate its input', () => {
    const dets = [detection({ id: 'a', class: 'Hookworm egg', rejected: true })];
    const snapshot = JSON.stringify(dets);
    quantifyDetections(dets, 10);
    expect(JSON.stringify(dets)).toBe(snapshot);
  });

  it('returns no findings when everything was rejected', () => {
    expect(quantifyDetections([detection({ id: 'a', class: 'Hookworm egg', rejected: true })], 10)).toEqual([]);
  });

  it('averages confidence across the surviving detections', () => {
    const findings = quantifyDetections(
      [
        detection({ id: 'a', class: 'Giardia lamblia cyst', confidence: 0.5 }),
        detection({ id: 'b', class: 'Giardia lamblia cyst', confidence: 0.9 })
      ],
      10
    );
    expect(findings[0].averageConfidence).toBeCloseTo(0.7, 5);
  });

  it('classifies findings into the right category', () => {
    const findings = quantifyDetections(
      [
        detection({ id: 'a', class: 'Erythrocyte (RBC)' }),
        detection({ id: 'b', class: 'Pus cell (Leukocyte)' }),
        detection({ id: 'c', class: 'Calcium oxalate dihydrate' }),
        detection({ id: 'd', class: 'Hookworm egg' })
      ],
      10
    );
    const byName = Object.fromEntries(findings.map(f => [f.name, f.category]));
    expect(byName['Erythrocyte (RBC)']).toBe('hematology');
    expect(byName['Pus cell (Leukocyte)']).toBe('cytology');
    expect(byName['Calcium oxalate dihydrate']).toBe('crystal');
    expect(byName['Hookworm egg']).toBe('parasite');
  });

  it('returns a stable ordering for identical input', () => {
    const dets = [
      detection({ id: '1', class: 'Hookworm egg' }),
      detection({ id: '2', class: 'Erythrocyte (RBC)' })
    ];
    expect(quantifyDetections(dets, 10).map(f => f.name)).toEqual(
      quantifyDetections(dets, 10).map(f => f.name)
    );
  });
});
