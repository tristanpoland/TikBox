use tauri::{command, State, WindowUrl};
use tauri::Runtime;
use tauri::{Manager, Window, WindowBuilder};
use serde::{Deserialize, Serialize};
use reqwest::{Client, header};
use tokio::time::{sleep, Duration};
use std::collections::HashSet;
use std::sync::Mutex;
use std::path::PathBuf;
use url::Url;
use base64::{Engine as _, engine::general_purpose::URL_SAFE};
use sha2::{Sha256, Digest};

// Configuration constants
const CLIENT_KEY: &str = "awwtdnz1mrxrtmoh"; // Replace with your TikTok client key
const CLIENT_SECRET: &str = "azwutsrLx2pKd9dyMbIyF3ZexzaJV0jA"; // Replace with your TikTok client secret
const REDIRECT_URI: &str = "tiktok-downloader://oauth/callback";

// Structures
#[derive(Debug, Serialize, Deserialize)]
struct TikTokVideo {
    id: String,
    desc: String,
    create_time: i64,
    video_url: String,
    author: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DownloadProgress {
    total: usize,
    current: usize,
    current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OAuthState {
    verifier: String,
    state: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OAuthResponse {
    access_token: String,
    refresh_token: String,
    scope: String,
    token_type: String,
    expires_in: i32,
}

struct AppState {
    client: Client,
    downloaded_ids: Mutex<HashSet<String>>,
    oauth_state: Mutex<Option<OAuthState>>,
}

#[derive(Debug, Deserialize)]
struct CookieCheck {
    cookie: String,
    url: String,
}

// PKCE and OAuth helper functions
fn generate_code_verifier() -> String {
    let random_bytes: Vec<u8> = (0..32).map(|_| rand::random::<u8>()).collect();
    URL_SAFE.encode(random_bytes)
}

fn generate_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    URL_SAFE.encode(result)
}

fn generate_state() -> String {
    let random_bytes: Vec<u8> = (0..16).map(|_| rand::random::<u8>()).collect();
    URL_SAFE.encode(random_bytes)
}

// Commands
#[command]
async fn initiate_oauth<R: Runtime>(
    window: Window<R>, 
    state: State<'_, AppState>
) -> Result<(), String> {
    let code_verifier = generate_code_verifier();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state_param = generate_state();

    let oauth_state = OAuthState {
        verifier: code_verifier,
        state: state_param.clone(),
    };
    *state.oauth_state.lock().unwrap() = Some(oauth_state);

    let oauth_url = Url::parse_with_params(
        "https://www.tiktok.com/auth/authorize/",
        &[
            ("client_key", CLIENT_KEY),
            ("scope", "user.info.basic,video.list"),
            ("response_type", "code"),
            ("redirect_uri", REDIRECT_URI),
            ("code_challenge", &code_challenge),
            ("code_challenge_method", "S256"),
            ("state", &state_param),
        ],
    ).map_err(|e| e.to_string())?;

    let oauth_window = WindowBuilder::new(
        &window.app_handle(),
        "oauth",
        WindowUrl::External(oauth_url)
    )
    .title("TikTok Authorization")
    .center()
    .inner_size(800.0, 600.0)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
async fn handle_oauth_callback(
    window: Window,
    state: State<'_, AppState>,
    code: String,
    returned_state: String,
) -> Result<OAuthResponse, String> {
    let stored_state = state.oauth_state.lock().unwrap()
        .as_ref()
        .ok_or_else(|| "No stored OAuth state".to_string())?
        .clone();

    if stored_state.state != returned_state {
        return Err("Invalid state parameter".to_string());
    }

    let token_response = state.client
        .post("https://open-api.tiktok.com/oauth/access_token/")
        .form(&[
            ("client_key", CLIENT_KEY),
            ("client_secret", CLIENT_SECRET),
            ("code", &code),
            ("grant_type", "authorization_code"),
            ("code_verifier", &stored_state.verifier),
            ("redirect_uri", REDIRECT_URI),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let response_status = token_response.status();
    let response_text = token_response.text().await.map_err(|e| e.to_string())?;

    if !response_status.is_success() {
        return Err(format!("Token exchange failed: {}", response_text));
    }

    let token_data: OAuthResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(oauth_window) = window.get_window("oauth") {
        oauth_window.close().map_err(|e| e.to_string())?;
    }

    Ok(token_data)
}

#[command]
async fn fetch_liked_videos(
    state: State<'_, AppState>,
    access_token: String,
    max_count: Option<u32>
) -> Result<Vec<TikTokVideo>, String> {
    let client = &state.client;
    let mut videos = Vec::new();
    let mut cursor = 0;
    let max_count = max_count.unwrap_or(100);
    
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION, 
        format!("Bearer {}", access_token).parse().unwrap()
    );
    
    while (videos.len() as u32) < max_count {
        let url = format!(
            "https://open.tiktokapis.com/v2/video/list/",
        );
        
        let response = client
            .get(&url)
            .headers(headers.clone())
            .send()
            .await
            .map_err(|e| e.to_string())?;
            
        let data = response.json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())?;
            
        if let Some(items) = data["data"]["videos"].as_array() {
            if items.is_empty() {
                break;
            }
            
            for item in items {
                let video = TikTokVideo {
                    id: item["id"].as_str().unwrap_or_default().to_string(),
                    desc: item["title"].as_str().unwrap_or_default().to_string(),
                    create_time: item["create_time"].as_i64().unwrap_or_default(),
                    video_url: item["video"]["play_addr"]["url_list"][0]
                        .as_str()
                        .unwrap_or_default()
                        .to_string(),
                    author: item["author"]["nickname"].as_str().unwrap_or_default().to_string(),
                };
                
                let mut downloaded_ids = state.downloaded_ids.lock().unwrap();
                if !downloaded_ids.contains(&video.id) {
                    downloaded_ids.insert(video.id.clone());
                    videos.push(video);
                }
            }
            
            cursor += 30;
            
            // Check if we have a next cursor
            if !data["data"]["has_more"].as_bool().unwrap_or(false) {
                break;
            }
        } else {
            break;
        }
        
        sleep(Duration::from_millis(500)).await;
    }
    
    Ok(videos)
}

#[command]
async fn download_videos(
    state: State<'_, AppState>,
    videos: Vec<TikTokVideo>,
    download_path: String,
    batch_size: Option<usize>,
    delay_ms: Option<u64>,
    window: Window,
) -> Result<(), String> {
    let batch_size = batch_size.unwrap_or(10);
    let delay_ms = delay_ms.unwrap_or(1000);
    let download_path = PathBuf::from(download_path);
    
    for (i, chunk) in videos.chunks(batch_size).enumerate() {
        for (j, video) in chunk.iter().enumerate() {
            let progress = DownloadProgress {
                total: videos.len(),
                current: i * batch_size + j,
                current_file: video.desc.clone(),
            };
            
            window.emit("download-progress", &progress)
                .map_err(|e| e.to_string())?;
            
            let response = state.client
                .get(&video.video_url)
                .send()
                .await
                .map_err(|e| e.to_string())?;
                
            let bytes = response.bytes()
                .await
                .map_err(|e| e.to_string())?;
                
            let filename = format!(
                "{}_{}_{}.mp4",
                video.author,
                video.id,
                sanitize_filename::sanitize(&video.desc)
            );
            let mut file_path = download_path.clone();
            file_path.push(&filename);
            
            tokio::fs::write(&file_path, bytes)
                .await
                .map_err(|e| e.to_string())?;
        }
        
        if i < videos.chunks(batch_size).len() - 1 {
            sleep(Duration::from_millis(delay_ms)).await;
        }
    }
    
    Ok(())
}

#[command]
async fn refresh_token(
    state: State<'_, AppState>,
    refresh_token: String
) -> Result<OAuthResponse, String> {
    let token_response = state.client
        .post("https://open-api.tiktok.com/oauth/refresh_token/")
        .form(&[
            ("client_key", CLIENT_KEY),
            ("client_secret", CLIENT_SECRET),
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !token_response.status().is_success() {
        return Err("Token refresh failed".to_string());
    }

    let token_data: OAuthResponse = token_response.json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    Ok(token_data)
}

#[tokio::main]
async fn main() {
    let client = Client::builder()
        .user_agent("TikTok-Downloader/1.0")
        .build()
        .unwrap();
        
    let app_state = AppState {
        client,
        downloaded_ids: Mutex::new(HashSet::new()),
        oauth_state: Mutex::new(None),
    };
    
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            initiate_oauth,
            handle_oauth_callback,
            refresh_token,
            fetch_liked_videos,
            download_videos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}