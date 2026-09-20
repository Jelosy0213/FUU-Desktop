// 演示数据（对应 server/demo-data.mjs）：演示账号免验证码登录后返回示例课表/考表/
// 个人信息/校历，无需真实教务账号即可体验全部功能。
use std::collections::HashMap;

use chrono::{Datelike, Duration, Local, NaiveDate};

use crate::jw::calendar::{LocateDate, SchoolCalendar, SchoolTerm};
use crate::jw::course::{CourseItem, CoursePeriod};
use crate::jw::exam::ExamItem;

pub const DEMO_ACCOUNT: &str = "123456";
pub const DEMO_PASSWORD: &str = "root";
pub const DEMO_TERM: &str = "202601";
pub const DEMO_TERMS: [&str; 3] = ["202501", "202502", "202601"];

fn monday_of_week(date: NaiveDate) -> NaiveDate {
    let offset = date.weekday().num_days_from_monday() as i64;
    date - Duration::days(offset)
}

fn iso_date(date: NaiveDate) -> String {
    date.format("%Y-%m-%d").to_string()
}

pub fn demo_periods() -> Vec<CoursePeriod> {
    const DATA: [(&str, &str); 11] = [
        ("08:20-09:05", "上午"),
        ("09:15-10:00", "上午"),
        ("10:20-11:05", "上午"),
        ("11:15-12:00", "上午"),
        ("14:00-14:45", "下午"),
        ("14:55-15:40", "下午"),
        ("16:00-16:45", "下午"),
        ("16:55-17:40", "下午"),
        ("19:00-19:45", "晚上"),
        ("19:55-20:40", "晚上"),
        ("20:50-21:35", "晚上"),
    ];
    DATA.iter()
        .enumerate()
        .map(|(i, (time, segment))| CoursePeriod {
            number: i as i32 + 1,
            time: time.to_string(),
            segment: segment.to_string(),
        })
        .collect()
}

pub fn demo_profile() -> HashMap<String, String> {
    [
        ("学号", "852300001"),
        ("姓名", "陈小U"),
        ("性别", "男"),
        ("出生日期", "2005-03-18"),
        ("民族", "汉族"),
        ("政治面貌", "共青团员"),
        ("年级", "2023"),
        ("学院名称", "计算机与大数据学院"),
        ("专业名称", "计算机科学与技术"),
        ("学制", "四年"),
        ("培养层次", "本科"),
        ("入学日期", "2023-09-11"),
    ]
    .iter()
    .map(|(k, v)| (k.to_string(), v.to_string()))
    .collect()
}

fn course(
    name: &str,
    teacher: &str,
    location: &str,
    weeks: &str,
    day: i32,
    start: i32,
    end: i32,
    single: Option<bool>,
    double: Option<bool>,
) -> CourseItem {
    CourseItem {
        name: name.to_string(),
        teacher: teacher.to_string(),
        location: location.to_string(),
        weeks: weeks.to_string(),
        day,
        start,
        end,
        single,
        double,
    }
}

// 当前学期（202601）完整课程
fn full_demo_courses() -> Vec<CourseItem> {
    vec![
        course("高等数学A(一)", "张明远", "文1-201", "01-16", 0, 1, 2, None, None),
        course("大学英语(一)", "李晓华", "外语楼404", "01-16", 0, 3, 4, None, None),
        course("大学体育(一)", "陈志强", "东区田径场", "01-16", 0, 7, 8, Some(false), Some(true)),
        course("程序设计基础(C语言)", "郑海涛", "计算机楼305", "01-08,10-16", 1, 1, 2, None, None),
        course("大学物理A(一)", "林秀英", "物3-210", "03-16", 1, 3, 4, Some(false), Some(true)),
        course("思想道德与法治", "吴慧敏", "文2-305", "01-16", 1, 5, 6, None, None),
        course("高等数学A(一)", "张明远", "文1-201", "01-16", 2, 1, 2, None, None),
        course("大学英语(一)", "李晓华", "外语楼404", "01-16", 2, 3, 4, None, None),
        course("中国近现代史纲要", "陈志强", "文2-108", "01-16", 2, 5, 6, Some(true), Some(false)),
        course("形势与政策", "林嘉琪", "综合楼102", "05-16", 2, 9, 10, None, None),
        course("大学物理A(一)", "林秀英", "物3-210", "01-16", 3, 1, 2, None, None),
        course("程序设计实验", "郑海涛", "计算机楼505", "01-16", 3, 3, 4, None, None),
        course("大学体育(一)", "陈志强", "东区田径场", "01-16", 3, 5, 6, Some(false), Some(true)),
        course("线性代数", "王建国", "数3-102", "01-16", 4, 1, 2, None, None),
        course("心理健康教育", "郭丽华", "文2-402", "01-16", 4, 3, 4, None, None),
        course("大学物理实验A", "林秀英", "物理实验楼301", "01-08", 4, 5, 6, None, None),
        course("创新思维训练", "孙宇辰", "线上教学", "01-16", 5, 1, 2, None, None),
    ]
}

