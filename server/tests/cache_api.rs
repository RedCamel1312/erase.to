//! Real HTTP + Valkey integration tests. Run with CACHE_URL pointing at an isolated cache.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use erase_server::{
    build_router,
    config::Config,
    error::ApiError,
    protocol::{
        Header, MAX_CONTENT_BYTES, MAX_PACKET_BYTES, MAX_TEXT_BYTES, digest, parse_packet,
        random_token, token_hash, verify_work,
    },
    store::Store,
};
use redis::aio::MultiplexedConnection;
use reqwest::{Client, Response, StatusCode};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    process::{Child, Command, Stdio},
    time::Duration,
};
use tokio::{net::TcpListener, task::JoinHandle};

struct Note {
    packet: Vec<u8>,
    header: Header,
    peek: String,
    read: String,
    revoke: String,
}
impl Note {
    fn new(views: u32) -> Self {
        let peek = random_token().unwrap();
        let read = random_token().unwrap();
        let revoke = random_token().unwrap();
        let header = Header {
            version: 1,
            id: random_token().unwrap(),
            ttl: 60,
            views,
            peek: token_hash(&peek).unwrap(),
            read: token_hash(&read).unwrap(),
            revoke: token_hash(&revoke).unwrap(),
            kdf: "none".into(),
            salt: String::new(),
            nonce: URL_SAFE_NO_PAD.encode([1_u8; 24]),
        };
        let encoded = serde_json::to_vec(&header).unwrap();
        let mut packet = b"ERS1".to_vec();
        packet.extend_from_slice(&(encoded.len() as u32).to_be_bytes());
        packet.extend_from_slice(&encoded);
        packet.resize(packet.len() + 4112, 42);
        Self {
            packet,
            header,
            peek,
            read,
            revoke,
        }
    }
}

struct TestApp {
    config: Config,
    urls: Vec<String>,
    client: Client,
    admin: MultiplexedConnection,
    tasks: Vec<JoinHandle<()>>,
    _directory: tempfile::TempDir,
}

