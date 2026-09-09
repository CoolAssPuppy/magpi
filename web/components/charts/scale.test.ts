import { describe, expect, it } from 'vitest';

import { axisTicks, bandCenter, barWidth, niceCeiling, seriesPath, valueToY } from './scale';

describe('axis ceiling', () => {
  it('rounds up to a number a reader can do arithmetic with', () => {
    expect(niceCeiling(7)).toBe(10);
    expect(niceCeiling(12)).toBe(20);
    expect(niceCeiling(23)).toBe(25);
    expect(niceCeiling(140)).toBe(200);
    expect(niceCeiling(1)).toBe(1);
  });

  it('gives an all-zero series a real axis instead of a degenerate one', () => {
    expect(niceCeiling(0)).toBe(1);
    expect(niceCeiling(-5)).toBe(1);
  });
});

describe('axis ticks', () => {
  it('divides the ceiling into equal labelled steps, zero included', () => {
    expect(axisTicks(20, 4)).toEqual([0, 5, 10, 15, 20]);
    expect(axisTicks(1, 2)).toEqual([0, 0.5, 1]);
  });
});

describe('band geometry', () => {
  it('centres each band inside its share of the width', () => {
    expect(bandCenter(0, 4, 400)).toBe(50);
    expect(bandCenter(3, 4, 400)).toBe(350);
  });

  it('leaves air in the band and never exceeds the maximum thickness', () => {
    expect(barWidth(4, 400, 24)).toBe(24);
    expect(barWidth(50, 400, 24)).toBeCloseTo(6, 5);
  });

  it('keeps a bar visible however many bands there are', () => {
    expect(barWidth(1000, 400, 24)).toBeGreaterThanOrEqual(1);
  });
});

describe('value to y', () => {
  it('puts zero on the baseline and the ceiling at the top', () => {
    expect(valueToY(0, 100, 200)).toBe(200);
    expect(valueToY(100, 100, 200)).toBe(0);
    expect(valueToY(50, 100, 200)).toBe(100);
  });
});

describe('series path', () => {
  it('draws a line through every point', () => {
    expect(seriesPath([0, 50, 100], { width: 200, height: 100, ceiling: 100 })).toBe(
      'M33.33 100L100 50L166.67 0',
    );
  });

  it('breaks the line where a day has no measurement rather than inventing one', () => {
    const path = seriesPath([10, null, 30], { width: 300, height: 100, ceiling: 30 });

    expect(path.match(/M/g)).toHaveLength(2);
  });

  it('draws a lone point as a zero-length segment so it is still visible', () => {
    expect(seriesPath([null, 10, null], { width: 300, height: 100, ceiling: 10 })).toBe(
      'M150 0L150 0',
    );
  });

  it('is empty when nothing was measured', () => {
    expect(seriesPath([null, null], { width: 200, height: 100, ceiling: 1 })).toBe('');
  });
});