// 历史学期课程
fn past_demo_courses() -> Vec<CourseItem> {
    vec![
        course("高等数学A(二)", "张明远", "文1-201", "01-16", 0, 1, 2, None, None),
        course("大学英语(二)", "李晓华", "外语楼404", "01-16", 0, 3, 4, None, None),
        course("概率论与数理统计", "王建国", "数3-102", "01-16", 2, 1, 2, None, None),
        course("数字逻辑", "黄志斌", "计算机楼302", "03-14", 2, 5, 6, Some(false), Some(true)),
        course("离散数学", "陈慧琳", "数3-208", "01-16", 4, 3, 4, None, None),
    ]
}

pub fn demo_courses(term: &str) -> Vec<CourseItem> {
    if !term.is_empty() && term != DEMO_TERM {
        past_demo_courses()
    } else {
        full_demo_courses()
    }
}

// 考表：日期落在"本周"，保证打开课表当周即可看到考试卡片
pub fn demo_exams(term: &str) -> Vec<ExamItem> {
    if !term.is_empty() && term != DEMO_TERM {
        return Vec::new();
    }
    let monday = monday_of_week(Local::now().date_naive());
    let at = |offset: i64| iso_date(monday + Duration::days(offset));
    vec![
        ExamItem {
            name: "高等数学A(一) 阶段测验".to_string(),
            date: at(3),
            time: "08:30-10:30".to_string(),
            location: "文1-201".to_string(),
            seat: "12".to_string(),
            exam_type: "闭卷".to_string(),
            teacher: "张明远".to_string(),
            raw: Vec::new(),
        },
        ExamItem {
            name: "大学英语(一) 听力测试".to_string(),
            date: at(4),
            time: "14:00-15:30".to_string(),
            location: "外语楼语音室204".to_string(),
            seat: "03".to_string(),
            exam_type: "听力".to_string(),
            teacher: "李晓华".to_string(),
            raw: Vec::new(),
        },
    ]
}

// 校历：当前学期从本周周一起算（共 20 周），保证"今天"落在学期内
pub fn demo_calendar() -> SchoolCalendar {
    let start = monday_of_week(Local::now().date_naive());
    let end = start + Duration::days(139);
    let year = start.year();
    SchoolCalendar {
        current_term: DEMO_TERM.to_string(),
        terms: vec![
            SchoolTerm {
                term: "202501".to_string(),
                start_date: format!("{}-09-01", year - 1),
                end_date: format!("{}-01-18", year),
            },
            SchoolTerm {
                term: "202502".to_string(),
                start_date: format!("{}-02-23", year),
                end_date: format!("{}-07-05", year),
            },
            SchoolTerm {
                term: DEMO_TERM.to_string(),
                start_date: iso_date(start),
                end_date: iso_date(end),
            },
        ],
    }
}

// 当前教学周：本周为第 1 周
pub fn demo_locate_date() -> LocateDate {
    let today = Local::now().date_naive();
    let monday = monday_of_week(today);
    let diff_days = (today - monday).num_days();
    let week = (diff_days / 7 + 1).max(1) as i32;
    let year = today.year();
    LocateDate {
        week,
        year: year.to_string(),
        term: "01".to_string(),
    }
}

// 演示账号验证码占位图：无需真实验证码
pub fn demo_captcha_svg() -> String {
    r##"<svg xmlns="http://www.w3.org/2000/svg" width="120" height="36">
  <rect width="120" height="36" rx="4" fill="#eef4ff"/>
  <text x="60" y="22" font-size="13" text-anchor="middle" fill="#2563eb" font-weight="600">演示账号 免验证码</text>
</svg>"##
        .to_string()
}
