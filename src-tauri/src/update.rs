// 应用更新检查（对应 electron/main.cjs 的更新逻辑 + fzu-proxy.mjs 的 update-manifest）。
use std::io::Write;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const UPDATE_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/Jelosy0213/FUU-Desktop/develop/update.json";
const DOWNLOAD_URL_TEMPLATE: &str =
    "https://github.com/Jelosy0213/FUU-Desktop/releases/download/{version}/Setup-{version}.exe";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub ok: bool,
    pub has_update: bool,
    pub current_version: String,
    pub version: String,
    pub download_url: String,
    pub release_notes: String,
}

#[derive(serde::Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    release_notes: String,
}

// 语义化版本比较（支持预发布后缀）：1 表示 a 更新，-1 表示 b 更新，0 表示相同。
fn compare_versions(a: &str, b: &str) -> i32 {
    let (core_a, pre_a) = a.split_once('-').unwrap_or((a, ""));
    let (core_b, pre_b) = b.split_once('-').unwrap_or((b, ""));
    let nums_a: Vec<i32> = core_a.split('.').filter_map(|n| n.parse().ok()).collect();
    let nums_b: Vec<i32> = core_b.split('.').filter_map(|n| n.parse().ok()).collect();
    let len = nums_a.len().max(nums_b.len());
    for i in 0..len {
        let x = nums_a.get(i).copied().unwrap_or(0);
        let y = nums_b.get(i).copied().unwrap_or(0);
        if x > y {
            return 1;
        }
        if x < y {
            return -1;
        }
    }
    match (pre_a.is_empty(), pre_b.is_empty()) {
        (true, false) => 1,
        (false, true) => -1,
        (false, false) => pre_a.cmp(pre_b) as i32,
        (true, true) => 0,
    }
}

#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();

    let client = reqwest::Client::new();
    let manifest: Manifest = client
        .get(UPDATE_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let version = manifest.version.trim().to_string();
    let has_update = compare_versions(&version, &current_version) > 0;
    let download_url = if has_update {
        DOWNLOAD_URL_TEMPLATE.replace("{version}", &version)
    } else {
        String::new()
    };

    Ok(UpdateInfo {
        ok: true,
        has_update,
        current_version,
        version,
        download_url,
        release_notes: manifest.release_notes,
    })
}

// 下载进度与完成事件：与前端 utils/update.ts 的 onUpdateProgress / onUpdateDone 对应
#[derive(Clone, Serialize)]
struct UpdateProgress {
    percent: u32,
}

#[derive(Clone, Serialize)]
struct UpdateDone {
    status: &'static str,
    path: String,
}

/// 在应用内下载更新包并静默安装（不再跳浏览器下载页）。
///
/// 安装器是 Tauri 的 NSIS 安装包，按它的约定调用：`/S` 静默安装、`/R` 安装完成后
/// 重新拉起应用；静默模式下安装器还会自行结束仍在运行的旧进程。
/// 下载失败一律返回错误字符串，由前端把原因显示出来
/// （例如 release 里没有对应安装包会返回 404，这条信息对排查很关键）。
#[tauri::command]
pub async fn download_and_install(app: AppHandle, url: String) -> Result<(), String> {
    // 直接用下载地址里的文件名（即 Setup-<version>.exe），便于和 release 资源对上
    let file_name = url
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "下载地址无效".to_string())?;
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| format!("无法定位缓存目录：{error}"))?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建缓存目录失败：{error}"))?;
    let installer = dir.join(file_name);

    let mut response = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("下载失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载失败：服务器返回 {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&installer).map_err(|error| format!("写入失败：{error}"))?;
    let mut downloaded: u64 = 0;
    let mut reported = u32::MAX;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("下载中断：{error}"))?
    {
        file.write_all(&chunk)
            .map_err(|error| format!("写入失败：{error}"))?;
        downloaded += chunk.len() as u64;
        // 极少情况下拿不到 content-length：此时不报进度，免得在 0% 与 100% 之间乱跳
        let percent = if total == 0 {
            0
        } else {
            (downloaded.saturating_mul(100) / total).min(100) as u32
        };
        if percent != reported {
            reported = percent;
            let _ = app.emit("update-progress", UpdateProgress { percent });
        }
    }
    drop(file);

    let _ = app.emit(
        "update-done",
        UpdateDone {
            status: "completed",
            path: installer.display().to_string(),
        },
    );

    Command::new(&installer)
        .args(["/S", "/R"])
        .spawn()
        .map_err(|error| format!("启动安装程序失败：{error}"))?;

    // 留一点时间让前端把"正在启动安装程序…"画出来，再退出：
    // 安装器要替换本程序的 exe，本进程不能继续占着它
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::compare_versions;

    #[test]
    fn compares_versions() {
        assert_eq!(compare_versions("0.3.6", "0.3.5"), 1);
        assert_eq!(compare_versions("0.2.3", "0.2.3-Alpha"), 1);
        assert_eq!(compare_versions("0.2.3-Alpha", "0.2.3"), -1);
        assert_eq!(compare_versions("1.0.0", "1.0.0"), 0);
    }
}
