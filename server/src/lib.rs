pub mod cache;
pub mod config;
pub mod error;
pub mod protocol;
pub mod store;
pub mod transport;

use crate::{
    config::Config,
    error::ApiError,
    protocol::{
        MAX_CONTENT_BYTES, MAX_PACKET_BYTES, MAX_TEXT_BYTES, parse_packet, token_hash, valid_id,
        verify_work,
    },
    store::Store,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use bytes::Bytes;
use http_body::{Body as HttpBody, Frame, SizeHint};
use serde::Deserialize;
use std::{
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tower_http::services::ServeDir;

#[derive(Clone)]
struct AppState {
    store: Arc<Store>,
    public_controls: Arc<Semaphore>,
    access_controls: Arc<Semaphore>,
    uploads: Arc<Semaphore>,
    packets: Arc<Semaphore>,
    static_slots: Arc<Semaphore>,
}

fn take_slot(slots: &Arc<Semaphore>) -> Result<OwnedSemaphorePermit, ApiError> {
    slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| ApiError::Capacity)
}

impl AppState {
    async fn public_admission(&self) -> Result<OwnedSemaphorePermit, ApiError> {
        let permit = take_slot(&self.public_controls)?;
        self.store
            .rate("public", self.store.config.request_rate as f64 / 2.0)
            .await?;
        Ok(permit)
    }

    async fn access_capability(
        &self,
        request: Request,
        id: &str,
    ) -> Result<(String, OwnedSemaphorePermit), ApiError> {
        if !valid_id(id) {
            return Err(ApiError::Unavailable);
        }
        let permit = take_slot(&self.access_controls)?;
        self.store
            .rate("access", self.store.config.request_rate as f64 / 2.0)
            .await?;
        // A capability is at most 1 KiB and never needs a full upload deadline.
        let raw = tokio::time::timeout(
            Duration::from_secs(5),
            body(request, "application/json", 1024),
        )
        .await
        .map_err(|_| ApiError::RequestTimeout)??;
        let value: Capability =
            serde_json::from_slice(&raw).map_err(|_| ApiError::InvalidRequest)?;
        Ok((token_hash(&value.token)?, permit))
    }
}

pub async fn build_router(config: Config) -> Result<Router, ApiError> {
    if config.max_in_flight < 2 {
        return Err(ApiError::Capacity);
    }
    let control_slots = config.max_in_flight.max(8);
    let state = AppState {
        public_controls: Arc::new(Semaphore::new(control_slots)),
        access_controls: Arc::new(Semaphore::new(control_slots)),
        uploads: Arc::new(Semaphore::new(config.max_in_flight - 1)),
        packets: Arc::new(Semaphore::new(config.max_in_flight)),
        static_slots: Arc::new(Semaphore::new(32)),
        store: Store::new(config.clone()).await?,
    };
    let app = Router::new()
        .route("/api/config", get(public_config))
        .route("/api/challenge", get(challenge))
        .route("/api/notes", post(create_note))
        .route("/api/notes/{id}/meta", post(metadata))
        .route("/api/notes/{id}/open", post(open_note))
        .route("/api/notes/{id}", delete(delete_note))
        .route("/healthz", get(health))
        .route("/", get(page))
        .route("/create", get(page))
        .route("/view", get(page))
        .route("/about", get(page))
        .route("/privacy", get(page))
        .route("/terms", get(page))
        .route("/favicon.svg", get(favicon))
        .route("/theme.js", get(theme))
        .route("/robots.txt", get(robots))
        .route("/.well-known/security.txt", get(security_contact))
        .nest_service("/assets", ServeDir::new(config.static_dir.join("assets")))
        .fallback(|| async { ApiError::NotFound })
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state);
    Ok(app)
}

