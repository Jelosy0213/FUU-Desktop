// 应用更新检查（对应 electron/main.cjs 的更新逻辑 + fzu-proxy.mjs 的 update-manifest）。
use serde::Serialize;
use tauri::AppHandle;

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

// 用系统默认方式打开 URL（下载更新包、跳转 GitHub 等）
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    opener::open(url).map_err(|e| e.to_string())
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
