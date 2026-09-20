// Tauri commands：对应 fzu-proxy.mjs 的各 /api/* 路由。
// 成功返回纯数据（serde 序列化），失败返回 Err(String)（前端 catch 后取 message）。
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use regex::Regex;
use reqwest::Method;
use serde::Serialize;
use tauri::State;

use crate::jw::calendar::{parse_locate_date, parse_school_calendar, SchoolCalendar};
use crate::jw::client::{
    self, ensure_course_session_initialized, request_target, AppState, Session, SessionSnapshot,
    COURSE_ORIGIN, COURSE_PATH, EXAM_PATH, LOGIN_PAGE, LOCATE_DATE_URL, PROFILE_PATH,
    SCHOOL_CALENDAR_URL,
};
use crate::jw::course::{parse_course_table, CourseItem, CoursePeriod};
use crate::jw::demo;
use crate::jw::exam::{parse_exam_list, ExamItem};
use crate::jw::login::{self, LoginOutcome, visit_module};
use crate::jw::profile::parse_profile_info;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptchaData {
    pub mime: String,
    pub base64: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoursePageData {
    pub title: String,
    pub semester: String,
    pub terms: Vec<String>,
    pub periods: Vec<CoursePeriod>,
    pub courses: Vec<CourseItem>,
    pub snippet: String,
    pub html_length: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamPageData {
    pub title: String,
    pub exams: Vec<ExamItem>,
    pub snippet: String,
    pub html_length: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocateDateData {
    pub week: i32,
    pub year: String,
    pub term: String,
    pub semester: String,
}

fn is_demo(session: &Session, account: &str) -> bool {
    session.demo || account == demo::DEMO_ACCOUNT
}

fn random_n() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn semester_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)<option\s+selected="selected"\s+value="(\d+)""#).unwrap())
}

fn terms_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)<option[^>]*value="(\d{6})"[^>]*>"#).unwrap())
}

fn title_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?is)<span\s+id="LB_bt"[^>]*>(.*?)</span>"#).unwrap())
}

