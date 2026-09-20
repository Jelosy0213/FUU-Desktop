// 教务登录与 SSO 流程（对应 fzu-proxy.mjs 的 logincheck / findSsoLoginUrl /
// completeLearunSso / visitModule）。
use std::sync::OnceLock;

use anyhow::Result;
use md5::{Digest, Md5};
use regex::Regex;
use reqwest::Method;
use serde::Serialize;
use url::Url;

use crate::jw::client::{
    self, request_target, Client, Session, COURSE_ORIGIN, LOGIN_PAGE, TARGET_ORIGIN,
};

#[derive(Debug, Clone, Serialize)]
pub struct LoginOutcome {
    pub success: bool,
    pub message: String,
    pub status: u16,
}

fn sso_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?i)https?://jwcjwxt2\.fzu\.edu\.cn/ssoLogin\.asp[^'"<>\s]+|ssoLogin\.asp[^'"<>\s]+"#,
        )
        .unwrap()
    })
}

fn alert_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"alert\(['"]([^'"]+)['"]\)"#).unwrap())
}

// JS encodeURIComponent：仅保留非保留字符，其余转 %XX
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~'
            | b'*' | b'\'' | b'(' | b')' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

// JS decodeURIComponent：仅解 %XX
fn decode_uri_component(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h = hex_val(bytes[i + 1]);
            let l = hex_val(bytes[i + 2]);
            if let (Some(h), Some(l)) = (h, l) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

// 对应 normalizeMaybeEncodedUrl：修正 &amp;、去引号、解一次 URL 编码
fn normalize_maybe_encoded_url(value: &str) -> String {
    let normalized = value
        .replace("&amp;", "&")
        .trim_matches(|c| c == '\'' || c == '"' || c == '`')
        .trim()
        .to_string();
    let normalized = decode_uri_component(&normalized);
    if normalized.starts_with("http") {
        normalized
    } else {
        format!(
            "https://jwcjwxt2.fzu.edu.cn/{}",
            normalized.trim_start_matches('/')
        )
    }
}

fn find_sso_login_url(text: &str, location: Option<&str>) -> String {
    let mut source = location.unwrap_or("").to_string();
    if !text.is_empty() {
        if !source.is_empty() {
            source.push('\n');
        }
        source.push_str(text);
    }
    sso_re()
        .find(&source)
        .map(|m| normalize_maybe_encoded_url(m.as_str()))
        .unwrap_or_default()
}

// 完成 Learun SSO 跳转，建立课表域会话，成功返回 true
async fn complete_learun_sso(
    client: &Client,
    session: &mut Session,
    sso_url: &str,
) -> bool {
    if sso_url.is_empty() {
        client::log_step(
            "sso:skip",
            serde_json::json!({ "reason": "未在登录响应中找到 ssoLogin.asp" }),
        );
        return false;
    }

    let login_page = match request_target(
        client,
        sso_url,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Referer", LOGIN_PAGE.to_string()),
        ],
        None,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            client::log_step("sso:error", serde_json::json!({ "error": e.to_string() }));
            return false;
        }
    };
    client::apply_cookies(session, &login_page);

    let parsed = match Url::parse(sso_url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    let token = parsed
        .query_pairs()
        .find(|(k, _)| k == "token")
        .map(|(_, v)| v.into_owned());
    let home_id = parsed
        .query_pairs()
        .find(|(k, _)| k == "id")
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default();
    session.home_id = home_id.clone();

    let home_url = format!(
        "https://jwcjwxt2.fzu.edu.cn/Home/index?id={}&hosturl={}&ssologin=",
        encode_uri_component(&home_id),
        encode_uri_component(COURSE_ORIGIN)
    );
    let home_result = match request_target(
        client,
        &home_url,
        Method::GET,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Referer", sso_url.to_string()),
            ("Upgrade-Insecure-Requests", "1".to_string()),
        ],
        None,
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            client::log_step("sso:home:error", serde_json::json!({ "error": e.to_string() }));
            return false;
        }
    };
    client::apply_cookies(session, &home_result);

    let raw_return_url = parsed
        .query_pairs()
        .find(|(k, _)| k == "returnurl")
        .map(|(_, v)| decode_uri_component(&v));
    let mut return_url = raw_return_url.unwrap_or_default();

    if !return_url.is_empty() {
        if let Ok(mut callback) = Url::parse(&return_url) {
            for name in ["id", "num", "hosturl", "ssourl", "ssologin"] {
                if let Some((_, value)) = parsed.query_pairs().find(|(k, _)| k == name) {
                    callback
                        .query_pairs_mut()
                        .append_pair(name, &value);
                }
            }
            return_url = callback.to_string();
        }
    }

    let token = match token {
        Some(t) if !t.is_empty() => t,
        _ => {
            client::log_step(
                "sso:skip",
                serde_json::json!({ "reason": "ssoLogin.asp 缺少 token" }),
            );
            return false;
        }
    };

    let body = format!("token={}", encode_uri_component(&token));
    let result = match request_target(
        client,
        "https://jwcjwxt2.fzu.edu.cn/Sfrz/SSOLogin",
        Method::POST,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", "https://jwcjwxt2.fzu.edu.cn".to_string()),
            ("Referer", sso_url.to_string()),
            ("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8".to_string()),
            ("X-Requested-With", "XMLHttpRequest".to_string()),
        ],
        Some(body),
    )
    .await
    {
        Ok(r) => r,
        Err(e) => {
            client::log_step("sso:login:error", serde_json::json!({ "error": e.to_string() }));
            return false;
        }
    };
    client::apply_cookies(session, &result);

    let text = result.text_lossy();
    let payload: Option<serde_json::Value> = serde_json::from_str(&text).ok();
    let code = payload
        .as_ref()
        .and_then(|p| p.get("code"))
        .and_then(|c| c.as_i64());
    let success_flag = payload
        .as_ref()
        .and_then(|p| p.get("success"))
        .and_then(|c| c.as_bool());
    let success = matches!(code, Some(200 | 0)) || success_flag == Some(true);

    if success && !return_url.is_empty() {
        if let Ok(return_result) = request_target(
            client,
            &return_url,
            Method::GET,
            &[
                ("Cookie", client::cookie_header(session)),
                ("Host", "jwcjwxt2.fzu.edu.cn:81".to_string()),
                ("Origin", "https://jwcjwxt2.fzu.edu.cn".to_string()),
                ("Referer", sso_url.to_string()),
                ("Upgrade-Insecure-Requests", "1".to_string()),
            ],
            None,
        )
        .await
        {
            client::apply_cookies(session, &return_result);
            let return_location = return_result
                .location()
                .map(|l| normalize_maybe_encoded_url(&l));
            if let Some(loc) = return_location.filter(|l| !l.is_empty()) {
                if let Ok(loc_url) = Url::parse(&loc) {
                    if let Some(redirected_id) = loc_url
                        .query_pairs()
                        .find(|(k, _)| k == "id")
                        .map(|(_, v)| v.into_owned())
                    {
                        if !redirected_id.is_empty() {
                            session.home_id = redirected_id;
                        }
                    }
                }
                if let Ok(redirect_result) = request_target(
                    client,
                    &loc,
                    Method::GET,
                    &[
                        ("Cookie", client::cookie_header(session)),
                        ("Host", "jwcjwxt2.fzu.edu.cn".to_string()),
                        ("Referer", return_url.clone()),
                        ("Upgrade-Insecure-Requests", "1".to_string()),
                    ],
                    None,
                )
                .await
                {
                    client::apply_cookies(session, &redirect_result);
                }
            }
        }
    }

    client::log_step(
        "sso:done",
        serde_json::json!({
            "success": success,
            "status": result.status,
            "homeId": session.home_id,
            "cookieNames": client::cookie_names(session),
        }),
    );

    success
}

