use crate::{
    cache::Cache,
    config::Config,
    error::ApiError,
    protocol::{Packet, random_token},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;
use std::{
    sync::{Arc, LazyLock},
    time::Duration,
};

const COMMON: &str = include_str!("lua/common.lua");
fn script(source: &str, allow_oom: bool) -> String {
    let flags = if allow_oom {
        "#!lua flags=allow-oom\n"
    } else {
        "#!lua\n"
    };
    format!("{flags}{COMMON}\n{source}")
}
static ISSUE: LazyLock<String> = LazyLock::new(|| script(include_str!("lua/issue.lua"), false));
static INSPECT: LazyLock<String> =
    LazyLock::new(|| script(include_str!("lua/inspect_proof.lua"), true));
static CREATE: LazyLock<String> = LazyLock::new(|| script(include_str!("lua/create.lua"), false));
static ACCESS: LazyLock<String> = LazyLock::new(|| script(include_str!("lua/access.lua"), true));
static REAP: LazyLock<String> = LazyLock::new(|| script(include_str!("lua/reap.lua"), true));
static RATE: LazyLock<String> = LazyLock::new(|| script(include_str!("lua/rate.lua"), true));

type Reply = Vec<Vec<u8>>;

#[derive(Serialize)]
pub struct Challenge {
    pub challenge: String,
    pub bits: u8,
    pub expires_at: u64,
}
#[derive(Serialize)]
pub struct Created {
    pub id: String,
    pub expires_at: u64,
}
#[derive(Serialize)]
pub struct Metadata {
    pub header: String,
    pub expires_at: u64,
    pub remaining: u32,
}

pub struct Store {
    pub cache: Arc<Cache>,
    pub config: Config,
}

impl Store {
    pub async fn new(config: Config) -> Result<Arc<Self>, ApiError> {
        let cache = Cache::connect(&config).await?;
        let store = Arc::new(Self { cache, config });
        let weak = Arc::downgrade(&store);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(1)).await;
                let Some(store) = weak.upgrade() else {
                    break;
                };
                let _ = store.reap().await;
            }
        });
        Ok(store)
    }

    pub fn key(&self, suffix: &str) -> String {
        format!("{}{suffix}", self.config.prefix)
    }
    fn eval(&self, source: &str, keys: &[String]) -> redis::Cmd {
        self.eval_with_capacity(source, keys, 0)
    }
    fn eval_with_capacity(
        &self,
        source: &str,
        keys: &[String],
        payload_bytes: usize,
    ) -> redis::Cmd {
        // Reserving before appending the large packet avoids Vec doubling when the
        // small trailing Lua arguments are added after a 64 MiB packet.
        let mut command = redis::Cmd::with_capacity(32, source.len() + payload_bytes + 4096);
        command.arg("EVAL");
        command.arg(source).arg(keys.len());
        for key in keys {
            command.arg(key);
        }
        command
    }
    fn ledger(&self, id: &str) -> Vec<String> {
        vec![
            self.key(&format!("note:{id}")),
            self.key("notes"),
            self.key("charges"),
            self.key("bytes"),
        ]
    }

    pub async fn rate(&self, bucket: &str, per_second: f64) -> Result<(), ApiError> {
        let mut command = self.eval(&RATE, &[self.key(&format!("rate:{bucket}"))]);
        command.arg(per_second);
        let allowed: i64 = self.cache.command(command).await?;
        if allowed == 1 {
            Ok(())
        } else {
            Err(ApiError::RateLimited)
        }
    }

    pub async fn issue(&self) -> Result<Challenge, ApiError> {
        self.rate("challenge", self.config.challenge_rate as f64)
            .await?;
        let challenge = random_token()?;
        let mut command = self.eval(
            &ISSUE,
            &[
                self.key(&format!("challenge:{challenge}")),
                self.key("challenges"),
            ],
        );
        command
            .arg(&challenge)
            .arg(self.config.pow_bits)
            .arg(self.config.challenge_seconds)
            .arg(self.config.max_challenges);
        let reply: Reply = self.cache.command(command).await?;
        check(&reply)?;
        Ok(Challenge {
            challenge,
            bits: self.config.pow_bits,
            expires_at: number(&reply, 1)?,
        })
    }

    pub async fn inspect_proof(&self, challenge: &str) -> Result<u8, ApiError> {
        let command = self.eval(
            &INSPECT,
            &[
                self.key(&format!("challenge:{challenge}")),
                self.key(&format!("spent:{challenge}")),
            ],
        );
        let reply: Reply = self.cache.command(command).await?;
        check(&reply)?;
        let bits: u8 = number(&reply, 1)?;
        if !(1..=24).contains(&bits) {
            return Err(ApiError::ProofInvalid);
        }
        Ok(bits)
    }

    pub async fn create(&self, packet: Packet, challenge: &str) -> Result<Created, ApiError> {
        let header = &packet.header;
        let mut keys = self.ledger(&header.id);
        keys.extend([
            self.key(&format!("challenge:{challenge}")),
            self.key(&format!("spent:{challenge}")),
            self.key("challenges"),
        ]);
        let mut command = self.eval_with_capacity(
            &CREATE,
            &keys,
            packet.bytes.len() + packet.header_bytes.len(),
        );
        command
            .arg(&header.id)
            .arg(packet.bytes.as_ref())
            .arg(packet.header_bytes.as_ref())
            .arg(&header.peek)
            .arg(&header.read)
            .arg(&header.revoke)
            .arg(header.ttl)
            .arg(header.views)
            .arg(self.config.max_notes)
            .arg(self.config.max_storage_bytes)
            .arg(&self.config.prefix)
            .arg(challenge);
        let id = header.id.clone();
        // Cmd owns the copied argument bytes. Release the HTTP body before Redis
        // constructs its separate RESP transport buffer.
        drop(packet);
        let reply: Reply = self.cache.command(command).await?;
        check(&reply)?;
        Ok(Created {
            id,
            expires_at: number(&reply, 1)?,
        })
    }

    async fn access(
        &self,
        id: &str,
        capability_hash: &str,
        operation: &str,
    ) -> Result<Reply, ApiError> {
        let mut command = self.eval(&ACCESS, &self.ledger(id));
        command.arg(id).arg(capability_hash).arg(operation);
        let reply: Reply = self.cache.command(command).await?;
        check(&reply)?;
        Ok(reply)
    }

    pub async fn metadata(&self, id: &str, hash: &str) -> Result<Metadata, ApiError> {
        let reply = self.access(id, hash, "meta").await?;
        Ok(Metadata {
            header: URL_SAFE_NO_PAD.encode(reply.get(1).ok_or(ApiError::Capacity)?),
            expires_at: number(&reply, 2)?,
            remaining: number(&reply, 3)?,
        })
    }
    pub async fn check_open(&self, id: &str, hash: &str) -> Result<(), ApiError> {
        self.access(id, hash, "check_open").await?;
        Ok(())
    }
    pub async fn open(&self, id: &str, hash: &str) -> Result<Vec<u8>, ApiError> {
        let mut reply = self.access(id, hash, "open").await?;
        if reply.len() != 2 {
            return Err(ApiError::Capacity);
        }
        Ok(reply.remove(1))
    }
    pub async fn delete(&self, id: &str, hash: &str) -> Result<(), ApiError> {
        self.access(id, hash, "delete").await?;
        Ok(())
    }
    pub async fn reap(&self) -> Result<(), ApiError> {
        let mut command = self.eval(
            &REAP,
            &[
                self.key("notes"),
                self.key("charges"),
                self.key("bytes"),
                self.key("challenges"),
            ],
        );
        command.arg(&self.config.prefix);
        let reply: Reply = self.cache.command(command).await?;
        check(&reply)
    }
}

fn number<T: std::str::FromStr>(reply: &Reply, index: usize) -> Result<T, ApiError> {
    std::str::from_utf8(reply.get(index).ok_or(ApiError::Capacity)?)
        .map_err(|_| ApiError::Capacity)?
        .parse()
        .map_err(|_| ApiError::Capacity)
}
fn check(reply: &Reply) -> Result<(), ApiError> {
    match reply.first().map(Vec::as_slice) {
        Some(b"ok") => Ok(()),
        Some(b"unavailable") => Err(ApiError::Unavailable),
        Some(b"proof_invalid") => Err(ApiError::ProofInvalid),
        Some(b"proof_reused") => Err(ApiError::ProofReused),
        Some(b"id_conflict") => Err(ApiError::IdConflict),
        _ => Err(ApiError::Capacity),
    }
}