fn extract_hidden_input(text: &str, name: &str) -> String {
    let name_pattern = format!(r#"name="{name}"[^>]*value="([^"]*)""#);
    let id_pattern = format!(r#"id="{name}"[^>]*value="([^"]*)""#);
    Regex::new(&name_pattern)
        .ok()
        .and_then(|re| re.captures(text).map(|c| c[1].to_string()))
        .or_else(|| {
            Regex::new(&id_pattern)
                .ok()
                .and_then(|re| re.captures(text).map(|c| c[1].to_string()))
        })
        .unwrap_or_default()
}

fn extract_semester(text: &str) -> String {
    semester_re()
        .captures(text)
        .map(|c| c[1].to_string())
        .unwrap_or_default()
}

fn extract_terms(text: &str) -> Vec<String> {
    terms_re()
        .captures_iter(text)
        .map(|c| c[1].to_string())
        .collect()
}

fn is_redirected_to_login(text: &str) -> bool {
    let lowered = text.to_lowercase();
    ["login.htm", "用户登录", "verifycode", "password", "error.asp?id=300", "object moved", "无当前登录用户", "jwch.fzu.edu.cn"]
        .iter()
        .any(|kw| lowered.contains(kw))
}

// 切换学期：课表/考表是 ASP.NET postback，需携带 __VIEWSTATE / __EVENTVALIDATION
async fn change_term(
    client: &reqwest::Client,
    session: &mut Session,
    target_url: &str,
    text: &str,
    requested_term: &str,
) -> Result<String, String> {
    let view_state = extract_hidden_input(text, "__VIEWSTATE");
    let event_validation = extract_hidden_input(text, "__EVENTVALIDATION");
    if view_state.is_empty() || event_validation.is_empty() {
        return Ok(text.to_string());
    }
    let form = format!(
        "ctl00$ContentPlaceHolder1$DDL_xnxq={}&ctl00$ContentPlaceHolder1$BT_submit={}&__VIEWSTATE={}&__EVENTVALIDATION={}",
        login::encode_uri_component(requested_term),
        login::encode_uri_component("确定"),
        login::encode_uri_component(&view_state),
        login::encode_uri_component(&event_validation),
    );
    let result = request_target(
        client,
        target_url,
        Method::POST,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", COURSE_ORIGIN.to_string()),
            ("Referer", target_url.to_string()),
            ("Content-Type", "application/x-www-form-urlencoded".to_string()),
        ],
        Some(form),
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);
    Ok(result.text_lossy())
}

fn module_referer(home_id: &str) -> String {
    format!(
        "https://jwcjwxt2.fzu.edu.cn/Home/index?id={}&hosturl={}&ssologin=",
        login::encode_uri_component(home_id),
        login::encode_uri_component(COURSE_ORIGIN)
    )
}

// GET /api/captcha -> 验证码图片（base64）
#[tauri::command]
pub async fn get_captcha(state: State<'_, AppState>, account: String) -> Result<CaptchaData, String> {
    if account == demo::DEMO_ACCOUNT {
        let svg = demo::demo_captcha_svg();
        client::log_step("demo:captcha", serde_json::json!({ "account": account }));
        return Ok(CaptchaData {
            mime: "image/svg+xml".to_string(),
            base64: b64(svg.as_bytes()),
        });
    }

    let client = state.client.clone();
    // 验证码与登录态绑定在同一个会话上，这里必须独占：整段持有会话锁
    let mut guard = state.lock_session().await;
    let session: &mut Session = &mut guard;
    client::ensure_session_initialized(&client, session)
        .await
        .map_err(|e| e.to_string())?;

    client::log_step(
        "captcha:start",
        serde_json::json!({ "account": account, "cookieNames": client::cookie_names(session) }),
    );

    let path = format!("/plus/verifycode.asp?n={}", random_n());
    let result = request_target(
        &client,
        &path,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Referer", LOGIN_PAGE.to_string()),
        ],
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);

    let mime = result
        .headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/gif")
        .to_string();
    client::log_step(
        "captcha:done",
        serde_json::json!({
            "status": result.status,
            "contentType": mime,
            "bodyBytes": result.body.len(),
            "cookieNames": client::cookie_names(session),
        }),
    );
    Ok(CaptchaData {
        mime,
        base64: b64(&result.body),
    })
}

// POST /api/login -> 登录
#[tauri::command]
pub async fn login(
    state: State<'_, AppState>,
    username: String,
    password: String,
    verify_code: String,
) -> Result<LoginOutcome, String> {
    let username = username.trim().to_string();
    if username == demo::DEMO_ACCOUNT && password == demo::DEMO_PASSWORD {
        let mut guard = state.session.lock().await;
        let session: &mut Session = &mut guard;
        session.demo = true;
        client::log_step("demo:login", serde_json::json!({ "username": username }));
        return Ok(LoginOutcome {
            success: true,
            message: "登录成功（演示数据）".to_string(),
            status: 200,
        });
    }

    let client = state.client.clone();
    // 登录会改写会话身份：先自增代次，让在途的只读抓取快照作废（其回写会被丢弃），
    // 再独占会话整段执行，避免把旧 cookie 覆盖回新登录态
    state.begin_auth();
    let mut guard = state.lock_session().await;
    let session: &mut Session = &mut guard;
    session.demo = false;
    login::login(&client, session, &username, &password, &verify_code)
        .await
        .map_err(|e| e.to_string())
}