// 访问某个模块（我的课表/我的考表/学历信息），激活模块会话
pub async fn visit_module(
    client: &Client,
    session: &mut Session,
    account: &str,
    module_name: &str,
    module_url: &str,
) -> Result<()> {
    let home_id = if session.home_id.is_empty() {
        account.to_string()
    } else {
        session.home_id.clone()
    };
    let body = format!(
        "moduleName={}&moduleUrl={}",
        encode_uri_component(module_name),
        encode_uri_component(module_url)
    );
    let referer = format!(
        "https://jwcjwxt2.fzu.edu.cn/Home/index?id={}&hosturl={}&ssologin=",
        encode_uri_component(&home_id),
        encode_uri_component(COURSE_ORIGIN)
    );
    let result = request_target(
        client,
        "https://jwcjwxt2.fzu.edu.cn/Home/VisitModule",
        Method::POST,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", "https://jwcjwxt2.fzu.edu.cn".to_string()),
            ("Referer", referer),
            ("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8".to_string()),
            ("X-Requested-With", "XMLHttpRequest".to_string()),
            ("account", account.to_string()),
        ],
        Some(body),
    )
    .await?;
    client::apply_cookies(session, &result);
    client::log_step(
        "module:visit:done",
        serde_json::json!({
            "module": module_name,
            "status": result.status,
            "cookieNames": client::cookie_names(session),
        }),
    );
    Ok(())
}

