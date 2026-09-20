// 教务处 HTTP 客户端与内存会话（对应 fzu-proxy.mjs 的 requestTarget /
// applyCookies / session 管理）。全部请求手动管理 cookie、手动处理重定向，
// 因为 SSO 流程需要读取中间 302 的 location 与 set-cookie。
use std::collections::HashMap;
use std::time::Instant;

use anyhow::{Context, Result};
use reqwest::header::{HeaderMap, SET_COOKIE};
use reqwest::Method;
pub use reqwest::Client;

pub const TARGET_ORIGIN: &str = "https://jwcjwxt2.fzu.edu.cn:82";
pub const COURSE_ORIGIN: &str = "https://jwcjwxt2.fzu.edu.cn:81";
pub const LOGIN_PAGE: &str = "https://jwcjwxt2.fzu.edu.cn:82/login.htm";
pub const COURSE_PATH: &str = "/student/xkjg/wdkb/kb_xs.aspx";
pub const EXAM_PATH: &str = "/student/xkjg/examination/exam_list.aspx";
pub const PROFILE_PATH: &str = "/student/hdxx/xmpy_cszt.aspx";
pub const LOCATE_DATE_URL: &str = "https://jwcjwxt2.fzu.edu.cn:82/week.asp";
pub const SCHOOL_CALENDAR_URL: &str = "https://jwcjwxt2.fzu.edu.cn:82/xl.asp";

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

#[derive(Debug, Default, Clone)]
pub struct Session {
    pub cookies: HashMap<String, String>,
    pub initialized: bool,
    pub course_initialized: bool,
    pub home_id: String,
    pub demo: bool,
}

