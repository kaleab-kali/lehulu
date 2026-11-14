import { describe, expect, it } from 'vitest';
import { daysInMonth, isValid, toGregorian } from '../../src/lib/ethiopian-calendar';

describe('Ethiopian calendar', () => {
  it('matches the hackathon test vector: 14 Nov 2026 = ኅዳር 5, 2019', () => {
    expect(toGregorian(2019, 3, 5)).toEqual({ y: 2026, m: 11, d: 14 });
  });
  it('handles Meskerem 1 and Pagume', () => {
    expect(toGregorian(2019, 1, 1)).toEqual({ y: 2026, m: 9, d: 11 });
    expect(daysInMonth(2015, 13)).toBe(6);
    expect(daysInMonth(2016, 13)).toBe(5);
    expect(isValid(2016, 13, 6)).toBe(false);
  });
});
