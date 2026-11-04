use crate::error::ApiError;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use bytes::Bytes;
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const MAX_CONTENT_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_TEXT_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_PACKET_BYTES: usize = MAX_CONTENT_BYTES + 32768;
pub const MAX_HEADER_BYTES: usize = 2048;

#[derive(Clone, Deserialize, Serialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Header {
    pub version: u8,
    pub id: String,
    pub ttl: u64,
    pub views: u32,
    pub peek: String,
    pub read: String,
    pub revoke: String,
    pub kdf: String,
    pub salt: String,
    pub nonce: String,
}

pub struct Packet {
    pub bytes: Bytes,
    pub header_bytes: Bytes,
    pub header: Header,
}

pub fn base64_bytes(value: &str, length: usize) -> Result<Vec<u8>, ApiError> {
    if value.len() != (length * 8).div_ceil(6) {
        return Err(ApiError::InvalidRequest);
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| ApiError::InvalidRequest)?;
    if decoded.len() != length || URL_SAFE_NO_PAD.encode(&decoded) != value {
        return Err(ApiError::InvalidRequest);
    }
    Ok(decoded)
}

pub fn valid_id(value: &str) -> bool {
    base64_bytes(value, 32).is_ok()
}
pub fn is_hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn digest(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
pub fn token_hash(value: &str) -> Result<String, ApiError> {
    Ok(digest(
        &base64_bytes(value, 32).map_err(|_| ApiError::Unavailable)?,
    ))
}
pub fn random_token() -> Result<String, ApiError> {
    let mut bytes = [0_u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| ApiError::Capacity)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

pub fn parse_packet(bytes: Bytes) -> Result<Packet, ApiError> {
    if bytes.len() > MAX_PACKET_BYTES {
        return Err(ApiError::TooLarge);
    }
    if bytes.len() < 8 || &bytes[..4] != b"ERS1" {
        return Err(ApiError::InvalidRequest);
    }
    let length = u32::from_be_bytes(
        bytes[4..8]
            .try_into()
            .map_err(|_| ApiError::InvalidRequest)?,
    ) as usize;
    if !(1..=MAX_HEADER_BYTES).contains(&length) || bytes.len() < 8 + length + 4112 {
        return Err(ApiError::InvalidRequest);
    }
    let cipher_length = bytes.len() - 8 - length;
    if !(cipher_length - 16).is_multiple_of(4096) {
        return Err(ApiError::InvalidRequest);
    }
    let header_bytes = bytes.slice(8..8 + length);
    // Struct deserialization rejects duplicate, missing and unknown fields; no lossy value round-trip.
    let header: Header =
        serde_json::from_slice(&header_bytes).map_err(|_| ApiError::InvalidRequest)?;
    if serde_json::to_vec(&header)
        .map_err(|_| ApiError::InvalidRequest)?
        .as_slice()
        != header_bytes.as_ref()
    {
        return Err(ApiError::InvalidRequest);
    }
    if header.version != 1
        || !valid_id(&header.id)
        || !(60..=604800).contains(&header.ttl)
        || !(1..=100).contains(&header.views)
        || !is_hash(&header.peek)
        || !is_hash(&header.read)
        || !is_hash(&header.revoke)
        || base64_bytes(&header.nonce, 24).is_err()
        || match header.kdf.as_str() {
            "none" => !header.salt.is_empty(),
            "argon2id" => base64_bytes(&header.salt, 16).is_err(),
            _ => true,
        }
    {
        return Err(ApiError::InvalidRequest);
    }
    Ok(Packet {
        bytes,
        header_bytes,
        header,
    })
}

pub fn valid_nonce(nonce: &str) -> bool {
    if nonce.is_empty()
        || nonce.len() > 16
        || !nonce.bytes().all(|b| b.is_ascii_digit())
        || (nonce.len() > 1 && nonce.starts_with('0'))
    {
        return false;
    }
    matches!(nonce.parse::<u64>(), Ok(n) if n <= 9_007_199_254_740_991)
}

pub fn verify_work(challenge: &str, nonce: &str, packet: &[u8], bits: u8) -> bool {
    if !valid_id(challenge) || !valid_nonce(nonce) || !(1..=24).contains(&bits) {
        return false;
    }
    let hash = Sha256::digest(format!("{challenge}.{}.{nonce}", digest(packet)).as_bytes());
    let full = usize::from(bits / 8);
    let remainder = bits % 8;
    hash[..full].iter().all(|b| *b == 0) && (remainder == 0 || hash[full] >> (8 - remainder) == 0)
}
