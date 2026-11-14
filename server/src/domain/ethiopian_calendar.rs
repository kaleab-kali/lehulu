//! Ethiopian calendar (Amete Mihret). Same algorithm as web/src/lib/ethiopian-calendar.ts.
//! 13 months: 12 × 30 days + Pagume (5 days, 6 in the year before a Gregorian leap year: y % 4 == 3).

const ETHIOPIC_EPOCH_JDN: i64 = 1_724_221;

pub fn days_in_month(year: i32, month: u32) -> u32 {
    if month < 13 {
        30
    } else if year.rem_euclid(4) == 3 {
        6
    } else {
        5
    }
}

pub fn is_valid(year: i32, month: u32, day: u32) -> bool {
    (1..=13).contains(&month)
        && day >= 1
        && day <= days_in_month(year, month)
        && (1900..=2100).contains(&year)
}

pub fn to_jdn(year: i32, month: u32, day: u32) -> i64 {
    let y = year as i64;
    ETHIOPIC_EPOCH_JDN + 365 * (y - 1) + y.div_euclid(4) + 30 * (month as i64 - 1) + day as i64 - 1
}

/// Returns (year, month, day) in the Gregorian calendar.
pub fn jdn_to_gregorian(jdn: i64) -> (i32, u32, u32) {
    let a = jdn + 32044;
    let b = (4 * a + 3) / 146097;
    let c = a - 146097 * b / 4;
    let d = (4 * c + 3) / 1461;
    let e = c - 1461 * d / 4;
    let m = (5 * e + 2) / 153;
    let day = e - (153 * m + 2) / 5 + 1;
    let month = m + 3 - 12 * (m / 10);
    let year = 100 * b + d - 4800 + m / 10;
    (year as i32, month as u32, day as u32)
}

pub fn to_gregorian(year: i32, month: u32, day: u32) -> (i32, u32, u32) {
    jdn_to_gregorian(to_jdn(year, month, day))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hackathon_test_vector() {
        // From the hackathon site: 14 Nov 2026 = ኅዳር 5, 2019
        assert_eq!(to_gregorian(2019, 3, 5), (2026, 11, 14));
    }

    #[test]
    fn new_year_and_pagume() {
        assert_eq!(to_gregorian(2019, 1, 1), (2026, 9, 11));
        assert_eq!(days_in_month(2015, 13), 6); // 2015 % 4 == 3
        assert_eq!(days_in_month(2016, 13), 5);
        assert!(!is_valid(2016, 13, 6));
        assert!(is_valid(2015, 13, 6));
        assert!(!is_valid(2016, 14, 1));
    }
}
