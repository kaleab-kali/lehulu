//! Validation rules shared in spirit with web/src/engine/validators.ts. Messages are plain and say how to fix.

use crate::error::ApiError;

/// Accepts 09…, 07…, +2519…, 2519… with spaces or dashes. Returns the number as 0XXXXXXXXX.
pub fn et_phone(input: &str) -> Result<String, ApiError> {
    let digits: String = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect();
    let digits = digits.trim_start_matches('+');
    let local = if let Some(rest) = digits.strip_prefix("251") {
        format!("0{rest}")
    } else if digits.len() == 9 {
        format!("0{digits}")
    } else {
        digits.to_string()
    };
    let ok = local.len() == 10
        && local.chars().all(|c| c.is_ascii_digit())
        && (local.starts_with("09") || local.starts_with("07"));
    if ok {
        Ok(local)
    } else {
        Err(ApiError::invalid(
            "phone_invalid",
            "phone",
            "Enter 10 digits that start with 09 or 07, for example 0911 234 567.",
        ))
    }
}

pub fn required(value: &str, field: &'static str, message: &str) -> Result<(), ApiError> {
    if value.trim().is_empty() {
        Err(ApiError::invalid("required", field, message))
    } else {
        Ok(())
    }
}

pub fn one_of(
    value: &str,
    allowed: &[&str],
    field: &'static str,
    message: &str,
) -> Result<(), ApiError> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(ApiError::invalid("not_allowed", field, message))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phone_formats() {
        assert_eq!(et_phone("0911 234 567").unwrap(), "0911234567");
        assert_eq!(et_phone("+251 911-234-567").unwrap(), "0911234567");
        assert_eq!(et_phone("0712345678").unwrap(), "0712345678");
        assert!(et_phone("12345").is_err());
        assert!(et_phone("0811234567").is_err());
    }
}