// POST /api/relogin-with-remembered -> 用系统凭据库里的账号密码重新登录。
// 密码只存在于 Rust 侧：前端只负责出验证码答案，拿不到也不传明文密码。
#[tauri::command]
pub async fn relogin_with_remembered(
    state: State<'_, AppState>,
    verify_code: String,
) -> Result<LoginOutcome, String> {
    let credentials = crate::read_credentials().ok_or_else(|| "未找到已保存的登录信息".to_string())?;
    let username = credentials.username.trim().to_string();

    if username == demo::DEMO_ACCOUNT && credentials.password == demo::DEMO_PASSWORD {
        let mut guard = state.session.lock().await;
        let session: &mut Session = &mut guard;
        session.demo = true;
        client::log_step("demo:login", serde_json::json!({ "username": username }));
        return Ok(LoginOutcome {
            success: true,
            message: "登录成功（演示数据）".to_string(),
            status: 200,
        });
    }

    let client = state.client.clone();
    // 同上：重新登录也会改写会话身份，先作废在途快照再独占执行
    state.begin_auth();
    let mut guard = state.lock_session().await;
    let session: &mut Session = &mut guard;
    session.demo = false;
    client::log_step(
        "relogin:remembered",
        serde_json::json!({ "username": username, "cookieNames": client::cookie_names(session) }),
    );
    login::login(&client, session, &username, &credentials.password, &verify_code)
        .await
        .map_err(|e| e.to_string())
}

// POST /api/course-page -> 课表
#[tauri::command]
pub async fn get_course_page(
    state: State<'_, AppState>,
    account: String,
    term: Option<String>,
) -> Result<CoursePageData, String> {
    let account = account.trim().to_string();
    let requested_term = term.unwrap_or_default().trim().to_string();

    let client = state.client.clone();
    // 只读抓取：取一次会话快照后不再长期占用会话锁，使并发的课表/考表/周数命令真正并行；
    // 结果在返回前由 publish_session 逐项合并回共享会话
    let SessionSnapshot {
        baseline,
        session: mut snapshot,
        epoch,
    } = state.session_snapshot().await;
    let session: &mut Session = &mut snapshot;

    if is_demo(session, &account) {
        let requested = if requested_term.is_empty() {
            demo::DEMO_TERM.to_string()
        } else {
            requested_term
        };
        client::log_step(
            "demo:course-page",
            serde_json::json!({ "account": account, "term": requested }),
        );
        return Ok(CoursePageData {
            title: "我的课表（演示）".to_string(),
            semester: requested.clone(),
            terms: demo::DEMO_TERMS.iter().map(|s| s.to_string()).collect(),
            periods: demo::demo_periods(),
            courses: demo::demo_courses(&requested),
            snippet: String::new(),
            html_length: 0,
        });
    }

    let home_id = if session.home_id.is_empty() {
        account.clone()
    } else {
        session.home_id.clone()
    };
    let target_url = format!(
        "{}?id={}",
        format!("{}{}", COURSE_ORIGIN, COURSE_PATH),
        login::encode_uri_component(&home_id)
    );

    ensure_course_session_initialized(&client, session)
        .await
        .map_err(|e| e.to_string())?;
    if !account.is_empty() {
        visit_module(&client, session, &account, "我的课表", &target_url)
            .await
            .map_err(|e| e.to_string())?;
    }

    client::log_step(
        "course:start",
        serde_json::json!({
            "account": account,
            "term": requested_term,
            "homeId": home_id,
            "cookieNames": client::cookie_names(session),
        }),
    );

    let result = request_target(
        &client,
        &target_url,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", "https://jwcjwxt2.fzu.edu.cn".to_string()),
            ("Referer", module_referer(&home_id)),
            ("Sec-Fetch-Dest", "iframe".to_string()),
            ("Sec-Fetch-Mode", "navigate".to_string()),
            ("Sec-Fetch-Site", "same-site".to_string()),
            ("Upgrade-Insecure-Requests", "1".to_string()),
        ],
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);

    let mut text = result.text_lossy();
    let mut semester = extract_semester(&text);

    if !requested_term.is_empty() && requested_term != semester {
        client::log_step(
            "course:change-term",
            serde_json::json!({ "from": semester, "to": requested_term }),
        );
        text = change_term(&client, session, &target_url, &text, &requested_term).await?;
        semester = extract_semester(&text);
    }

    let title = title_re()
        .captures(&text)
        .map(|c| crate::jw::course::clean_inline(&c[1]))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "我的课表".to_string());

    let table = parse_course_table(&text);
    let terms = extract_terms(&text);
    let snippet = client::response_snippet(result.body.as_slice());
    let redirected = is_redirected_to_login(&text);

    if redirected {
        client::log_step(
            "course:error",
            serde_json::json!({
                "reason": "课表页要求重新登录或 Cookie 不完整",
                "status": result.status,
                "cookieNames": client::cookie_names(session),
                "snippet": snippet,
            }),
        );
        state.publish_session(epoch, &baseline, session).await;
        return Err("课表页要求重新登录或 Cookie 不完整".to_string());
    }

    client::log_step(
        "course:done",
        serde_json::json!({
            "status": result.status,
            "title": title,
            "semester": semester,
            "terms": terms,
            "periods": table.periods.len(),
            "courses": table.courses.len(),
            "htmlLength": text.len(),
            "cookieNames": client::cookie_names(session),
            "snippet": snippet,
        }),
    );

    let outcome = Ok(CoursePageData {
        title,
        semester,
        terms,
        periods: table.periods,
        courses: table.courses,
        snippet,
        html_length: text.len(),
    });
    state.publish_session(epoch, &baseline, session).await;
    outcome
}