#[derive(Debug, Clone)]
pub struct TargetResponse {
    pub status: u16,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl TargetResponse {
    pub fn text_lossy(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn location(&self) -> Option<String> {
        self.headers
            .get(reqwest::header::LOCATION)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    }
}

// 禁用自动重定向：SSO 流程需要手动跟随 302 并观察 set-cookie / location。
pub fn build_client() -> Client {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
        .build()
        .expect("构建 HTTP 客户端失败")
}

// 发请求：path 为完整 URL 或相对 TARGET_ORIGIN 的路径；headers 为额外请求头。
pub async fn request_target(
    client: &Client,
    path: &str,
    method: Method,
    headers: &[(&str, String)],
    body: Option<String>,
) -> Result<TargetResponse> {
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{}{}", TARGET_ORIGIN, path)
    };

    log_step(
        "http:start",
        serde_json::json!({
            "method": method.as_str(),
            "url": url,
            "bodyBytes": body.as_ref().map_or(0, |b| b.len()),
        }),
    );

    let mut req = client.request(method, &url);
    for (name, value) in headers {
        // Content-Length 交给 reqwest 按 body 自动计算，避免与手动值冲突。
        if name.eq_ignore_ascii_case("content-length") {
            continue;
        }
        req = req.header(*name, value);
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let started = Instant::now();
    let resp = req.send().await.with_context(|| format!("请求失败：{url}"))?;
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let body = resp.bytes().await.context("读取响应体失败")?.to_vec();
    let response = TargetResponse {
        status,
        headers,
        body,
    };

    log_step(
        "http:done",
        serde_json::json!({
            "status": response.status,
            "elapsedMs": started.elapsed().as_millis() as u64,
            "contentType": header_value(&response.headers, reqwest::header::CONTENT_TYPE),
            "bodyBytes": response.body.len(),
            "location": response.location(),
        }),
    );

    Ok(response)
}

fn header_value(headers: &HeaderMap, name: reqwest::header::HeaderName) -> String {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string()
}

// 从 Set-Cookie 头提取 name=value（丢弃 Path/HttpOnly 等属性）
pub fn apply_cookies(session: &mut Session, response: &TargetResponse) -> Vec<String> {
    let mut names = Vec::new();
    for value in response.headers.get_all(SET_COOKIE) {
        if let Ok(v) = value.to_str() {
            let pair = v.split(';').next().unwrap_or("");
            if let Some(sep) = pair.find('=') {
                if sep > 0 {
                    let name = pair[..sep].to_string();
                    let val = pair[sep + 1..].to_string();
                    session.cookies.insert(name.clone(), val);
                    names.push(name);
                }
            }
        }
    }
    names
}

pub fn cookie_header(session: &Session) -> String {
    session
        .cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

// 日志辅助：Tauri 下输出到 stderr，便于控制台排查。
// 格式对齐 Electron 版 fzu-proxy.mjs 的 `[时间戳] label {结构化数据}`
pub fn log_step(label: &str, payload: impl std::fmt::Display) {
    eprintln!(
        "[{}] {label} {payload}",
        chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f")
    );
}

// cookie 名称列表（不含值）：用于观察会话状态，避免把凭据写进日志
pub fn cookie_names(session: &Session) -> Vec<String> {
    let mut names: Vec<String> = session.cookies.keys().cloned().collect();
    names.sort();
    names
}

pub fn response_snippet(body: &[u8]) -> String {
    String::from_utf8_lossy(body)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(500)
        .collect()
}

// 首次访问登录页，建立基础会话 cookie
pub async fn ensure_session_initialized(
    client: &Client,
    session: &mut Session,
) -> Result<()> {
    if session.initialized {
        return Ok(());
    }
    let result = request_target(
        client,
        "/login.htm",
        Method::GET,
        &[
            ("Cookie", cookie_header(session)),
            ("Referer", LOGIN_PAGE.to_string()),
        ],
        None,
    )
    .await?;
    apply_cookies(session, &result);
    session.initialized = true;
    log_step(
        "session:init",
        serde_json::json!({ "status": result.status, "cookieNames": cookie_names(session) }),
    );
    Ok(())
}

// 首次访问课表站（:81）根路径，建立课表域会话 cookie
pub async fn ensure_course_session_initialized(
    client: &Client,
    session: &mut Session,
) -> Result<()> {
    if session.course_initialized {
        return Ok(());
    }
    let result = request_target(
        client,
        COURSE_ORIGIN,
        Method::GET,
        &[
            ("Cookie", cookie_header(session)),
            ("Referer", TARGET_ORIGIN.to_string()),
            ("Upgrade-Insecure-Requests", "1".to_string()),
        ],
        None,
    )
    .await?;
    apply_cookies(session, &result);
    session.course_initialized = true;
    log_step(
        "course-session:init",
        serde_json::json!({ "status": result.status, "cookieNames": cookie_names(session) }),
    );
    Ok(())
}

// 全局状态：HTTP 客户端 + 教务会话。
//
// 会话必须是全局唯一的：教务系统的验证码与登录态都绑定在同一个会话 cookie 上，
// 若按账号分桶，"登录页拉验证码时会话 A、提交登录时会话 B"会因验证码状态不匹配而
// 必然登录失败（表现为"第一次验证码总是错的，第二次才对"）。
// 与原 Electron 版一致：同一浏览器上下文只维持一个教务处会话。
//
// 但"全局唯一"不等于"必须串行执行"：登录/验证码这类会改写会话身份的流程需要独占锁，
// 而课表/考表/周数这类只读抓取只要拿到会话快照即可并行（见 session_snapshot）。
// 否则前端一次刷新并发发出的几个命令会在锁上排队，总耗时变成"各请求之和"。
pub struct AppState {
    pub client: Client,
    pub session: tokio::sync::Mutex<Session>,
    /// 会话代次：登录流程开始时自增。在途的抓取持有旧代次，回写时会被丢弃，
    /// 避免把登录后的新会话覆盖回登录前的旧 cookie
    epoch: std::sync::atomic::AtomicU64,
}

/// 抓取用的会话快照：baseline 用于回写时判断"本命令改了哪些 cookie"，
/// session 是本命令实际操作的副本
pub struct SessionSnapshot {
    pub baseline: Session,
    pub session: Session,
    pub epoch: u64,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            client: build_client(),
            session: tokio::sync::Mutex::new(Session::default()),
            epoch: std::sync::atomic::AtomicU64::new(0),
        }
    }

    /// 独占会话：登录、拉验证码等必须成串执行的流程使用，整段持有
    pub async fn lock_session(&self) -> tokio::sync::MutexGuard<'_, Session> {
        self.session.lock().await
    }