async fn guard(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let path = request.uri().path();
    let is_api = path.starts_with("/api/");
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let hsts = state
        .store
        .config
        .origins
        .iter()
        .zip(&state.store.config.hosts)
        .any(|(origin, configured)| {
            origin.starts_with("https://") && configured.eq_ignore_ascii_case(host)
        });
    let result: Result<Response, ApiError> = async {
        authorize(&state.store.config, &request)?;
        // Only recognized API handlers enter their class. A fallback, bad method
        // or invalid ID cannot spend an existing recipient's request allowance.
        let static_permit = if is_api {
            None
        } else {
            Some(take_slot(&state.static_slots)?)
        };
        let mut response =
            tokio::time::timeout(state.store.config.request_timeout, next.run(request))
                .await
                .map_err(|_| ApiError::RequestTimeout)?;
        if response.status() == StatusCode::METHOD_NOT_ALLOWED {
            response = ApiError::InvalidRequest.into_response();
        }
        Ok(match static_permit {
            Some(permit) => hold_response(response, permit),
            None => response,
        })
    }
    .await;
    let mut response = result.unwrap_or_else(IntoResponse::into_response);
    let headers = response.headers_mut();
    for (name, value) in [
        ("cache-control", "no-store, max-age=0"),
        ("pragma", "no-cache"),
        (
            "content-security-policy",
            "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'",
        ),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "no-referrer"),
        ("cross-origin-opener-policy", "same-origin"),
        ("cross-origin-resource-policy", "same-origin"),
        ("x-frame-options", "DENY"),
        ("x-dns-prefetch-control", "off"),
        (
            "permissions-policy",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), browsing-topics=()",
        ),
    ] {
        headers.insert(name, HeaderValue::from_static(value));
    }
    if hsts {
        headers.insert(
            "strict-transport-security",
            HeaderValue::from_static("max-age=31536000"),
        );
    }
    if matches!(
        response.status(),
        StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE
    ) {
        response
            .headers_mut()
            .insert("retry-after", HeaderValue::from_static("2"));
    }
    response
}

fn authorize(config: &Config, request: &Request) -> Result<(), ApiError> {
    if request.uri().to_string().len() > 2048
        || request
            .headers()
            .iter()
            .map(|(k, v)| k.as_str().len() + v.len())
            .sum::<usize>()
            > 8192
    {
        return Err(ApiError::InvalidRequest);
    }
    let path = request.uri().path();
    if path != "/healthz" {
        let host = one_header(request.headers(), "host")?.ok_or(ApiError::Forbidden)?;
        if !config
            .hosts
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(host))
        {
            return Err(ApiError::Forbidden);
        }
    }
    if path.starts_with("/api/") {
        if path.contains('%') {
            return Err(ApiError::NotFound);
        }
        if request.method() == axum::http::Method::HEAD {
            return Err(ApiError::InvalidRequest);
        }
        if let Some(origin) = one_header(request.headers(), "origin")?
            && !config.origins.iter().any(|allowed| allowed == origin)
        {
            return Err(ApiError::Forbidden);
        }
        if let Some(site) = one_header(request.headers(), "sec-fetch-site")?
            && site != "same-origin"
        {
            return Err(ApiError::Forbidden);
        }
        if request.uri().query().is_some() || request.headers().contains_key("content-encoding") {
            return Err(ApiError::InvalidRequest);
        }
    }
    if path.starts_with("/assets/")
        && (!path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/_-.".contains(&b))
            || path.split('/').any(|part| part.starts_with('.'))
            || ![
                ".js", ".css", ".wasm", ".svg", ".png", ".jpg", ".jpeg", ".ico", ".woff2",
            ]
            .iter()
            .any(|extension| path.ends_with(extension)))
    {
        return Err(ApiError::NotFound);
    }
    Ok(())
}

fn one_header<'a>(headers: &'a HeaderMap, name: &str) -> Result<Option<&'a str>, ApiError> {
    let mut values = headers.get_all(name).iter();
    let value = values.next();
    if values.next().is_some() {
        return Err(ApiError::InvalidRequest);
    }
    value
        .map(|v| v.to_str().map_err(|_| ApiError::InvalidRequest))
        .transpose()
}