// POST /api/exam-list -> 考表
#[tauri::command]
pub async fn get_exam_list(
    state: State<'_, AppState>,
    account: String,
    term: Option<String>,
) -> Result<ExamPageData, String> {
    let account = account.trim().to_string();
    let requested_term = term.unwrap_or_default().trim().to_string();

    let client = state.client.clone();
    // 只读抓取：取一次会话快照后不再长期占用会话锁（与课表命令并发执行）
    let SessionSnapshot {
        baseline,
        session: mut snapshot,
        epoch,
    } = state.session_snapshot().await;
    let session: &mut Session = &mut snapshot;

    if is_demo(session, &account) {
        let requested = if requested_term.is_empty() {
            demo::DEMO_TERM.to_string()
        } else {
            requested_term
        };
        client::log_step(
            "demo:exam-list",
            serde_json::json!({ "account": account, "term": requested }),
        );
        return Ok(ExamPageData {
            title: "我的考表（演示）".to_string(),
            exams: demo::demo_exams(&requested),
            snippet: String::new(),
            html_length: 0,
        });
    }

    let home_id = if session.home_id.is_empty() {
        account.clone()
    } else {
        session.home_id.clone()
    };
    let target_url = format!(
        "{}?id={}",
        format!("{}{}", COURSE_ORIGIN, EXAM_PATH),
        login::encode_uri_component(&home_id)
    );

    ensure_course_session_initialized(&client, session)
        .await
        .map_err(|e| e.to_string())?;
    if !account.is_empty() {
        visit_module(&client, session, &account, "我的考表", &target_url)
            .await
            .map_err(|e| e.to_string())?;
    }

    client::log_step(
        "exam:start",
        serde_json::json!({
            "account": account,
            "term": requested_term,
            "homeId": home_id,
            "cookieNames": client::cookie_names(session),
        }),
    );

    let result = request_target(
        &client,
        &target_url,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", "https://jwcjwxt2.fzu.edu.cn".to_string()),
            ("Referer", module_referer(&home_id)),
            ("Sec-Fetch-Dest", "iframe".to_string()),
            ("Sec-Fetch-Mode", "navigate".to_string()),
            ("Sec-Fetch-Site", "same-site".to_string()),
            ("Upgrade-Insecure-Requests", "1".to_string()),
        ],
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);

    let mut text = result.text_lossy();
    let semester = extract_semester(&text);

    if !requested_term.is_empty() && requested_term != semester {
        client::log_step(
            "exam:change-term",
            serde_json::json!({ "from": semester, "to": requested_term }),
        );
        text = change_term(&client, session, &target_url, &text, &requested_term).await?;
    }

    let table = parse_exam_list(&text);
    let snippet = client::response_snippet(result.body.as_slice());
    let redirected = is_redirected_to_login(&text);

    if redirected {
        client::log_step(
            "exam:error",
            serde_json::json!({
                "reason": "考试页面要求重新登录或 Cookie 不完整",
                "status": result.status,
                "cookieNames": client::cookie_names(session),
                "snippet": snippet,
            }),
        );
        state.publish_session(epoch, &baseline, session).await;
        return Err("考试页面要求重新登录或 Cookie 不完整".to_string());
    }

    client::log_step(
        "exam:done",
        serde_json::json!({
            "status": result.status,
            "semester": semester,
            "exams": table.exams.len(),
            "htmlLength": text.len(),
            "cookieNames": client::cookie_names(session),
            "snippet": snippet,
        }),
    );

    let outcome = Ok(ExamPageData {
        title: "我的考表".to_string(),
        exams: table.exams,
        snippet,
        html_length: text.len(),
    });
    state.publish_session(epoch, &baseline, session).await;
    outcome
}

