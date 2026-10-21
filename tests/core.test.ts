import { describe, expect, it } from 'vitest';
import { formatNum } from '../src/core/format';
import { dreadPayout, infamy, offlineFactor } from '../src/core/economy';
import { newSave } from '../src/core/types';
import type { DeptDef } from '../src/core/dept';

describe('formatNum', () => {
  it('formats with 3 significant figures and suffixes', () => {
    expect(formatNum(999)).toBe('999');
    expect(formatNum(1234)).toBe('1.23K');
    expect(formatNum(45_600_000)).toBe('45.6M');
    expect(formatNum(789e9)).toBe('789B');
    expect(formatNum(1e12)).toBe('1.00T');
    expect(formatNum(1e15)).toBe('1.00aa');
    expect(formatNum(1e18)).toBe('1.00ab');
    expect(formatNum(1234, 'sci')).toBe('1.23e3');
  });
});

const def = {
  skillTarget: (n: number) => Math.min(4 + n, 10),
  econBase: 1e6,
} as unknown as DeptDef;

function dept(heldLevel: number, earnings: number, n = 0, falls = 0) {
  return {
    cycle: { n, startedAt: 0, earnings, heldLevel, legendWaiting: false },
    lifetime: { peakRank: 0, falls, best: {} },
  } as any;
}

describe('infamy', () => {
  it('is the lower of the two gates', () => {
    expect(infamy(def, dept(2, 1e6)).value).toBe(50);
    expect(infamy(def, dept(4, 1e3)).value).toBeCloseTo(50);
  });
  it('overflows to 200 once the next Fall is already met', () => {
    expect(infamy(def, dept(4, 1e6)).value).toBe(100);
    expect(infamy(def, dept(5, 3e6)).value).toBeCloseTo(200);
  });
});

describe('dread payout', () => {
  it('matches the spec examples', () => {
    expect(dreadPayout(dept(0, 0), 100, 0)).toBe(20);
    expect(dreadPayout(dept(0, 0), 200, 0)).toBe(56);
    expect(dreadPayout(dept(0, 0, 2, 2), 120, 0)).toBe(26);
  });
});

describe('offline factor', () => {
  it('caps at 0.9', () => {
    const s = newSave(0);
    expect(offlineFactor(s)).toBe(0.6);
    s.meta.dreadPerks['empire.idleHands'] = 20;
    expect(offlineFactor(s)).toBe(0.9);
  });
});

describe('formatNum small values', () => {
  it('keeps small rates visible', () => {
    expect(formatNum(0.0083)).toBe('0.0083');
    expect(formatNum(0.05)).toBe('0.05');
    expect(formatNum(0.5)).toBe('0.5');
    expect(formatNum(0)).toBe('0');
  });
});
