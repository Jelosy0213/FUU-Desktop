// 学历信息页（xmpy_cszt.aspx）解析（对应 fzu-proxy.mjs 的 parseProfileInfo）。
use std::collections::HashMap;

use regex::Regex;

use crate::jw::course::clean_inline;

// span id -> 中文标签
const FIELD_IDS: &[(&str, &str)] = &[
    ("xh", "学号"),
    ("xm", "姓名"),
    ("xb", "性别"),
    ("csrq", "出生日期"),
    ("mz", "民族"),
    ("zzmm", "政治面貌"),
    ("nj", "年级"),
    ("xymc", "学院名称"),
    ("zymc", "专业名称"),
    ("xz", "学制"),
    ("pycc", "培养层次"),
    ("rxny", "入学日期"),
];

// 解析学历信息页各字段，返回中文键映射，如 { 学号: "852302111", 姓名: "江立烨" }
pub fn parse_profile_info(html: &str) -> HashMap<String, String> {
    let mut profile = HashMap::new();
    for (id, label) in FIELD_IDS {
        // 低频调用（打开个人信息页一次），这里按需编译即可，无需缓存。
        let pattern = format!(r#"(?is)id="ContentPlaceHolder1_LB_{id}"[^>]*>(.*?)</span>"#);
        let re = Regex::new(&pattern).unwrap();
        let value = re
            .captures(html)
            .and_then(|caps| caps.get(1))
            .map(|m| clean_inline(m.as_str()))
            .unwrap_or_default();
        if !value.is_empty() {
            profile.insert(label.to_string(), value);
        }
    }
    profile
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_profile_fields() {
        let html = r#"<span id="ContentPlaceHolder1_LB_xh">852302111</span>
        <span id="ContentPlaceHolder1_LB_xm">江立烨</span>
        <span id="ContentPlaceHolder1_LB_xymc"><b>先进制造学院</b></span>"#;
        let profile = parse_profile_info(html);
        assert_eq!(profile.get("学号").map(String::as_str), Some("852302111"));
        assert_eq!(profile.get("姓名").map(String::as_str), Some("江立烨"));
        assert_eq!(
            profile.get("学院名称").map(String::as_str),
            Some("先进制造学院")
        );
    }
}
