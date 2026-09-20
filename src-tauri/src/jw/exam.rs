// 考表 HTML 解析（对应 fzu-proxy.mjs 的 parseExamSchedule / parseExamList）。
use std::sync::OnceLock;

use regex::Regex;
use serde::Serialize;

use crate::jw::course::clean_inline;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamItem {
    pub name: String,
    pub date: String,
    pub time: String,
    pub location: String,
    pub seat: String,
    #[serde(rename = "type")]
    pub exam_type: String,
    pub teacher: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub raw: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamTable {
    pub exams: Vec<ExamItem>,
}

fn re(pattern: &str) -> &'static Regex {
    static RE_DATE: OnceLock<Regex> = OnceLock::new();
    static RE_TIME: OnceLock<Regex> = OnceLock::new();
    static RE_DATE_PARTS: OnceLock<Regex> = OnceLock::new();
    static RE_TABLE: OnceLock<Regex> = OnceLock::new();
    static RE_ROW: OnceLock<Regex> = OnceLock::new();
    static RE_TD: OnceLock<Regex> = OnceLock::new();

    match pattern {
        "date" => RE_DATE.get_or_init(|| {
            Regex::new(r"\d{4}[年]?(\d{1,2})[月](\d{1,2})日|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}").unwrap()
        }),
        "time" => RE_TIME
            .get_or_init(|| Regex::new(r"\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}").unwrap()),
        "date_parts" => RE_DATE_PARTS
            .get_or_init(|| Regex::new(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})").unwrap()),
        "table" => RE_TABLE.get_or_init(|| {
            Regex::new(r#"(?is)<table\s+id=["']ContentPlaceHolder1_DataList_xxk["'][^>]*>(.*?)</table>"#)
                .unwrap()
        }),
        "row" => RE_ROW
            .get_or_init(|| Regex::new(r"(?is)<tr\b[^>]*height:30px[^>]*>(.*?)</tr>").unwrap()),
        "td" => RE_TD.get_or_init(|| Regex::new(r"(?is)<td\b[^>]*>(.*?)</td>").unwrap()),
        _ => unreachable!("unknown regex key"),
    }
}

// 从"考试时间地点"单元格提取 日期/时间/地点 三元组
fn parse_exam_schedule(value: &str) -> (String, String, String) {
    let text = clean_inline(value);

    let Some(date_text) = re("date").find(&text).map(|m| m.as_str().to_string()) else {
        return (String::new(), String::new(), String::new());
    };

    // 原文中匹配到的时间串（形如 "08:30 - 10:30"）需保留原样用于从地点中剔除；
    // 输出给前端的时间则去掉空白。
    let time_raw = re("time").find(&text).map(|m| m.as_str().to_string());
    let time = time_raw
        .as_deref()
        .map(|t| t.split_whitespace().collect::<String>())
        .unwrap_or_default();

    let normalized = date_text
        .replace('年', "-")
        .replace('月', "-")
        .replace('日', "");
    let Some(parts) = re("date_parts").captures(&normalized) else {
        return (String::new(), String::new(), String::new());
    };
    let year = &parts[1];
    let month: u32 = parts[2].parse().unwrap_or(0);
    let day: u32 = parts[3].parse().unwrap_or(0);
    let date = format!("{}-{:02}-{:02}", year, month, day);

    let mut location = text.replacen(&date_text, "", 1);
    if let Some(raw) = time_raw.as_deref().filter(|t| !t.is_empty()) {
        location = location.replacen(raw, "", 1);
    }
    let location = location.trim().to_string();

    (date, time, location)
}

// 解析考表 HTML，返回考试列表
pub fn parse_exam_list(html: &str) -> ExamTable {
    let table = re("table")
        .captures(html)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str())
        .unwrap_or("");

    let mut exams = Vec::new();
    for row in re("row").captures_iter(table) {
        let row_html = &row[1];
        let cells: Vec<String> = re("td")
            .captures_iter(row_html)
            .map(|caps| clean_inline(&caps[1]))
            .collect();
        if cells.len() < 5 || cells[0].contains("课程名称") {
            continue;
        }
        let schedule = parse_exam_schedule(cells.get(3).map(String::as_str).unwrap_or(""));
        if schedule.0.is_empty() {
            continue;
        }
        exams.push(ExamItem {
            name: if cells[0].is_empty() {
                "未命名考试".to_string()
            } else {
                cells[0].clone()
            },
            date: schedule.0,
            time: schedule.1,
            location: schedule.2,
            seat: cells.get(4).cloned().unwrap_or_default(),
            exam_type: String::new(),
            teacher: cells.get(2).cloned().unwrap_or_default(),
            raw: cells,
        });
    }

    ExamTable { exams }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_exam_schedule() {
        let (date, time, location) = parse_exam_schedule("2024年1月3日 08:30 - 10:30 文1-201");
        assert_eq!(date, "2024-01-03");
        assert_eq!(time, "08:30-10:30");
        assert_eq!(location, "文1-201");
    }

    #[test]
    fn returns_empty_for_missing_date() {
        let (date, time, location) = parse_exam_schedule("文1-201");
        assert!(date.is_empty());
        assert!(time.is_empty());
        assert!(location.is_empty());
    }
}
