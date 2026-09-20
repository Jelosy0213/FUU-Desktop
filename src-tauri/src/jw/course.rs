// 课表 HTML 结构化解析（对应 server/course-parser.mjs）。
// 输入：课表页面的完整 HTML 文本。
// 输出：{ periods, courses }（节次时段表 + 课程列表）。
use std::sync::OnceLock;

use regex::{Captures, Regex};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoursePeriod {
    pub number: i32,
    pub time: String,
    pub segment: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseItem {
    pub name: String,
    pub teacher: String,
    pub location: String,
    pub weeks: String,
    pub day: i32,
    pub start: i32,
    pub end: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub single: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub double: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseTable {
    pub periods: Vec<CoursePeriod>,
    pub courses: Vec<CourseItem>,
}

fn re(pattern: &str) -> &'static Regex {
    static RE_BR: OnceLock<Regex> = OnceLock::new();
    static RE_TAG: OnceLock<Regex> = OnceLock::new();
    static RE_ENTITY: OnceLock<Regex> = OnceLock::new();
    static RE_LINK_BLOCK: OnceLock<Regex> = OnceLock::new();
    static RE_BRACKET: OnceLock<Regex> = OnceLock::new();
    static RE_WEEK_RANGE: OnceLock<Regex> = OnceLock::new();
    static RE_CONTAINER: OnceLock<Regex> = OnceLock::new();
    static RE_TR: OnceLock<Regex> = OnceLock::new();
    static RE_TD: OnceLock<Regex> = OnceLock::new();
    static RE_PERIOD: OnceLock<Regex> = OnceLock::new();
    static RE_ROWSPAN: OnceLock<Regex> = OnceLock::new();
    static RE_FONT: OnceLock<Regex> = OnceLock::new();
    static RE_WEEK_EXACT: OnceLock<Regex> = OnceLock::new();

    match pattern {
        "br" => RE_BR.get_or_init(|| Regex::new(r"(?i)<br\s*/?>").unwrap()),
        "tag" => RE_TAG.get_or_init(|| Regex::new(r"<[^>]+>").unwrap()),
        "entity" => RE_ENTITY.get_or_init(|| Regex::new(r"&#(\d+);").unwrap()),
        "link_block" => RE_LINK_BLOCK.get_or_init(|| Regex::new(r"(?s)\[.*?</a>.*?\]").unwrap()),
        "bracket" => RE_BRACKET.get_or_init(|| Regex::new(r"\[([^\]]*)\]").unwrap()),
        "week_range" => RE_WEEK_RANGE
            .get_or_init(|| Regex::new(r"(\d{1,2})\s*[-—~－]\s*(\d{1,2})").unwrap()),
        "container" => RE_CONTAINER.get_or_init(|| {
            Regex::new(r#"(?is)<span\s+id="ContentPlaceHolder1_LB_kb"[^>]*>(.*?)</span>"#).unwrap()
        }),
        "tr" => RE_TR.get_or_init(|| Regex::new(r"(?is)<tr\b[^>]*>(.*?)</tr>").unwrap()),
        "td" => RE_TD.get_or_init(|| Regex::new(r"(?is)<td\b([^>]*)>(.*?)</td>").unwrap()),
        "period" => RE_PERIOD
            .get_or_init(|| Regex::new(r"(\d{1,2})\s+([\d:]{4,5})-([\d:]{4,5})").unwrap()),
        "rowspan" => RE_ROWSPAN
            .get_or_init(|| Regex::new(r#"(?i)rowspan\s*=\s*['"]?(\d+)"#).unwrap()),
        "font" => RE_FONT.get_or_init(|| Regex::new(r"(?is)<font\b[^>]*>(.*?)</font>").unwrap()),
        "week_exact" => RE_WEEK_EXACT.get_or_init(|| Regex::new(r"^\d{1,2}-\d{1,2}$").unwrap()),
        _ => unreachable!("unknown regex key"),
    }
}

// 内联 HTML 清洗：去标签、解码实体、合并空白（与 fzu-proxy.mjs 的 cleanHtmlText 一致）
pub fn clean_inline(value: &str) -> String {
    let mut s = re("br").replace_all(value, " ").into_owned();
    s = re("tag").replace_all(&s, "").into_owned();
    s = s
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    s = re("entity")
        .replace_all(&s, |caps: &Captures| {
            let code: u32 = caps[1].parse().unwrap_or(0);
            char::from_u32(code).map(|c| c.to_string()).unwrap_or_default()
        })
        .into_owned();
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// 单元格多行清洗：<br> 转行、去掉 [..</a>..] 操作链接块、去标签，返回非空行
fn clean_cell_lines(value: &str) -> Vec<String> {
    let mut s = re("br").replace_all(value, "\n").into_owned();
    s = re("link_block").replace_all(&s, "").into_owned();
    s = re("tag").replace_all(&s, "").into_owned();
    s = s
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    s = re("entity")
        .replace_all(&s, |caps: &Captures| {
            let code: u32 = caps[1].parse().unwrap_or(0);
            char::from_u32(code).map(|c| c.to_string()).unwrap_or_default()
        })
        .into_owned();
    s.lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect()
}

// 周次字符串 -> 区间数组（"01-12" -> [(1,12)]，"01-10,13-14" -> [(1,10),(13,14)]）
fn parse_week_ranges(weeks: &str) -> Vec<(i32, i32)> {
    re("week_range")
        .captures_iter(weeks)
        .map(|caps| {
            let a: i32 = caps[1].parse().unwrap_or(0);
            let b: i32 = caps[2].parse().unwrap_or(0);
            (a.min(b), a.max(b))
        })
        .collect()
}

// 区间数组 -> 周次字符串（相邻区间合并）
fn week_ranges_to_string(ranges: &mut Vec<(i32, i32)>) -> String {
    ranges.sort_by_key(|&(s, e)| (s, e));
    let mut merged: Vec<(i32, i32)> = Vec::new();
    for &(start, end) in ranges.iter() {
        if let Some(prev) = merged.last_mut() {
            if start <= prev.1 + 1 {
                prev.1 = prev.1.max(end);
                continue;
            }
        }
        merged.push((start, end));
    }
    merged
        .iter()
        .map(|&(s, e)| format!("{:02}-{:02}", s, e))
        .collect::<Vec<_>>()
        .join(",")
}

// 两段周次字符串取并集
fn union_weeks(a: &str, b: &str) -> String {
    if a.is_empty() {
        return b.to_string();
    }
    if b.is_empty() {
        return a.to_string();
    }
    let mut ranges = parse_week_ranges(a);
    ranges.extend(parse_week_ranges(b));
    week_ranges_to_string(&mut ranges)
}

// 解析单个课程块（name 已从 <font> 提取，tail 是教室/老师/周次等）
fn parse_course_block(name: &str, tail_html: &str) -> Option<CourseItem> {
    let mut course = CourseItem {
        name: clean_inline(name),
        teacher: String::new(),
        location: String::new(),
        weeks: String::new(),
        day: 0,
        start: 0,
        end: 0,
        single: Some(true),
        double: Some(true),
    };

    for line in clean_cell_lines(tail_html) {
        let brackets: Vec<String> = re("bracket")
            .captures_iter(&line)
            .map(|caps| caps[1].trim().to_string())
            .filter(|inner| !inner.is_empty())
            .collect();
        for inner in brackets {
            if inner == "单" {
                course.single = Some(true);
                course.double = Some(false);
            } else if inner == "双" {
                course.single = Some(false);
                course.double = Some(true);
            } else {
                course.location = inner;
            }
        }
        let rest = re("bracket")
            .replace_all(&line, "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if rest.is_empty() {
            continue;
        }
        if re("week_exact").is_match(&rest) {
            course.weeks = rest;
            continue;
        }
        if course.name.is_empty() {
            course.name = rest;
        } else if course.teacher.is_empty() {
            course.teacher = rest;
        }
    }
    if course.name.is_empty() {
        None
    } else {
        Some(course)
    }
}

// 一个 <td> 内可能按周次拆分多门课（每门课名包在 <font> 里），按 <font> 边界切分解析
fn parse_course_cell(td_html: &str) -> Vec<CourseItem> {
    // (start, end, font 内部文本)
    let fonts: Vec<(usize, usize, String)> = re("font")
        .captures_iter(td_html)
        .map(|caps| {
            let m = caps.get(0).unwrap();
            (m.start(), m.end(), caps[1].to_string())
        })
        .collect();
    if fonts.is_empty() {
        return parse_course_block("", td_html).into_iter().collect();
    }
    let mut courses = Vec::new();
    for (i, (_, tail_start, inner)) in fonts.iter().enumerate() {
        let tail_end = fonts
            .get(i + 1)
            .map(|(start, _, _)| *start)
            .unwrap_or(td_html.len());
        if let Some(parsed) = parse_course_block(inner, &td_html[*tail_start..tail_end]) {
            courses.push(parsed);
        }
    }
    courses
}

// 解析整张课表，返回 { periods, courses }
pub fn parse_course_table(html: &str) -> CourseTable {
    let container = re("container").captures(html);
    let inner = container
        .as_ref()
        .map(|caps| caps.get(1).map(|m| m.as_str()).unwrap_or(""))
        .unwrap_or(html);

    let mut periods: Vec<CoursePeriod> = Vec::new();
    let mut courses: Vec<CourseItem> = Vec::new();
    let mut segment = String::new();
    let mut segment_remaining = 0i32;

    for row_caps in re("tr").captures_iter(inner) {
        let row_html = &row_caps[1];
        let tds: Vec<(String, String)> = re("td")
            .captures_iter(row_html)
            .map(|caps| (caps[1].to_string(), caps[2].to_string()))
            .collect();
        if tds.len() < 8 {
            continue;
        }

        let mut idx: usize;
        let first_attrs = &tds[0].0;
        if first_attrs.to_lowercase().contains("rowspan") {
            let seg = clean_inline(&tds[0].1);
            if !seg.is_empty() {
                segment = seg;
            }
            let span: i32 = re("rowspan")
                .captures(first_attrs)
                .and_then(|caps| caps[1].parse().ok())
                .unwrap_or(1);
            segment_remaining = span - 1;
            idx = 1;
        } else {
            if segment_remaining > 0 {
                segment_remaining -= 1;
            }
            idx = 0;
        }

        let period_text = clean_inline(&tds[idx].1);
        let Some(period_caps) = re("period").captures(&period_text) else {
            continue;
        };
        let number: i32 = period_caps[1].parse().unwrap_or(0);
        let time = format!("{}-{}", &period_caps[2], &period_caps[3]);
        periods.push(CoursePeriod {
            number,
            time,
            segment: segment.clone(),
        });
        idx += 1;

        for day in 0..7 {
            let cell_idx = idx + day;
            if cell_idx >= tds.len() {
                break;
            }
            for parsed in parse_course_cell(&tds[cell_idx].1) {
                courses.push(CourseItem {
                    day: day as i32,
                    start: number,
                    end: number,
                    ..parsed
                });
            }
        }
    }

    // 1) 同一格（同 day/start/end）同名同师同地课程：周次取并集
    let mut slot_merged: Vec<CourseItem> = Vec::new();
    for course in courses {
        if let Some(prev) = slot_merged.iter_mut().find(|p| {
            p.day == course.day
                && p.start == course.start
                && p.end == course.end
                && p.name == course.name
                && p.teacher == course.teacher
                && p.location == course.location
        }) {
            prev.weeks = union_weeks(&prev.weeks, &course.weeks);
        } else {
            slot_merged.push(course);
        }
    }

    // 2) 按 星期 -> 节次 排序后合并相邻节次的同一门课
    slot_merged.sort_by_key(|c| (c.day, c.start));
    let mut merged: Vec<CourseItem> = Vec::new();
    for course in slot_merged {
        let prev = merged
            .iter()
            .rev()
            .find(|p| {
                p.day == course.day
                    && p.name == course.name
                    && p.teacher == course.teacher
                    && p.location == course.location
                    && p.weeks == course.weeks
                    && p.end == course.start - 1
            })
            .cloned();
        if let Some(mut p) = prev {
            let pos = merged
                .iter()
                .rposition(|x| {
                    x.day == p.day
                        && x.name == p.name
                        && x.teacher == p.teacher
                        && x.location == p.location
                        && x.weeks == p.weeks
                        && x.end == course.start - 1
                })
                .unwrap();
            p.end = course.end;
            merged[pos] = p;
        } else {
            merged.push(course);
        }
    }

    CourseTable { periods, courses: merged }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_inline_html() {
        assert_eq!(clean_inline("<br> A <b>B</b>&nbsp;&amp;"), "A B &");
    }

    #[test]
    fn parses_week_ranges_and_union() {
        assert_eq!(parse_week_ranges("01-12"), vec![(1, 12)]);
        assert_eq!(union_weeks("01-12", "13-14"), "01-14");
    }

    #[test]
    fn parses_week_identifier() {
        let mut ranges = vec![(1, 12), (13, 14)];
        assert_eq!(week_ranges_to_string(&mut ranges), "01-14");
    }
}