impl TestApp {
    async fn new(change: impl FnOnce(&mut Config)) -> Self {
        let cache_url = std::env::var("CACHE_URL")
            .expect("Set CACHE_URL to an isolated Valkey before integration tests.");
        let mut config = Config::new("http://erase.test", cache_url.clone()).unwrap();
        config.prefix = format!("test:{{{}}}:", random_token().unwrap());
        config.pow_bits = 4;
        config.require_safe_cache = false;
        config.max_in_flight = 256;
        config.request_rate = 100000;
        config.challenge_rate = 100000;
        config.create_rate = 100000;
        config.cache_timeout = Duration::from_secs(5);
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(
            directory.path().join("index.html"),
            "<!doctype html><title>erase.to</title>",
        )
        .unwrap();
        std::fs::create_dir(directory.path().join("assets")).unwrap();
        std::fs::write(
            directory.path().join("assets/app.js"),
            "export const ready=true;",
        )
        .unwrap();
        std::fs::write(
            directory.path().join("assets/private.map"),
            "PRIVATE SOURCE",
        )
        .unwrap();
        config.static_dir = directory.path().to_path_buf();
        change(&mut config);
        let mut urls = Vec::new();
        let mut tasks = Vec::new();
        for _ in 0..2 {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            urls.push(format!("http://{}", listener.local_addr().unwrap()));
            let app = build_router(config.clone()).await.unwrap();
            tasks.push(tokio::spawn(async move {
                axum::serve(listener, app).await.unwrap();
            }));
        }
        let admin = redis::Client::open(cache_url)
            .unwrap()
            .get_multiplexed_async_connection()
            .await
            .unwrap();
        Self {
            config,
            urls,
            client: Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap(),
            admin,
            tasks,
            _directory: directory,
        }
    }
    fn request(
        &self,
        instance: usize,
        method: reqwest::Method,
        route: &str,
    ) -> reqwest::RequestBuilder {
        self.client
            .request(method, format!("{}{route}", self.urls[instance]))
            .header("Host", "erase.test")
            .header("Origin", "http://erase.test")
    }
    async fn proof(&self, packet: &[u8]) -> (String, String) {
        let response = self
            .request(0, reqwest::Method::GET, "/api/challenge")
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let data: Value = response.json().await.unwrap();
        let challenge = data["challenge"].as_str().unwrap().to_owned();
        let bits = data["bits"].as_u64().unwrap() as u8;
        let mut nonce = 0_u64;
        let prefix = format!("{challenge}.{}.", digest(packet));
        loop {
            let hash = Sha256::digest(format!("{prefix}{nonce}").as_bytes());
            let full = usize::from(bits / 8);
            let remaining = bits % 8;
            if hash[..full].iter().all(|byte| *byte == 0)
                && (remaining == 0 || hash[full] >> (8 - remaining) == 0)
            {
                break;
            }
            nonce += 1;
        }
        assert!(verify_work(&challenge, &nonce.to_string(), packet, bits));
        (challenge, nonce.to_string())
    }
    async fn upload(&self, note: &Note, proof: &(String, String)) -> Response {
        self.upload_to(0, note, proof).await
    }
    async fn upload_to(&self, instance: usize, note: &Note, proof: &(String, String)) -> Response {
        self.request(instance, reqwest::Method::POST, "/api/notes")
            .header("Content-Type", "application/octet-stream")
            .header("X-Erase-Challenge", &proof.0)
            .header("X-Erase-Nonce", &proof.1)
            .body(note.packet.clone())
            .send()
            .await
            .unwrap()
    }
    async fn create(&self, note: &Note) -> (String, String) {
        let proof = self.proof(&note.packet).await;
        let response = self.upload(note, &proof).await;
        assert_eq!(
            response.status(),
            StatusCode::CREATED,
            "{}",
            response.text().await.unwrap()
        );
        proof
    }
    async fn access(&self, instance: usize, id: &str, suffix: &str, token: &str) -> Response {
        let method = if suffix.is_empty() {
            reqwest::Method::DELETE
        } else {
            reqwest::Method::POST
        };
        self.request(instance, method, &format!("/api/notes/{id}{suffix}"))
            .json(&json!({"token": token}))
            .send()
            .await
            .unwrap()
    }
    async fn clear_namespace(&mut self) {
        let mut cursor = 0_u64;
        loop {
            let (next, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(format!("{}*", self.config.prefix))
                .arg("COUNT")
                .arg(1000)
                .query_async(&mut self.admin)
                .await
                .unwrap();
            if !keys.is_empty() {
                let _: u64 = redis::cmd("DEL")
                    .arg(keys)
                    .query_async(&mut self.admin)
                    .await
                    .unwrap();
            }
            cursor = next;
            if cursor == 0 {
                break;
            }
        }
    }
    async fn finish(mut self) {
        for task in &self.tasks {
            task.abort();
        }
        self.clear_namespace().await;
    }
}
impl Drop for TestApp {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort();
        }
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_parallel_full_size_packets_survive_upload_and_consuming_delivery() {
    let app = TestApp::new(|config| {
        config.max_in_flight = 2;
        config.cache_timeout = Duration::from_secs(10);
    })
    .await;
    let limits: Value = app
        .request(0, reqwest::Method::GET, "/api/config")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(limits["max_content_bytes"], MAX_CONTENT_BYTES);
    assert_eq!(limits["max_text_bytes"], MAX_TEXT_BYTES);
    fn full_size_note() -> Note {
        let mut note = Note::new(1);
        note.header.ttl = 600;
        let header = serde_json::to_vec(&note.header).unwrap();
        note.packet.truncate(4);
        note.packet
            .extend_from_slice(&(header.len() as u32).to_be_bytes());
        note.packet.extend_from_slice(&header);
        note.packet
            .resize(8 + header.len() + MAX_CONTENT_BYTES + 4096 + 16, 42);
        assert!(note.packet.len() < MAX_PACKET_BYTES);
        note
    }
    let first = full_size_note();
    let second = full_size_note();
    let (first_proof, second_proof) =
        tokio::join!(app.proof(&first.packet), app.proof(&second.packet));
    let (first_created, second_created) = tokio::join!(
        app.upload(&first, &first_proof),
        app.upload_to(1, &second, &second_proof)
    );
    if first_created.status() != StatusCode::CREATED
        || second_created.status() != StatusCode::CREATED
    {
        let mut admin = app.admin.clone();
        for section in ["memory", "errorstats"] {
            let info: String = redis::cmd("INFO")
                .arg(section)
                .query_async(&mut admin)
                .await
                .unwrap();
            eprintln!("Isolated full-size fixture {section}: {info}");
        }
    }
    assert_eq!(first_created.status(), StatusCode::CREATED);
    assert_eq!(second_created.status(), StatusCode::CREATED);
    drop(first_created);
    drop(second_created);
    // 256 MiB admission holds three full-size records including their overhead.
    let third = full_size_note();
    app.create(&third).await;
    let third_id = third.header.id.clone();
    let third_revoke = third.revoke.clone();
    let third_read = third.read.clone();
    let third_peek = third.peek.clone();
    drop(third);
    let fourth = full_size_note();
    let fourth_proof = app.proof(&fourth.packet).await;
    assert_eq!(
        app.upload(&fourth, &fourth_proof).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let (first_read, second_read) = tokio::join!(
        app.access(0, &first.header.id, "/open", &first.read),
        app.access(0, &second.header.id, "/open", &second.read)
    );
    // Both full-size responses have sent headers. Their slow readers retain
    // both packet slots. Bad tokens still fail authorization before admission.
    assert_eq!(
        app.access(0, &third_id, "/open", &first.read)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    // The third note has only one view. Denying its authorized open for
    // capacity must leave that view available for later.
    assert_eq!(
        app.access(0, &third_id, "/open", &third_read)
            .await
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let metadata: Value = app
        .access(0, &third_id, "/meta", &third_peek)
        .await
        .json()
        .await
        .unwrap();
    assert_eq!(metadata["remaining"], 1);
    async fn read(response: Response, note: &Note) {
        assert_eq!(response.status(), StatusCode::OK);
        let delivered = response.bytes().await.unwrap();
        assert_eq!(delivered.len(), note.packet.len());
        assert_eq!(digest(&delivered), digest(&note.packet));
    }
    tokio::join!(read(first_read, &first), read(second_read, &second));
    for note in [&first, &second] {
        assert_eq!(
            app.access(1, &note.header.id, "/open", &note.read)
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }
    // The refused creation did not spend its proof; capacity reclaimed by opening
    // is immediately available without a cache reset or a fresh challenge.
    assert_eq!(
        app.upload(&fourth, &fourth_proof).await.status(),
        StatusCode::CREATED
    );
    assert_eq!(
        app.access(0, &third_id, "", &third_revoke).await.status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.access(0, &fourth.header.id, "", &fourth.revoke)
            .await
            .status(),
        StatusCode::NO_CONTENT
    );
    app.finish().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_independent_instances_allow_exactly_the_configured_number_of_opens() {
    let app = TestApp::new(|_| {}).await;
    for views in [1, 7] {
        let note = Note::new(views);
        app.create(&note).await;
        let wrong = app
            .access(1, &note.header.id, "/open", &random_token().unwrap())
            .await;
        assert_eq!(wrong.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            app.access(0, &note.header.id, "/meta", &note.read)
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
        let meta: Value = app
            .access(1, &note.header.id, "/meta", &note.peek)
            .await
            .json()
            .await
            .unwrap();
        assert_eq!(meta["remaining"], views);
        assert!(meta.get("packet").is_none());
        assert_eq!(
            URL_SAFE_NO_PAD
                .decode(meta["header"].as_str().unwrap())
                .unwrap(),
            serde_json::to_vec(&note.header).unwrap()
        );
        let mut requests = Vec::new();
        for i in 0..100 {
            let request = app
                .request(
                    i % 2,
                    reqwest::Method::POST,
                    &format!("/api/notes/{}/open", note.header.id),
                )
                .json(&json!({"token": note.read}));
            requests.push(tokio::spawn(async move {
                let response = request.send().await.unwrap();
                (response.status(), response.bytes().await.unwrap())
            }));
        }
        let mut successes = 0;
        for request in requests {
            let (status, bytes) = request.await.unwrap();
            match status {
                StatusCode::OK => {
                    successes += 1;
                    assert_eq!(bytes.as_ref(), note.packet);
                }
                StatusCode::NOT_FOUND => {}
                _ => panic!("Unexpected open status: {status}"),
            }
        }
        assert_eq!(successes, views);
        assert_eq!(
            app.access(0, &note.header.id, "/meta", &note.peek)
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
    }
    app.finish().await;
}

#[tokio::test]
async fn sender_revocation_and_wrong_capabilities_do_not_leak_or_consume() {
    let app = TestApp::new(|_| {}).await;
    let note = Note::new(5);
    app.create(&note).await;
    assert_eq!(
        app.access(0, &note.header.id, "", &note.read)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.access(1, &note.header.id, "/open", &note.revoke)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        app.access(1, &note.header.id, "", &note.revoke)
            .await
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.access(0, &note.header.id, "/open", &note.read)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    app.finish().await;
}

#[tokio::test]
async fn stalled_upload_returns_request_timeout_without_spending_its_proof() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let app = TestApp::new(|config| config.request_timeout = Duration::from_millis(250)).await;
    let note = Note::new(1);
    let proof = app.proof(&note.packet).await;
    let mut socket = tokio::net::TcpStream::connect(app.urls[0].trim_start_matches("http://"))
        .await
        .unwrap();
    let headers = format!(
        "POST /api/notes HTTP/1.1\r\nHost: erase.test\r\nOrigin: http://erase.test\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nX-Erase-Challenge: {}\r\nX-Erase-Nonce: {}\r\nConnection: close\r\n\r\n",
        note.packet.len(),
        proof.0,
        proof.1,
    );
    socket.write_all(headers.as_bytes()).await.unwrap();
    socket.write_all(&note.packet[..8]).await.unwrap();
    let mut response = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), socket.read_to_end(&mut response))
        .await
        .unwrap()
        .unwrap();
    let response = String::from_utf8(response).unwrap();
    assert!(response.starts_with("HTTP/1.1 504 "), "{response}");
    assert!(response.contains("\"error\":\"request_timeout\""));
    assert!(!response.to_ascii_lowercase().contains("retry-after:"));
    assert!(response.contains("no-store"));
    assert_eq!(
        app.access(1, &note.header.id, "/meta", &note.peek)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    // An explicit later attempt can reuse this proof because the incomplete body
    // never reached the consuming creation script. Clients do not retry automatically.
    assert_eq!(
        app.upload(&note, &proof).await.status(),
        StatusCode::CREATED
    );
    app.finish().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn atomic_replay_spending_and_capacity_failure_preserve_unspent_proof() {
    let app = TestApp::new(|config| config.max_notes = 1).await;
    let first = Note::new(1);
    let proof = app.proof(&first.packet).await;
    let mut requests = Vec::new();
    for i in 0..20 {
        let request = app
            .request(i % 2, reqwest::Method::POST, "/api/notes")
            .header("Content-Type", "application/octet-stream")
            .header("X-Erase-Challenge", &proof.0)
            .header("X-Erase-Nonce", &proof.1)
            .body(first.packet.clone());
        requests.push(tokio::spawn(async move {
            request.send().await.unwrap().status()
        }));
    }
    let mut created = 0;
    for request in requests {
        match request.await.unwrap() {
            StatusCode::CREATED => created += 1,
            StatusCode::CONFLICT => {}
            status => panic!("Unexpected replay status: {status}"),
        }
    }
    assert_eq!(created, 1);
    let second = Note::new(1);
    let second_proof = app.proof(&second.packet).await;
    assert_eq!(
        app.upload(&second, &second_proof).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        app.access(1, &first.header.id, "", &first.revoke)
            .await
            .status(),
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        app.upload(&second, &second_proof).await.status(),
        StatusCode::CREATED
    );
    assert_eq!(
        app.upload(&second, &second_proof)
            .await
            .json::<Value>()
            .await
            .unwrap()["error"],
        "proof_reused"
    );
    app.finish().await;
}

#[tokio::test]
async fn collision_does_not_overwrite_or_spend_the_new_challenge() {
    let app = TestApp::new(|_| {}).await;
    let note = Note::new(2);
    app.create(&note).await;
    let proof = app.proof(&note.packet).await;
    assert_eq!(
        app.upload(&note, &proof)
            .await
            .json::<Value>()
            .await
            .unwrap()["error"],
        "id_conflict"
    );
    assert_eq!(
        app.access(1, &note.header.id, "/open", &note.read)
            .await
            .bytes()
            .await
            .unwrap()
            .as_ref(),
        note.packet
    );
    let other = Note::new(1);
    let mut nonce = 0;
    while !verify_work(
        &proof.0,
        &nonce.to_string(),
        &other.packet,
        app.config.pow_bits,
    ) {
        nonce += 1;
    }
    assert_eq!(
        app.upload(&other, &(proof.0, nonce.to_string()))
            .await
            .status(),
        StatusCode::CREATED
    );
    app.finish().await;
}

#[tokio::test]
async fn native_expiry_and_reaper_release_storage_and_old_proof_dies_after_cache_clear() {
    let mut app = TestApp::new(|config| config.max_notes = 1).await;
    let note = Note::new(1);
    let proof = app.create(&note).await;
    let note_key = format!("{}note:{}", app.config.prefix, note.header.id);
    // Accelerate the test record's expiry without weakening production's 60-second minimum.
    let _: i64 = redis::cmd("PEXPIRE")
        .arg(&note_key)
        .arg(1)
        .query_async(&mut app.admin)
        .await
        .unwrap();
    let _: i64 = redis::cmd("ZADD")
        .arg(format!("{}notes", app.config.prefix))
        .arg(1)
        .arg(&note.header.id)
        .query_async(&mut app.admin)
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;
    assert_eq!(
        app.access(1, &note.header.id, "/meta", &note.peek)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    let other = Note::new(1);
    app.create(&other).await;
    app.clear_namespace().await;
    assert_eq!(
        app.upload(&note, &proof)
            .await
            .json::<Value>()
            .await
            .unwrap()["error"],
        "proof_invalid"
    );
    assert_eq!(
        app.access(0, &other.header.id, "/open", &other.read)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    app.finish().await;
}

#[tokio::test]
async fn challenge_cap_expiry_rate_limit_and_payload_binding_are_enforced() {
    let mut app = TestApp::new(|config| {
        config.max_challenges = 1;
        config.challenge_rate = 1;
        config.challenge_seconds = 2;
    })
    .await;
    let note = Note::new(1);
    let proof = app.proof(&note.packet).await;
    assert_eq!(
        app.request(0, reqwest::Method::GET, "/api/challenge")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        app.request(1, reqwest::Method::GET, "/api/challenge")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    let mut altered = Note::new(1);
    while verify_work(&proof.0, &proof.1, &altered.packet, app.config.pow_bits) {
        altered = Note::new(1);
    }
    assert_eq!(
        app.upload(&altered, &proof)
            .await
            .json::<Value>()
            .await
            .unwrap()["error"],
        "proof_invalid"
    );
    tokio::time::sleep(Duration::from_millis(2100)).await;
    assert_eq!(
        app.upload(&note, &proof)
            .await
            .json::<Value>()
            .await
            .unwrap()["error"],
        "proof_invalid"
    );
    assert_eq!(
        app.request(0, reqwest::Method::GET, "/api/challenge")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    app.clear_namespace().await;
    app.finish().await;
}

#[tokio::test]
async fn challenge_flood_and_unknown_routes_leave_an_independent_access_budget() {
    let mut app = TestApp::new(|config| config.request_rate = 4).await;
    let note = Note::new(1);
    app.create(&note).await;
    let mut public_limited = false;
    for i in 0..12 {
        let status = app
            .request(i % 2, reqwest::Method::GET, "/api/challenge")
            .send()
            .await
            .unwrap()
            .status();
        if status == StatusCode::TOO_MANY_REQUESTS {
            public_limited = true;
            break;
        }
        assert_eq!(status, StatusCode::OK);
    }
    assert!(public_limited);
    for (method, path, status) in [
        (
            reqwest::Method::POST,
            "/api/notes/invalid/open".to_owned(),
            StatusCode::NOT_FOUND,
        ),
        (
            reqwest::Method::GET,
            format!("/api/notes/{}/open", note.header.id),
            StatusCode::BAD_REQUEST,
        ),
        (
            reqwest::Method::POST,
            format!("/api/notes/{}/other", note.header.id),
            StatusCode::NOT_FOUND,
        ),
        (
            reqwest::Method::HEAD,
            "/api/challenge".to_owned(),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        assert_eq!(
            app.request(0, method, &path).send().await.unwrap().status(),
            status
        );
    }
    let touched: i64 = redis::cmd("EXISTS")
        .arg(format!("{}rate:access", app.config.prefix))
        .query_async(&mut app.admin)
        .await
        .unwrap();
    assert_eq!(touched, 0);
    assert_eq!(
        app.access(1, &note.header.id, "/meta", &note.peek)
            .await
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.access(0, &note.header.id, "/open", &note.read)
            .await
            .bytes()
            .await
            .unwrap()
            .as_ref(),
        note.packet
    );
    // Correctly shaped requests with invalid capabilities are rate-limited
    // across instances, including when they target random, nonexistent notes.
    let mut access_limited = false;
    for i in 0..12 {
        let status = app
            .access(i % 2, &random_token().unwrap(), "/meta", &note.peek)
            .await
            .status();
        if status == StatusCode::TOO_MANY_REQUESTS {
            access_limited = true;
            break;
        }
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
    assert!(access_limited);
    app.finish().await;
}

#[tokio::test]
async fn a_stalled_upload_cannot_spend_the_recipient_packet_reserve() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let app = TestApp::new(|config| config.max_in_flight = 2).await;
    let existing = Note::new(1);
    app.create(&existing).await;
    let pending = Note::new(1);
    let proof = app.proof(&pending.packet).await;
    let mut socket = tokio::net::TcpStream::connect(app.urls[0].trim_start_matches("http://"))
        .await
        .unwrap();
    let headers = format!(
        "POST /api/notes HTTP/1.1\r\nHost: erase.test\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nX-Erase-Challenge: {}\r\nX-Erase-Nonce: {}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n",
        pending.packet.len(),
        proof.0,
        proof.1,
    );
    socket.write_all(headers.as_bytes()).await.unwrap();
    // Hyper emits 100 Continue when the handler starts polling the body. At
    // that point the upload owns both its upload slot and a shared packet slot.
    let mut ack = [0; b"HTTP/1.1 100 Continue\r\n\r\n".len()];
    tokio::time::timeout(Duration::from_secs(5), socket.read_exact(&mut ack))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(&ack, b"HTTP/1.1 100 Continue\r\n\r\n");
    assert_eq!(
        app.upload(&pending, &proof).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        app.access(0, &existing.header.id, "/meta", &existing.peek)
            .await
            .status(),
        StatusCode::OK
    );
    let response = app
        .access(0, &existing.header.id, "/open", &existing.read)
        .await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.bytes().await.unwrap().as_ref(), existing.packet);
    assert_eq!(
        app.access(1, &existing.header.id, "/open", &existing.read)
            .await
            .status(),
        StatusCode::NOT_FOUND
    );
    socket.write_all(&pending.packet).await.unwrap();
    let mut response = Vec::new();
    socket.read_to_end(&mut response).await.unwrap();
    assert!(response.starts_with(b"HTTP/1.1 201 "));
    app.finish().await;
}

#[tokio::test]
async fn byte_budget_rejects_without_orphan_and_security_headers_and_sources_are_restricted() {
    let mut app = TestApp::new(|config| config.max_storage_bytes = 1024).await;
    let note = Note::new(1);
    let proof = app.proof(&note.packet).await;
    assert_eq!(
        app.upload(&note, &proof).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    let exists: i64 = redis::cmd("EXISTS")
        .arg(format!("{}note:{}", app.config.prefix, note.header.id))
        .query_async(&mut app.admin)
        .await
        .unwrap();
    assert_eq!(exists, 0);
    let lease: i64 = redis::cmd("EXISTS")
        .arg(format!("{}challenge:{}", app.config.prefix, proof.0))
        .query_async(&mut app.admin)
        .await
        .unwrap();
    assert_eq!(lease, 1);
    let response = app
        .request(0, reqwest::Method::GET, "/")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let csp = response.headers()["content-security-policy"]
        .to_str()
        .unwrap();
    assert!(csp.contains("form-action 'none'"));
    assert!(!csp.contains("'unsafe-inline'"));
    assert!(!csp.contains("'unsafe-eval'"));
    assert!(
        response.headers()["cache-control"]
            .to_str()
            .unwrap()
            .contains("no-store")
    );
    assert_eq!(response.headers()["referrer-policy"], "no-referrer");
    assert!(!response.headers().contains_key("set-cookie"));
    for route in [
        "/.git/config",
        "/server/src/main.rs",
        "/assets/private.map",
        "/assets/%2e%2e/private.map",
        "/api/unknown",
    ] {
        assert_eq!(
            app.request(0, reqwest::Method::GET, route)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
    }
    assert_eq!(
        app.request(0, reqwest::Method::GET, "/assets/app.js")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        app.request(0, reqwest::Method::GET, "/api/config")
            .header("Sec-Fetch-Site", "cross-site")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.request(0, reqwest::Method::GET, "/api/config")
            .header("Sec-Fetch-Site", "same-site")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.client
            .get(format!("{}/api/config", app.urls[0]))
            .header("Host", "erase.test")
            .header("Origin", "https://evil.example")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        app.client
            .get(format!("{}/api/config", app.urls[0]))
            .header("Host", "evil.example")
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::FORBIDDEN
    );
    let contact = app
        .request(0, reqwest::Method::GET, "/.well-known/security.txt")
        .send()
        .await
        .unwrap();
    assert_eq!(contact.status(), StatusCode::OK);
    assert!(
        contact
            .text()
            .await
            .unwrap()
            .contains("Contact: https://github.com/RedCamel1312/erase.to/security/policy")
    );
    let too_large = app
        .request(0, reqwest::Method::POST, "/api/notes")
        .header("Content-Type", "application/octet-stream")
        .header("X-Erase-Challenge", &proof.0)
        .header("X-Erase-Nonce", &proof.1)
        .body(vec![0_u8; MAX_PACKET_BYTES + 1])
        .send()
        .await
        .unwrap();
    assert_eq!(too_large.status(), StatusCode::PAYLOAD_TOO_LARGE);
    app.finish().await;
}

struct Children(Vec<Child>);
impl Drop for Children {
    fn drop(&mut self) {
        for child in &mut self.0 {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tokio::test]
async fn cache_write_failure_after_hash_creation_rolls_back_record_and_does_not_spend_proof() {
    let mut app = TestApp::new(|_| {}).await;
    let note = Note::new(1);
    let proof = app.proof(&note.packet).await;
    let user = format!("erase-test-{}", random_token().unwrap());
    let password = random_token().unwrap();
    let mut acl = redis::cmd("ACL");
    acl.arg("SETUSER")
        .arg(&user)
        .arg("reset")
        .arg("on")
        .arg(format!(">{password}"))
        .arg(format!("~{}*", app.config.prefix));
    for permission in [
        "+ping",
        "+auth",
        "+client|setinfo",
        "+client|setname",
        "+eval",
        "+get",
        "+set",
        "+hget",
        "+hset",
        "+hdel",
        "+hlen",
        "+hexists",
        "+hmget",
        "+hincrby",
        "+exists",
        "+type",
        "+del",
        "+zadd",
        "+zrem",
        "+zcard",
        "+zrangebyscore",
        "+zremrangebyscore",
        "+time",
        "+pexpire",
    ] {
        acl.arg(permission);
    }
    // EXPIREAT is deliberately denied; HSET succeeds first inside the create script.
    let _: String = acl.query_async(&mut app.admin).await.unwrap();
    let mut config = app.config.clone();
    let mut url = url::Url::parse(&config.cache_url).unwrap();
    if matches!(url.scheme(), "redis+unix" | "valkey+unix" | "unix") {
        url.query_pairs_mut()
            .append_pair("user", &user)
            .append_pair("pass", &password);
    } else {
        url.set_username(&user).unwrap();
        url.set_password(Some(&password)).unwrap();
    }
    config.cache_url = url.to_string();
    let restricted = Store::new(config).await.unwrap();
    let packet = parse_packet(note.packet.clone().into()).unwrap();
    assert!(matches!(
        restricted.create(packet, &proof.0).await,
        Err(ApiError::Capacity)
    ));
    let note_exists: i64 = redis::cmd("EXISTS")
        .arg(format!("{}note:{}", app.config.prefix, note.header.id))
        .query_async(&mut app.admin)
        .await
        .unwrap();
    let spent_exists: i64 = redis::cmd("EXISTS")
        .arg(format!("{}spent:{}", app.config.prefix, proof.0))
        .query_async(&mut app.admin)
        .await
        .unwrap();
    let lease_exists: i64 = redis::cmd("EXISTS")
        .arg(format!("{}challenge:{}", app.config.prefix, proof.0))
        .query_async(&mut app.admin)
        .await
        .unwrap();
    assert_eq!(note_exists, 0);
    assert_eq!(spent_exists, 0);
    assert_eq!(lease_exists, 1);
    assert_eq!(
        app.upload(&note, &proof).await.status(),
        StatusCode::CREATED
    );
    drop(restricted);
    let _: i64 = redis::cmd("ACL")
        .arg("DELUSER")
        .arg(user)
        .query_async(&mut app.admin)
        .await
        .unwrap();
    app.finish().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn two_operating_system_processes_share_atomic_consumption() {
    let app = TestApp::new(|_| {}).await;
    let mut processes = Children(Vec::new());
    let mut urls = Vec::new();
    for _ in 0..2 {
        let reservation = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = reservation.local_addr().unwrap();
        drop(reservation);
        let child = Command::new(env!("CARGO_BIN_EXE_erase-server"))
            .env("BIND", address.to_string())
            .env("CACHE_URL", &app.config.cache_url)
            .env("PUBLIC_ORIGINS", "http://erase.test")
            .env("CACHE_PREFIX", &app.config.prefix)
            .env("STATIC_DIR", &app.config.static_dir)
            .env("REQUIRE_SAFE_CACHE", "false")
            .env("POW_BITS", "4")
            .env("MAX_IN_FLIGHT", "256")
            .env("REQUESTS_PER_SECOND", "100000")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        processes.0.push(child);
        let url = format!("http://{address}");
        let mut ready = false;
        for _ in 0..100 {
            if app
                .client
                .get(format!("{url}/healthz"))
                .send()
                .await
                .is_ok_and(|response| response.status() == StatusCode::OK)
            {
                ready = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(ready, "Child server did not become ready.");
        urls.push(url);
    }
    let note = Note::new(1);
    app.create(&note).await;
    let mut requests = Vec::new();
    for i in 0..100 {
        let request = app
            .client
            .post(format!("{}/api/notes/{}/open", urls[i % 2], note.header.id))
            .header("Host", "erase.test")
            .header("Origin", "http://erase.test")
            .json(&json!({"token": note.read}));
        requests.push(tokio::spawn(async move {
            request.send().await.unwrap().status()
        }));
    }
    let mut successes = 0;
    for request in requests {
        match request.await.unwrap() {
            StatusCode::OK => successes += 1,
            StatusCode::NOT_FOUND => {}
            status => panic!("Unexpected multi-process result: {status}"),
        }
    }
    assert_eq!(successes, 1);
    drop(processes);
    app.finish().await;
}