// POST /api/profile -> 个人信息
#[tauri::command]
pub async fn get_profile(
    state: State<'_, AppState>,
    account: String,
) -> Result<HashMap<String, String>, String> {
    let account = account.trim().to_string();

    let client = state.client.clone();
    // 只读抓取：取一次会话快照后不再长期占用会话锁
    let SessionSnapshot {
        baseline,
        session: mut snapshot,
        epoch,
    } = state.session_snapshot().await;
    let session: &mut Session = &mut snapshot;

    if is_demo(session, &account) {
        client::log_step("demo:profile", serde_json::json!({ "account": account }));
        return Ok(demo::demo_profile());
    }

    let home_id = if session.home_id.is_empty() {
        account.clone()
    } else {
        session.home_id.clone()
    };
    let target_url = format!(
        "{}?id={}",
        format!("{}{}", COURSE_ORIGIN, PROFILE_PATH),
        login::encode_uri_component(&home_id)
    );

    ensure_course_session_initialized(&client, session)
        .await
        .map_err(|e| e.to_string())?;
    if !account.is_empty() {
        visit_module(&client, session, &account, "学历信息", &target_url)
            .await
            .map_err(|e| e.to_string())?;
    }

    client::log_step(
        "profile:start",
        serde_json::json!({
            "account": account,
            "homeId": home_id,
            "cookieNames": client::cookie_names(session),
        }),
    );

    let result = request_target(
        &client,
        &target_url,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", "https://jwcjwxt2.fzu.edu.cn".to_string()),
            ("Referer", module_referer(&home_id)),
            ("Sec-Fetch-Dest", "iframe".to_string()),
            ("Sec-Fetch-Mode", "navigate".to_string()),
            ("Sec-Fetch-Site", "same-site".to_string()),
            ("Upgrade-Insecure-Requests", "1".to_string()),
        ],
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);

    let text = result.text_lossy();
    let snippet = client::response_snippet(result.body.as_slice());
    if is_redirected_to_login(&text) {
        client::log_step(
            "profile:error",
            serde_json::json!({
                "reason": "个人信息页要求重新登录或 Cookie 不完整",
                "status": result.status,
                "cookieNames": client::cookie_names(session),
                "snippet": snippet,
            }),
        );
        state.publish_session(epoch, &baseline, session).await;
        return Err("个人信息页要求重新登录或 Cookie 不完整".to_string());
    }

    let info = parse_profile_info(&text);
    let mut keys: Vec<String> = info.keys().cloned().collect();
    keys.sort();
    client::log_step(
        "profile:done",
        serde_json::json!({
            "status": result.status,
            "fields": info.len(),
            "keys": keys,
            "htmlLength": text.len(),
            "cookieNames": client::cookie_names(session),
            "snippet": snippet,
        }),
    );
    state.publish_session(epoch, &baseline, session).await;
    Ok(info)
}

