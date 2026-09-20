// Tauri 桌面端入口：多窗口管理（登录窗/主窗/迷你窗/忘记密码窗）、命令注册与全局状态。
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{
    utils::config::WindowEffectsConfig, window::Effect, AppHandle, Emitter, Manager,
    PhysicalPosition, Theme, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

mod jw;
mod update;

use jw::client::AppState;
use jw::commands;

const LOGIN_W: (f64, f64) = (320.0, 570.0);
const MAIN_W: (f64, f64) = (1000.0, 700.0);
const MINI_W: (f64, f64) = (400.0, 500.0);
const FORGOT_W: (f64, f64) = (1080.0, 760.0);
// 忘记密码窗口直接打开教务处的重置密码页（不再走本地页面）
const FORGOT_URL: &str = "https://jwcjwxt2.fzu.edu.cn/Login/ReSetPassWord";
// 启用 Mica 云母的窗口（迷你窗宽度小、效果有限，但确实也是无边框窗，同样让它透出云母）
const MICA_WINDOWS: [&str; 2] = ["main", "mini"];

// Windows 11 从 build 22000 开始
const WINDOWS_11_BUILD: u32 = 22_000;

// 只做版本号比较，便于单测（注册表读取单独放在 mica_supported 里）
fn build_is_windows_11(build: &str) -> bool {
    build
        .trim()
        .parse::<u32>()
        .is_ok_and(|build| build >= WINDOWS_11_BUILD)
}

// Mica 云母只在 Windows 11（build >= 22000）可用：更低版本的 DWM 不认这个 backdrop，
// 而透明窗口在没有 backdrop 时会把桌面直接透出来，所以必须先判断再决定窗口要不要透明。
// 注意不能用 ProductName 判断——从 Win10 升级上来的 Win11，该项仍写着 "Windows 10"。
#[cfg(windows)]
fn mica_supported() -> bool {
    windows_registry::LOCAL_MACHINE
        .open(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .and_then(|key| key.get_string("CurrentBuildNumber"))
        .is_ok_and(|build| build_is_windows_11(&build))
}

#[cfg(not(windows))]
fn mica_supported() -> bool {
    false
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct Credentials {
    pub(crate) username: String,
    pub(crate) password: String,
}

// ===== 窗口创建 =====

fn base_builder<'a>(
    app: &'a AppHandle,
    label: &str,
    url: &str,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("福UU")
        .decorations(false)
}

// 统一的窗口创建：不再吞掉 build 错误，否则窗口会以空白状态存在且无从排查
fn build_window(
    builder: WebviewWindowBuilder<'_, tauri::Wry, AppHandle>,
    label: &str,
) -> Option<WebviewWindow> {
    match builder.build() {
        Ok(window) => Some(window),
        Err(error) => {
            eprintln!("[window] 创建 {label} 窗口失败：{error}");
            None
        }
    }
}

// 按系统能力给窗口加上云母背景（仅 Win11）：窗口必须透明——WebView2 的底色是不透明的，
// 不透明就会把 DWM 画在窗口后面的云母完全盖住；页面侧还要配合让出底色，
// 见 src/styles/backdrop.css。判断条件与 window_backdrop 命令保持一致，
// 否则会出现"页面以为有云母、窗口其实不透明"的白屏。
fn with_backdrop<'a>(
    label: &str,
    builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    if MICA_WINDOWS.contains(&label) && mica_supported() {
        builder.transparent(true).effects(WindowEffectsConfig {
            effects: vec![Effect::Mica],
            ..Default::default()
        })
    } else {
        builder
    }
}

fn create_login_window(app: &AppHandle) {
    if app.get_webview_window("login").is_some() {
        return;
    }
    let builder = base_builder(app, "login", "index.html")
        .inner_size(LOGIN_W.0, LOGIN_W.1)
        .resizable(false)
        .maximizable(false)
        .minimizable(true);
    build_window(builder, "login");
}

fn create_main_window(app: &AppHandle) {
    if app.get_webview_window("main").is_some() {
        return;
    }
    let builder = with_backdrop(
        "main",
        base_builder(app, "main", "index.html")
            .inner_size(MAIN_W.0, MAIN_W.1)
            .min_inner_size(990.0, 670.0)
            .resizable(true),
    );
    build_window(builder, "main");
}

fn create_mini_window(app: &AppHandle) {
    if app.get_webview_window("mini").is_some() {
        return;
    }
    let builder = with_backdrop(
        "mini",
        base_builder(app, "mini", "index.html")
            .inner_size(MINI_W.0, MINI_W.1)
            .resizable(false)
            .maximizable(false)
            .minimizable(true),
    );
    build_window(builder, "mini");
}

// 忘记密码窗口：整个窗口就是教务处的重置密码页。
// 注意这里不用 base_builder —— 远程页面无法承载无边框窗口的自定义标题栏
// （拖动、最小化/关闭按钮都在本地页面里），所以保留系统原生标题栏。
fn create_forgot_window(app: &AppHandle) {
    if app.get_webview_window("forgot").is_some() {
        return;
    }
    let url = match Url::parse(FORGOT_URL) {
        Ok(url) => url,
        Err(error) => {
            eprintln!("[window] 重置密码页地址无效：{error}");
            return;
        }
    };
    let builder = WebviewWindowBuilder::new(app, "forgot", WebviewUrl::External(url))
        .title("重置密码")
        .inner_size(FORGOT_W.0, FORGOT_W.1)
        .resizable(true);
    build_window(builder, "forgot");
}

// 迷你窗口贴合主窗口右上角
fn mini_position(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let main = app.get_webview_window("main")?;
    let pos = main.outer_position().ok()?;
    let size = main.inner_size().ok()?;
    Some(PhysicalPosition::new(
        pos.x + size.width as i32 - MINI_W.0 as i32,
        pos.y,
    ))
}

// ===== 窗口切换命令 =====
//
// 这些命令必须声明为 async：同步命令在 IPC 回调（主线程）里执行，此时创建窗口会在
// 调用方 webview 的消息回调中嵌套创建新的 webview，新窗口拿不到消息循环后果是
// 停留在 about:blank（白屏）；同理关闭调用方窗口也会失效。
// 声明为 async 后命令体在异步运行时线程执行，IPC 回调先返回，窗口操作再投递到主线程。

#[tauri::command]
async fn show_login(app: AppHandle) {
    create_login_window(&app);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.close();
    }
    if let Some(w) = app.get_webview_window("login") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
async fn show_main(app: AppHandle) {
    // 先关登录窗、再建主窗：前端据"当前进程里有几个窗口"判断自己是不是本次启动的第一个窗口
    // （第一个窗口负责把课表定位到本周），这里保持同一时序可避免它被误判为后续窗口
    if let Some(w) = app.get_webview_window("login") {
        let _ = w.close();
    }
    create_main_window(&app);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    write_window_mode(&app, "main");
}

// 当前进程里已有几个窗口：前端启动时据此判断自己是不是"本次启动的第一个窗口"。
// 第一个窗口负责把课表定位到本周，之后创建的窗口继承当前展示周。
#[tauri::command]
fn window_count(app: AppHandle) -> usize {
    app.webview_windows().len()
}

// 展示周变化时广播给所有窗口：让隐藏着的另一窗口也一起切换（前端按幂等处理，相同值会忽略）
#[tauri::command]
fn notify_week_changed(app: AppHandle, week: u32) {
    if let Err(error) = app.emit("week-changed", week) {
        eprintln!("[window] 广播展示周失败：{error}");
    }
}

#[tauri::command]
async fn enter_mini(app: AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    create_mini_window(&app);
    if let Some(mini) = app.get_webview_window("mini") {
        if let Some(pos) = mini_position(&app) {
            let _ = mini.set_position(pos);
        }
        let _ = mini.show();
        let _ = mini.set_focus();
        // 告诉迷你窗"自己被重新显示了"：它据此同步缓存并按需刷新数据。
        // 不用焦点事件，是因为在小窗里操作会反复触发焦点事件，会让每次交互都拉一轮教务数据
        let _ = app.emit("mini-shown", ());
    }
    // 隐藏主窗口：不再吞掉错误（原来用 let _ = 时失败完全无声）
    if let Err(error) = main.hide() {
        eprintln!("[window] 隐藏主窗口失败：{error}");
    }
    write_window_mode(&app, "mini");
}

#[tauri::command]
async fn exit_mini(app: AppHandle) {
    create_main_window(&app);
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    // 迷你窗只隐藏、不销毁：重建一个 webview 意味着整页重载（Vue 应用 + 课表数据），
    // 来回切换的代价远大于保留一个窗口。真正关闭迷你窗仍然等同于退出应用（见 window_close），
    // 而主窗关闭时会连带清掉隐藏的迷你窗，避免进程留着没有入口的隐藏窗口。
    if let Some(w) = app.get_webview_window("mini") {
        if let Err(error) = w.hide() {
            eprintln!("[window] 隐藏迷你窗口失败：{error}");
        }
    }
    write_window_mode(&app, "main");
}

#[tauri::command]
async fn open_forgot(app: AppHandle) {
    create_forgot_window(&app);
    if let Some(w) = app.get_webview_window("forgot") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ===== 窗口控制命令 =====

#[tauri::command]
fn window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn window_toggle_maximize(window: WebviewWindow) -> Result<bool, String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    Ok(!is_max)
}

#[tauri::command]
async fn window_close(window: WebviewWindow) {
    // 迷你窗口是从"已隐藏的主窗口"切出来的，单独关掉它会让隐藏的主窗口残留、
    // 进程又无法退出且没有入口唤回，因此关闭迷你窗等同于退出应用。
    if window.label() == "mini" {
        if let Some(main) = window.app_handle().get_webview_window("main") {
            let _ = main.close();
        }
    }
    // 反过来同理：迷你窗平时只隐藏不销毁，关掉主窗时必须一并清掉它，
    // 否则进程会带着一个无法唤回的隐藏窗口继续活着
    if window.label() == "main" {
        if let Some(mini) = window.app_handle().get_webview_window("mini") {
            let _ = mini.close();
        }
    }
    let _ = window.close();
}

// 当前窗口的背景材质：mica（Win11 云母，页面据此让出底色）或 solid（保持原不透明配色）
#[tauri::command]
fn window_backdrop(window: WebviewWindow) -> &'static str {
    if MICA_WINDOWS.contains(&window.label()) && mica_supported() {
        "mica"
    } else {
        "solid"
    }
}

