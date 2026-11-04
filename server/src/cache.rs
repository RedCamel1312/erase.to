use crate::{config::Config, error::ApiError};
use redis::{FromRedisValue, aio::MultiplexedConnection};
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{sync::Mutex, time::timeout};

pub struct Cache {
    client: redis::Client,
    connection: Mutex<Option<(u64, MultiplexedConnection)>>,
    next_generation: AtomicU64,
    deadline: Duration,
    require_safe_configuration: bool,
}

impl Cache {
    pub async fn connect(config: &Config) -> Result<Arc<Self>, ApiError> {
        let cache = Arc::new(Self {
            client: redis::Client::open(config.cache_url.as_str())
                .map_err(|_| ApiError::Capacity)?,
            connection: Mutex::new(None),
            next_generation: AtomicU64::new(1),
            deadline: config.cache_timeout,
            require_safe_configuration: config.require_safe_cache,
        });
        cache.ping().await?;
        Ok(cache)
    }

    async fn acquire(&self) -> Result<(u64, MultiplexedConnection), ApiError> {
        let mut slot = timeout(self.deadline, self.connection.lock())
            .await
            .map_err(|_| ApiError::Capacity)?;
        if let Some(connection) = slot.as_ref() {
            return Ok(connection.clone());
        }
        // redis-rs has a shorter built-in default response timeout (500 ms).
        // Use this layer's configured deadline for large packets, including
        // connection setup, without adding retries after ambiguous failures.
        let settings = redis::AsyncConnectionConfig::new()
            .set_connection_timeout(None)
            .set_response_timeout(None);
        let mut connection = timeout(
            self.deadline,
            self.client
                .get_multiplexed_async_connection_with_config(&settings),
        )
        .await
        .map_err(|_| ApiError::Capacity)?
        .map_err(|_| ApiError::Capacity)?;
        // A restarted cache can have a different configuration. Never publish an unsafe
        // replacement connection to HTTP handlers, even when startup was previously safe.
        if self.require_safe_configuration {
            self.verify_configuration(&mut connection).await?;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        *slot = Some((generation, connection.clone()));
        Ok((generation, connection))
    }

    pub async fn command<T: FromRedisValue>(&self, command: redis::Cmd) -> Result<T, ApiError> {
        let (generation, mut connection) = self.acquire().await?;
        // A timeout does not prove that Valkey did not execute a mutation. NEVER resend it.
        let result = timeout(self.deadline, command.query_async::<T>(&mut connection)).await;
        match result {
            Ok(Ok(value)) => Ok(value),
            _ => {
                let mut slot = self.connection.lock().await;
                if slot
                    .as_ref()
                    .is_some_and(|(current, _)| *current == generation)
                {
                    *slot = None;
                }
                // Only a new HTTP request may obtain a newly connected socket.
                Err(ApiError::Capacity)
            }
        }
    }

    pub async fn ping(&self) -> Result<(), ApiError> {
        let reply: String = self.command(redis::cmd("PING")).await?;
        if reply == "PONG" {
            Ok(())
        } else {
            Err(ApiError::Capacity)
        }
    }

    async fn verify_configuration(
        &self,
        connection: &mut MultiplexedConnection,
    ) -> Result<(), ApiError> {
        let mut command = redis::cmd("CONFIG");
        command
            .arg("GET")
            .arg("save")
            .arg("appendonly")
            .arg("maxmemory")
            .arg("maxmemory-policy");
        let fields: HashMap<String, String> =
            timeout(self.deadline, command.query_async(connection))
                .await
                .map_err(|_| ApiError::Capacity)?
                .map_err(|_| ApiError::Capacity)?;
        if fields.get("save").is_none_or(|value| !value.is_empty())
            || fields.get("appendonly").is_none_or(|value| value != "no")
            || fields
                .get("maxmemory-policy")
                .is_none_or(|value| value != "noeviction")
            || !fields
                .get("maxmemory")
                .and_then(|value| value.parse::<u64>().ok())
                .is_some_and(|value| value > 0)
        {
            return Err(ApiError::Capacity);
        }
        Ok(())
    }
}
