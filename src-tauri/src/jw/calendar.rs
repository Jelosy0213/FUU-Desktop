// 教务处"当前教学周"(week.asp) 与"校历"(xl.asp) 解析（对应 fzu-proxy.mjs 的
// parseLocateDate / parseSchoolCalendar）。
use std::sync::OnceLock;

use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct LocateDate {
    pub week: i32,
    pub year: String,
    pub term: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolTerm {
    pub term: String,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolCalendar {
    pub current_term: String,
    pub terms: Vec<SchoolTerm>,
}

fn locate_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"var week = "([0-9]+)";\s*[\s\S]*?var xn = "([0-9]{4})";\s*[\s\S]*?var xq = "([0-9]{2})";"#)
            .unwrap()
    })
}

fn option_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)<option[^>]*value\s*=\s*['"]?(\d{22})['"]?[^>]*>"#).unwrap())
}

fn current_term_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"当前学期[：:]\s*(\d{6})").unwrap())
}

// 解析 week.asp：var week = "12"; var xn = "2026"; var xq = "01";
pub fn parse_locate_date(text: &str) -> Option<LocateDate> {
    let caps = locate_re().captures(text)?;
    Some(LocateDate {
        week: caps[1].parse().ok()?,
        year: caps[2].to_string(),
        term: caps[3].to_string(),
    })
}

// 解析 xl.asp 校历：option value 编码学期起止日期，形如 2024012024082620250117
//  [0:6] 学期ID [6:14] 开始日期 [14:22] 结束日期
pub fn parse_school_calendar(text: &str) -> SchoolCalendar {
    let option_values: Vec<&str> = option_re()
        .captures_iter(text)
        .map(|caps| caps.get(1).unwrap().as_str())
        .collect();

    let terms: Vec<SchoolTerm> = option_values
        .iter()
        .map(|raw| SchoolTerm {
            term: raw[0..6].to_string(),
            start_date: format!("{}-{}-{}", &raw[6..10], &raw[10..12], &raw[12..14]),
            end_date: format!("{}-{}-{}", &raw[14..18], &raw[18..20], &raw[20..22]),
        })
        .collect();

    let current_term = current_term_re()
        .captures(text)
        .map(|caps| caps[1].to_string())
        .or_else(|| option_values.first().map(|raw| raw[0..6].to_string()))
        .unwrap_or_default();

    SchoolCalendar {
        current_term,
        terms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_locate_date() {
        let text = r#"var week = "12"; var xn = "2026"; var xq = "01";"#;
        let located = parse_locate_date(text).unwrap();
        assert_eq!(located.week, 12);
        assert_eq!(located.year, "2026");
        assert_eq!(located.term, "01");
    }

    #[test]
    fn parses_school_calendar() {
        let text = r#"<option value=2024012024082620250117>2024-2025-1</option>
        <option value="2025022025022320250705">2024-2025-2</option>"#;
        let calendar = parse_school_calendar(text);
        assert_eq!(calendar.terms.len(), 2);
        assert_eq!(calendar.current_term, "202401");
        assert_eq!(calendar.terms[0].start_date, "2024-08-26");
        assert_eq!(calendar.terms[0].end_date, "2025-01-17");
    }
}