// 把设置里选定的主题同步给原生窗口。云母是 DWM 按**窗口主题**着色的：
// 只切页面不切窗口，会出现"深色界面压在浅色云母上"（或反之）的错配。
// theme 为 None 表示交回系统决定，对应设置里的"系统"档。
#[tauri::command]
fn set_window_theme(window: WebviewWindow, theme: Option<String>) -> Result<(), String> {
    let theme = match theme.as_deref() {
        Some("light") => Some(Theme::Light),
        Some("dark") => Some(Theme::Dark),
        _ => None,
    };
    window.set_theme(theme).map_err(|error| error.to_string())
}

// 主题变化时广播给所有窗口：主题偏好存在 localStorage，每个窗口各有一份 store，
// 不同步的话隐藏中的窗口（主窗/迷你窗）会停留在旧主题，重新显示时云母与页面对不上
#[tauri::command]
fn notify_theme_changed(app: AppHandle, theme: String) {
    if let Err(error) = app.emit("theme-changed", theme) {
        eprintln!("[window] 广播主题失败：{error}");
    }
}

// ===== 凭据（系统凭据库） =====
//
// 账号密码存放在系统凭据库（Windows 为凭据管理器，底层为 DPAPI，密钥由当前系统用户凭据派生；
// macOS 为钥匙串），磁盘上不再有明文文件，其他系统用户即使读到存储也无法解密。
//
// 凭据只允许 Rust 侧读取：重新登录由 relogin_with_remembered 在 Rust 内部完成，
// 不提供任何把密码回传前端的命令。前端只能问"有没有存过凭据"和"存的是哪个账号"。