async fn body(request: Request, expected: &str, limit: usize) -> Result<Bytes, ApiError> {
    let content_type =
        one_header(request.headers(), "content-type")?.ok_or(ApiError::InvalidRequest)?;
    let valid = content_type.eq_ignore_ascii_case(expected)
        || (expected == "application/json"
            && content_type.eq_ignore_ascii_case("application/json; charset=utf-8"));
    if !valid {
        return Err(ApiError::InvalidRequest);
    }
    if let Some(length) = one_header(request.headers(), "content-length")?
        && length
            .parse::<u64>()
            .map_err(|_| ApiError::InvalidRequest)?
            > limit as u64
    {
        return Err(ApiError::TooLarge);
    }
    to_bytes(request.into_body(), limit)
        .await
        .map_err(|_| ApiError::TooLarge)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Capability {
    token: String,
}

async fn public_config(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ApiError> {
    let _control = state.public_admission().await?;
    Ok(Json(
        serde_json::json!({ "protocol": 1, "max_content_bytes": MAX_CONTENT_BYTES, "max_text_bytes": MAX_TEXT_BYTES,
        "max_files": 8, "max_views": 100, "max_ttl": 604800, "pow_bits": state.store.config.pow_bits }),
    ))
}
async fn challenge(State(state): State<AppState>) -> Result<Json<store::Challenge>, ApiError> {
    let _control = state.public_admission().await?;
    Ok(Json(state.store.issue().await?))
}
async fn create_note(
    State(state): State<AppState>,
    request: Request,
) -> Result<impl IntoResponse, ApiError> {
    let control = state.public_admission().await?;
    state
        .store
        .rate("create", state.store.config.create_rate as f64)
        .await?;
    let challenge = one_header(request.headers(), "x-erase-challenge")?
        .ok_or(ApiError::ProofInvalid)?
        .to_owned();
    let nonce = one_header(request.headers(), "x-erase-nonce")?
        .ok_or(ApiError::ProofInvalid)?
        .to_owned();
    if !valid_id(&challenge) || !protocol::valid_nonce(&nonce) {
        return Err(ApiError::ProofInvalid);
    }
    // Reject unknown/replayed challenges before accepting a multi-megabyte request body.
    let bits = state.store.inspect_proof(&challenge).await?;
    let _upload = take_slot(&state.uploads)?;
    let _packet = take_slot(&state.packets)?;
    drop(control);
    let bytes = body(request, "application/octet-stream", MAX_PACKET_BYTES).await?;
    let packet = parse_packet(bytes)?;
    if !verify_work(&challenge, &nonce, &packet.bytes, bits) {
        return Err(ApiError::ProofInvalid);
    }
    let created = state.store.create(packet, &challenge).await?;
    Ok((StatusCode::CREATED, Json(created)))
}
async fn metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> Result<Json<store::Metadata>, ApiError> {
    let (hash, _control) = state.access_capability(request, &id).await?;
    Ok(Json(state.store.metadata(&id, &hash).await?))
}
async fn open_note(
    State(state): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> Result<Response, ApiError> {
    let (hash, control) = state.access_capability(request, &id).await?;
    state.store.check_open(&id, &hash).await?;
    let permit = take_slot(&state.packets)?;
    drop(control);
    // The consuming operation rechecks the capability, expiry and count. A
    // competing open/revocation between the two commands cannot bypass it.
    let packet = state.store.open(&id, &hash).await?;
    let response = ([(header::CONTENT_TYPE, "application/octet-stream")], packet).into_response();
    Ok(hold_response(response, permit))
}
async fn delete_note(
    State(state): State<AppState>,
    Path(id): Path<String>,
    request: Request,
) -> Result<StatusCode, ApiError> {
    let (hash, _control) = state.access_capability(request, &id).await?;
    state.store.delete(&id, &hash).await?;
    Ok(StatusCode::NO_CONTENT)
}
async fn health(State(state): State<AppState>) -> StatusCode {
    match state.store.cache.ping().await {
        Ok(()) => StatusCode::OK,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}
async fn page(State(state): State<AppState>) -> Result<Response, ApiError> {
    let file = tokio::fs::read(state.store.config.static_dir.join("index.html"))
        .await
        .map_err(|_| ApiError::NotFound)?;
    Ok(([(header::CONTENT_TYPE, "text/html; charset=utf-8")], file).into_response())
}
async fn favicon(State(state): State<AppState>) -> Result<Response, ApiError> {
    let file = tokio::fs::read(state.store.config.static_dir.join("favicon.svg"))
        .await
        .map_err(|_| ApiError::NotFound)?;
    Ok(([(header::CONTENT_TYPE, "image/svg+xml")], file).into_response())
}
async fn robots() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "User-agent: *\nDisallow: /view\nDisallow: /api/\n",
    )
}
async fn theme(State(state): State<AppState>) -> Result<Response, ApiError> {
    let file = tokio::fs::read(state.store.config.static_dir.join("theme.js"))
        .await
        .map_err(|_| ApiError::NotFound)?;
    Ok((
        [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
        file,
    )
        .into_response())
}
async fn security_contact() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        "Contact: https://github.com/RedCamel1312/erase.to/security/policy\nExpires: 2027-11-04T00:00:00Z\nPreferred-Languages: en, de\nCanonical: https://erase.to/.well-known/security.txt\n",
    )
}

fn hold_response(response: Response, permit: OwnedSemaphorePermit) -> Response {
    response.map(|body| {
        Body::new(HeldBody {
            body,
            _permit: Arc::new(permit),
        })
    })
}

struct HeldBody {
    body: Body,
    _permit: Arc<OwnedSemaphorePermit>,
}
struct HeldChunk {
    data: Bytes,
    _permit: Arc<OwnedSemaphorePermit>,
}
impl AsRef<[u8]> for HeldChunk {
    fn as_ref(&self) -> &[u8] {
        &self.data
    }
}
impl HttpBody for HeldBody {
    type Data = Bytes;
    type Error = axum::Error;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        match Pin::new(&mut self.body).poll_frame(cx) {
            Poll::Ready(Some(Ok(frame))) => Poll::Ready(Some(Ok(frame.map_data(|data| {
                // Hyper may drop an exhausted Body while still buffering its last
                // frame for a slow socket. Keep the slot with every transported
                // Bytes owner, including slices/clones, without copying data.
                Bytes::from_owner(HeldChunk {
                    data,
                    _permit: self._permit.clone(),
                })
            })))),
            other => other,
        }
    }
    fn is_end_stream(&self) -> bool {
        self.body.is_end_stream()
    }
    fn size_hint(&self) -> SizeHint {
        self.body.size_hint()
    }
}

#[cfg(test)]
mod response_tests {
    use super::*;

    #[tokio::test]
    async fn response_permit_survives_body_drop_until_last_transported_chunk_is_released() {
        let slots = Arc::new(Semaphore::new(1));
        let permit = slots.clone().try_acquire_owned().unwrap();
        let mut body = HeldBody {
            body: Body::from("synthetic payload"),
            _permit: Arc::new(permit),
        };
        let frame = std::future::poll_fn(|cx| Pin::new(&mut body).poll_frame(cx))
            .await
            .unwrap()
            .unwrap();
        assert!(body.is_end_stream());
        drop(body);
        assert_eq!(slots.available_permits(), 0);
        let bytes = frame.into_data().unwrap();
        let remaining = bytes.slice(1..);
        drop(bytes);
        assert_eq!(slots.available_permits(), 0);
        drop(remaining);
        assert_eq!(slots.available_permits(), 1);
    }
}