// 教务登录：MD5 密码切片 + logincheck.asp + SSO 跳转
pub async fn login(
    client: &Client,
    session: &mut Session,
    username: &str,
    password: &str,
    verify_code: &str,
) -> Result<LoginOutcome> {
    client::ensure_session_initialized(client, session).await?;

    let full_md5 = hex::encode(Md5::digest(password.as_bytes()));
    let sliced = &full_md5[8..24];

    client::log_step(
        "login:start",
        serde_json::json!({
            "username": username,
            "passwordHashLen": sliced.len(),
            "verifyCodeLen": verify_code.len(),
            "cookieNames": client::cookie_names(session),
        }),
    );

    let body = format!(
        "muser={}&passwd={}&Verifycode={}",
        encode_uri_component(username),
        encode_uri_component(sliced),
        encode_uri_component(verify_code)
    );
    let result = request_target(
        client,
        "/logincheck.asp",
        Method::POST,
        &[
            ("Cookie", client::cookie_header(session)),
            ("Origin", TARGET_ORIGIN.to_string()),
            ("Referer", LOGIN_PAGE.to_string()),
            ("Content-Type", "application/x-www-form-urlencoded".to_string()),
        ],
        Some(body),
    )
    .await?;
    client::apply_cookies(session, &result);

    let text = result.text_lossy();
    let location = result.location();
    let sso_url = find_sso_login_url(&text, location.as_deref());
    let alert_message = alert_re()
        .captures(&text)
        .map(|caps| caps[1].to_string())
        .unwrap_or_default();

    let failed = ["验证码", "密码", "用户名", "登录失败", "错误", "失败"]
        .iter()
        .any(|kw| text.contains(kw));

    if !failed && !sso_url.is_empty() {
        complete_learun_sso(client, session, &sso_url).await;
    }

    client::log_step(
        "login:done",
        serde_json::json!({
            "status": result.status,
            "failed": failed,
            "ssoUrl": sso_url,
            "alertMessage": alert_message,
            "cookieNames": client::cookie_names(session),
            "snippet": client::response_snippet(&result.body),
        }),
    );

    Ok(LoginOutcome {
        success: !failed,
        message: if failed {
            if alert_message.is_empty() {
                "登录失败，请检查账号、密码或验证码".to_string()
            } else {
                alert_message
            }
        } else {
            "登录成功".to_string()
        },
        status: result.status,
    })
}