const KEYRING_SERVICE: &str = "com.fzu.helper";
const KEYRING_ACCOUNT: &str = "fzu-credentials";

fn keyring_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()
}

/// 读取凭据。仅供 Rust 内部使用（重新登录），不暴露为命令
pub(crate) fn read_credentials() -> Option<Credentials> {
    let raw = keyring_entry()?.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_credentials(username: &str, password: &str) -> bool {
    let Some(entry) = keyring_entry() else {
        return false;
    };
    let payload = Credentials {
        username: username.to_string(),
        password: password.to_string(),
    };
    match serde_json::to_string(&payload) {
        Ok(raw) => entry.set_password(&raw).is_ok(),
        Err(_) => false,
    }
}

fn clear_credentials() -> bool {
    let Some(entry) = keyring_entry() else {
        return false;
    };
    // 凭据本就不存在时同样视为清除成功
    matches!(entry.delete_credential(), Ok(()) | Err(keyring::Error::NoEntry))
}

fn data_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok()
}

/// 旧版明文凭据文件路径，仅用于一次性迁移
fn legacy_credentials_path(app: &AppHandle) -> Option<PathBuf> {
    data_dir(app).map(|d| d.join("fzu-credentials.json"))
}

/// 把旧版明文文件中的凭据搬进系统凭据库，成功后删除明文文件。
/// 搬运失败时保留原文件，避免用户被锁在外面。
fn migrate_legacy_credentials(app: &AppHandle) {
    let Some(path) = legacy_credentials_path(app) else {
        return;
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return;
    };
    match serde_json::from_str::<Credentials>(&raw) {
        Ok(legacy) => {
            if write_credentials(&legacy.username, &legacy.password) {
                let _ = fs::remove_file(&path);
            }
        }
        // 内容已损坏且无法解析：直接删除，不留明文残留
        Err(_) => {
            let _ = fs::remove_file(&path);
        }
    }
}

