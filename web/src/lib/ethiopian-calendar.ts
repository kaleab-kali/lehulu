// Ethiopian calendar (Amete Mihret). Same algorithm as server/src/domain/ethiopian_calendar.rs.
// 13 months: 12 × 30 days + Pagume (5 days, 6 when year % 4 === 3).

const EPOCH_JDN = 1724221;

export const MONTHS = {
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'],
} as const;

const GREGORIAN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function daysInMonth(year: number, month: number): number {
  if (month < 13) return 30;
  return ((year % 4) + 4) % 4 === 3 ? 6 : 5;
}

export function isValid(year?: number, month?: number, day?: number): boolean {
  if (!year || !month || !day) return false;
  return month >= 1 && month <= 13 && day >= 1 && day <= daysInMonth(year, month) && year >= 1900 && year <= 2100;
}

export function toJdn(year: number, month: number, day: number): number {
  return EPOCH_JDN + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day - 1;
}

export function jdnToGregorian(jdn: number): { y: number; m: number; d: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return { d: e - Math.floor((153 * m + 2) / 5) + 1, m: m + 3 - 12 * Math.floor(m / 10), y: 100 * b + d - 4800 + Math.floor(m / 10) };
}

export function toGregorian(year: number, month: number, day: number) {
  return jdnToGregorian(toJdn(year, month, day));
}

export function gregorianText(year: number, month: number, day: number): string {
  const g = toGregorian(year, month, day);
  return `${g.d} ${GREGORIAN_MONTHS[g.m - 1]} ${g.y}`;
}

/** Current Ethiopian year, used to build the year list. */
export function currentEthiopianYear(now = new Date()): number {
  // Meskerem 1 falls on 11 or 12 September.
  const y = now.getFullYear();
  const afterNewYear = now.getMonth() > 8 || (now.getMonth() === 8 && now.getDate() >= 11);
  return afterNewYear ? y - 7 : y - 8;
}