// GET /api/locate-date -> 当前教学周
#[tauri::command]
pub async fn get_locate_date(
    state: State<'_, AppState>,
    account: String,
) -> Result<LocateDateData, String> {
    let account = account.trim().to_string();

    let client = state.client.clone();
    // 只读抓取：取一次会话快照后不再长期占用会话锁
    let SessionSnapshot {
        baseline,
        session: mut snapshot,
        epoch,
    } = state.session_snapshot().await;
    let session: &mut Session = &mut snapshot;

    if is_demo(session, &account) {
        let located = demo::demo_locate_date();
        client::log_step(
            "demo:locate-date",
            serde_json::json!({
                "account": account,
                "week": located.week,
                "semester": format!("{}{}", located.year, located.term),
            }),
        );
        return Ok(LocateDateData {
            semester: format!("{}{}", located.year, located.term),
            week: located.week,
            year: located.year,
            term: located.term,
        });
    }

    client::ensure_session_initialized(&client, session)
        .await
        .map_err(|e| e.to_string())?;
    client::log_step(
        "locate-date:start",
        serde_json::json!({ "cookieNames": client::cookie_names(session) }),
    );
    let result = request_target(
        &client,
        LOCATE_DATE_URL,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Referer", LOGIN_PAGE.to_string()),
        ],
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);

    let text = result.text_lossy();
    let snippet = client::response_snippet(result.body.as_slice());
    let located = match parse_locate_date(&text) {
        Some(found) => found,
        None => {
            client::log_step(
                "locate-date:error",
                serde_json::json!({
                    "reason": "未能从教务处解析当前周数",
                    "status": result.status,
                    "cookieNames": client::cookie_names(session),
                    "snippet": snippet,
                }),
            );
            state.publish_session(epoch, &baseline, session).await;
            return Err("未能从教务处解析当前周数".to_string());
        }
    };
    client::log_step(
        "locate-date:done",
        serde_json::json!({
            "status": result.status,
            "week": located.week,
            "semester": format!("{}{}", located.year, located.term),
            "cookieNames": client::cookie_names(session),
            "snippet": snippet,
        }),
    );
    let outcome = Ok(LocateDateData {
        semester: format!("{}{}", located.year, located.term),
        week: located.week,
        year: located.year,
        term: located.term,
    });
    state.publish_session(epoch, &baseline, session).await;
    outcome
}

// GET /api/school-calendar -> 校历
#[tauri::command]
pub async fn get_school_calendar(
    state: State<'_, AppState>,
    account: String,
) -> Result<SchoolCalendar, String> {
    let account = account.trim().to_string();

    let client = state.client.clone();
    // 只读抓取：取一次会话快照后不再长期占用会话锁
    let SessionSnapshot {
        baseline,
        session: mut snapshot,
        epoch,
    } = state.session_snapshot().await;
    let session: &mut Session = &mut snapshot;

    if is_demo(session, &account) {
        let calendar = demo::demo_calendar();
        client::log_step(
            "demo:school-calendar",
            serde_json::json!({
                "account": account,
                "currentTerm": calendar.current_term,
                "terms": calendar.terms.len(),
            }),
        );
        return Ok(calendar);
    }

    client::ensure_session_initialized(&client, session)
        .await
        .map_err(|e| e.to_string())?;
    client::log_step(
        "school-calendar:start",
        serde_json::json!({ "cookieNames": client::cookie_names(session) }),
    );
    let result = request_target(
        &client,
        SCHOOL_CALENDAR_URL,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Referer", LOGIN_PAGE.to_string()),
        ],
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    client::apply_cookies(session, &result);

    let text = result.text_lossy();
    let snippet = client::response_snippet(result.body.as_slice());
    let calendar = parse_school_calendar(&text);
    if calendar.terms.is_empty() {
        client::log_step(
            "school-calendar:error",
            serde_json::json!({
                "reason": "未能从教务处解析校历",
                "status": result.status,
                "cookieNames": client::cookie_names(session),
                "snippet": snippet,
            }),
        );
        state.publish_session(epoch, &baseline, session).await;
        return Err("未能从教务处解析校历".to_string());
    }
    client::log_step(
        "school-calendar:done",
        serde_json::json!({
            "status": result.status,
            "currentTerm": calendar.current_term,
            "terms": calendar.terms.len(),
            "cookieNames": client::cookie_names(session),
            "snippet": snippet,
        }),
    );
    state.publish_session(epoch, &baseline, session).await;
    Ok(calendar)
}