#[tauri::command]
fn credentials_set(username: String, password: String) -> bool {
    write_credentials(&username, &password)
}

#[tauri::command]
fn credentials_clear() -> bool {
    clear_credentials()
}

/// 是否保存过凭据（前端据此决定能否直接走"记住密码"的重新登录）
#[tauri::command]
fn remembers_credentials() -> bool {
    read_credentials().is_some()
}

/// 已保存凭据对应的账号名。账号本身不是秘密，用于登录页预填与提示文案
#[tauri::command]
fn remembered_username() -> Option<String> {
    read_credentials().map(|c| c.username)
}

// ===== 本地标记（窗口记忆、主动退出）=====

fn flag_path(app: &AppHandle, name: &str) -> Option<PathBuf> {
    data_dir(app).map(|d| d.join(name))
}

fn read_flag(app: &AppHandle, name: &str, default: bool) -> bool {
    flag_path(app, name)
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|v| v.trim() != "0")
        .unwrap_or(default)
}

fn write_flag(app: &AppHandle, name: &str, enabled: bool) {
    if let Some(dir) = data_dir(app) {
        let _ = fs::create_dir_all(&dir);
    }
    if let Some(p) = flag_path(app, name) {
        let _ = fs::write(p, if enabled { "1" } else { "0" });
    }
}

fn read_window_mode(app: &AppHandle) -> &'static str {
    let is_mini = flag_path(app, "fzu-window-mode")
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|v| v.trim() == "mini")
        .unwrap_or(false);
    if is_mini {
        "mini"
    } else {
        "main"
    }
}

fn write_window_mode(app: &AppHandle, mode: &str) {
    if let Some(dir) = data_dir(app) {
        let _ = fs::create_dir_all(&dir);
    }
    if let Some(p) = flag_path(app, "fzu-window-mode") {
        let _ = fs::write(p, if mode == "mini" { "mini" } else { "main" });
    }
}

#[tauri::command]
fn set_explicit_logout(app: AppHandle, enabled: bool) {
    write_flag(&app, "fzu-explicit-logout", enabled);
}

#[tauri::command]
fn set_window_memory(app: AppHandle, enabled: bool) {
    write_flag(&app, "fzu-window-memory", enabled);
}

// 启动时决定初始窗口：有凭据且非主动退出 → 主窗；否则登录窗。
fn initial_window(app: &AppHandle) {
    let explicit_logout = read_flag(app, "fzu-explicit-logout", false);
    let has_credentials = read_credentials().is_some();
    if has_credentials && !explicit_logout {
        if read_flag(app, "fzu-window-memory", true) && read_window_mode(app) == "mini" {
            create_mini_window(app);
        } else {
            create_main_window(app);
        }
    } else {
        create_login_window(app);
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            // 一次性把旧版明文凭据文件搬进系统凭据库
            migrate_legacy_credentials(app.handle());
            initial_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // jw 业务命令
            commands::get_captcha,
            commands::login,
            commands::relogin_with_remembered,
            commands::get_course_page,
            commands::get_exam_list,
            commands::get_profile,
            commands::get_locate_date,
            commands::get_school_calendar,
            // 窗口切换
            show_login,
            show_main,
            enter_mini,
            exit_mini,
            open_forgot,
            // 窗口控制
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_backdrop,
            set_window_theme,
            notify_theme_changed,
            window_count,
            notify_week_changed,
            // 凭据与标记
            credentials_set,
            credentials_clear,
            remembers_credentials,
            remembered_username,
            set_explicit_logout,
            set_window_memory,
            // 更新
            update::check_update,
            update::open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::build_is_windows_11;

    #[test]
    fn detects_windows_11_by_build_number() {
        assert!(build_is_windows_11("22621")); // Win11 22H2
        assert!(build_is_windows_11("22000")); // 下限
        assert!(build_is_windows_11(" 22621 ")); // 注册表值可能带空白
        assert!(!build_is_windows_11("19045")); // Win10 22H2
        assert!(!build_is_windows_11(""));
        assert!(!build_is_windows_11("unknown"));
    }
}