    /// 进入登录流程：代次自增，使在途抓取的快照作废
    pub fn begin_auth(&self) {
        self.epoch.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }

    fn epoch(&self) -> u64 {
        self.epoch.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// 取会话快照：只在拷贝期间短暂加锁，之后整段 HTTP 流程不再占锁，
    /// 使多个只读抓取命令可以真正并发
    pub async fn session_snapshot(&self) -> SessionSnapshot {
        let guard = self.session.lock().await;
        SessionSnapshot {
            baseline: guard.clone(),
            session: guard.clone(),
            epoch: self.epoch(),
        }
    }

    /// 抓取结束后回写：逐项 compare-and-swap，只合并本命令真正改动过、
    /// 且期间没被其他请求改写过的 cookie；代次变化（期间登录过）则整体丢弃
    pub async fn publish_session(&self, epoch: u64, baseline: &Session, local: &Session) {
        if self.epoch() != epoch {
            return;
        }
        let mut guard = self.session.lock().await;
        // 拿到锁后再确认一次：等待期间可能已经开始了新的登录
        if self.epoch() != epoch {
            return;
        }
        for (name, value) in &local.cookies {
            // 本命令没改动这个 cookie：不回写，避免把并发请求写入的新值覆盖成旧值
            if baseline.cookies.get(name) == Some(value) {
                continue;
            }
            // 期间没人改过这个 cookie 才写入
            if guard.cookies.get(name) == baseline.cookies.get(name) {
                guard.cookies.insert(name.clone(), value.clone());
            }
        }
        guard.initialized |= local.initialized;
        guard.course_initialized |= local.course_initialized;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 造一个只含会话 cookie 的映射
    fn session_cookies(value: &str) -> HashMap<String, String> {
        HashMap::from([("ASP.NET_SessionId".to_string(), value.to_string())])
    }

    async fn shared_cookie(state: &AppState) -> Option<String> {
        state
            .lock_session()
            .await
            .cookies
            .get("ASP.NET_SessionId")
            .cloned()
    }

    // 常规路径：本次抓取改到的 cookie 与初始化标志会合并回共享会话
    #[tokio::test]
    async fn publish_merges_changed_cookies_and_flags() {
        let state = AppState::new();
        let snapshot = state.session_snapshot().await;
        let mut local = snapshot.session;
        local.cookies = session_cookies("new");
        local.course_initialized = true;

        state
            .publish_session(snapshot.epoch, &snapshot.baseline, &local)
            .await;

        assert_eq!(shared_cookie(&state).await.as_deref(), Some("new"));
        assert!(state.lock_session().await.course_initialized);
    }

    // 抓取期间发生过登录：旧快照必须整体丢弃，不能把登录态覆盖回来
    #[tokio::test]
    async fn publish_drops_snapshot_taken_before_login() {
        let state = AppState::new();
        let snapshot = state.session_snapshot().await;
        let mut local = snapshot.session;
        local.cookies = session_cookies("stale");

        state.begin_auth();
        state
            .publish_session(snapshot.epoch, &snapshot.baseline, &local)
            .await;

        assert_eq!(shared_cookie(&state).await, None);
    }

    // 两个并发抓取：后回写的那个不能把先写入的新值退回旧值
    #[tokio::test]
    async fn publish_does_not_revert_newer_concurrent_cookie() {
        let state = AppState::new();
        state.lock_session().await.cookies = session_cookies("old");

        let first = state.session_snapshot().await;
        let second = state.session_snapshot().await;

        let mut newer = second.session;
        newer.cookies = session_cookies("newer");
        state
            .publish_session(second.epoch, &second.baseline, &newer)
            .await;

        let mut stale = first.session;
        stale.cookies = session_cookies("stale");
        state
            .publish_session(first.epoch, &first.baseline, &stale)
            .await;

        assert_eq!(shared_cookie(&state).await.as_deref(), Some("newer"));
    }
}
