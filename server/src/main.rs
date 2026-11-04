use erase_server::{build_router, config::Config, transport::DeadlineListener};

#[tokio::main]
async fn main() {
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("erase-server configuration error: {error}");
            std::process::exit(1);
        }
    };
    let bind = config.bind;
    let lifetime = config.connection_lifetime;
    let app = match build_router(config).await {
        Ok(app) => app,
        Err(_) => {
            eprintln!("erase-server cache readiness or safety check failed");
            std::process::exit(1);
        }
    };
    let listener = match tokio::net::TcpListener::bind(bind).await {
        Ok(listener) => listener,
        Err(_) => {
            eprintln!("erase-server could not bind its listener");
            std::process::exit(1);
        }
    };
    println!("erase-server ready");
    if axum::serve(DeadlineListener::new(listener, lifetime), app)
        .with_graceful_shutdown(shutdown())
        .await
        .is_err()
    {
        eprintln!("erase-server listener stopped unexpectedly");
        std::process::exit(1);
    }
}

async fn shutdown() {
    #[cfg(unix)]
    {
        if let Ok(mut term) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
        } else {
            let _ = tokio::signal::ctrl_c().await;
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
    // Bound graceful drain without serializing or flushing volatile message contents.
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(15)).await;
        std::process::exit(0);
    });
}
