use std::{env, net::SocketAddr, path::PathBuf, time::Duration};
use url::Url;

#[derive(Clone)]
pub struct Config {
    pub bind: SocketAddr,
    pub origins: Vec<String>,
    pub hosts: Vec<String>,
    pub cache_url: String,
    pub prefix: String,
    pub static_dir: PathBuf,
    pub pow_bits: u8,
    pub challenge_seconds: u64,
    pub max_challenges: u64,
    pub max_notes: u64,
    pub max_storage_bytes: u64,
    pub max_in_flight: usize,
    pub request_rate: u64,
    pub challenge_rate: u64,
    pub create_rate: u64,
    pub cache_timeout: Duration,
    pub request_timeout: Duration,
    pub connection_lifetime: Duration,
    pub require_safe_cache: bool,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let origins = env::var("PUBLIC_ORIGINS").unwrap_or_else(|_| "http://localhost:3001".into());
        let mut config = Self::new(
            &origins,
            env::var("CACHE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".into()),
        )?;
        config.bind = env::var("BIND")
            .unwrap_or_else(|_| "127.0.0.1:3001".into())
            .parse()
            .map_err(|_| "Invalid BIND.")?;
        config.static_dir = env::var("STATIC_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("../web/dist"));
        config.prefix = env::var("CACHE_PREFIX").unwrap_or_else(|_| "erase:{notes}:".into());
        if config.prefix.is_empty()
            || config.prefix.len() > 64
            || !config
                .prefix
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"_:-{}".contains(&b))
        {
            return Err("Invalid CACHE_PREFIX.".into());
        }
        config.pow_bits = number("POW_BITS", 18, 1, 24)? as u8;
        config.max_challenges = number("MAX_CHALLENGES", 4096, 1, 100000)?;
        config.max_notes = number("MAX_NOTES", 2048, 1, 100000)?;
        config.max_storage_bytes = number(
            "MAX_STORAGE_BYTES",
            256 * 1024 * 1024,
            1024,
            2 * 1024 * 1024 * 1024,
        )?;
        config.max_in_flight = number("MAX_IN_FLIGHT", 2, 2, 256)? as usize;
        config.request_rate = number("REQUESTS_PER_SECOND", 100, 1, 100000)?;
        config.challenge_rate = number("CHALLENGES_PER_SECOND", 10, 1, 100000)?;
        config.create_rate = number("CREATES_PER_SECOND", 8, 1, 100000)?;
        config.cache_timeout = Duration::from_millis(number("CACHE_TIMEOUT_MS", 5000, 50, 10000)?);
        config.request_timeout =
            Duration::from_millis(number("REQUEST_TIMEOUT_MS", 300000, 1000, 300000)?);
        config.connection_lifetime =
            Duration::from_secs(number("CONNECTION_LIFETIME_SECONDS", 360, 5, 360)?);
        config.require_safe_cache = match env::var("REQUIRE_SAFE_CACHE").as_deref() {
            Ok("false") => false,
            Ok("true") | Err(_) => true,
            _ => return Err("Invalid REQUIRE_SAFE_CACHE.".into()),
        };
        Ok(config)
    }

    pub fn new(origins: &str, cache_url: String) -> Result<Self, String> {
        let mut normalized = Vec::new();
        let mut hosts = Vec::new();
        for origin in origins.split(',').map(str::trim) {
            let url = Url::parse(origin).map_err(|_| "Invalid PUBLIC_ORIGINS.")?;
            if !["http", "https"].contains(&url.scheme())
                || url.origin().ascii_serialization() != origin
                || url.username() != ""
                || url.password().is_some()
            {
                return Err(
                    "PUBLIC_ORIGINS must contain plain HTTP(S) origins without trailing slashes."
                        .into(),
                );
            }
            let host = match url.port() {
                Some(port) => format!("{}:{port}", url.host_str().ok_or("Origin lacks a host.")?),
                None => url.host_str().ok_or("Origin lacks a host.")?.into(),
            };
            normalized.push(origin.to_owned());
            hosts.push(host);
        }
        if normalized.is_empty() {
            return Err("At least one origin is required.".into());
        }
        Ok(Self {
            bind: "127.0.0.1:3001".parse().expect("constant socket"),
            origins: normalized,
            hosts,
            cache_url,
            prefix: "erase:{notes}:".into(),
            static_dir: PathBuf::from("../web/dist"),
            pow_bits: 18,
            challenge_seconds: 420,
            max_challenges: 4096,
            max_notes: 2048,
            max_storage_bytes: 256 * 1024 * 1024,
            max_in_flight: 2,
            request_rate: 100,
            challenge_rate: 10,
            create_rate: 8,
            cache_timeout: Duration::from_secs(5),
            request_timeout: Duration::from_secs(300),
            connection_lifetime: Duration::from_secs(360),
            require_safe_cache: true,
        })
    }
}

fn number(name: &str, default: u64, min: u64, max: u64) -> Result<u64, String> {
    let value = match env::var(name) {
        Ok(v) => v.parse::<u64>().map_err(|_| format!("Invalid {name}."))?,
        Err(_) => default,
    };
    if value < min || value > max {
        return Err(format!("Invalid {name}."));
    }
    Ok(value)
}
