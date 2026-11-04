use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApiError {
    Unavailable,
    InvalidRequest,
    TooLarge,
    RequestTimeout,
    ProofInvalid,
    ProofReused,
    IdConflict,
    Capacity,
    RateLimited,
    Forbidden,
    NotFound,
}

impl ApiError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Unavailable => "unavailable",
            Self::InvalidRequest => "invalid_request",
            Self::TooLarge => "too_large",
            Self::RequestTimeout => "request_timeout",
            Self::ProofInvalid => "proof_invalid",
            Self::ProofReused => "proof_reused",
            Self::IdConflict => "id_conflict",
            Self::Capacity => "capacity",
            Self::RateLimited => "rate_limited",
            Self::Forbidden => "forbidden",
            Self::NotFound => "not_found",
        }
    }
    pub fn status(self) -> StatusCode {
        match self {
            Self::Unavailable | Self::NotFound => StatusCode::NOT_FOUND,
            Self::InvalidRequest | Self::ProofInvalid => StatusCode::BAD_REQUEST,
            Self::TooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            // Some browsers automatically resend HTTP 408 on reused connections.
            // This handler may already have consumed a note, so avoid that signal.
            Self::RequestTimeout => StatusCode::GATEWAY_TIMEOUT,
            Self::ProofReused | Self::IdConflict => StatusCode::CONFLICT,
            Self::Capacity => StatusCode::SERVICE_UNAVAILABLE,
            Self::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            Self::Forbidden => StatusCode::FORBIDDEN,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        #[derive(Serialize)]
        struct ErrorBody {
            error: &'static str,
        }
        (self.status(), Json(ErrorBody { error: self.code() })).into_response()
    }
}
