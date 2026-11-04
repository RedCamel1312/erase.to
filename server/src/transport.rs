//! A fixed transport lifetime, independent of activity and request/response buffering.
use axum::serve::Listener;
use std::{
    future::Future,
    io,
    net::SocketAddr,
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::{TcpListener, TcpStream},
    time::Sleep,
};

pub struct DeadlineListener {
    inner: TcpListener,
    lifetime: Duration,
}
impl DeadlineListener {
    pub fn new(inner: TcpListener, lifetime: Duration) -> Self {
        Self { inner, lifetime }
    }
}
impl Listener for DeadlineListener {
    type Io = DeadlineIo<TcpStream>;
    type Addr = SocketAddr;
    async fn accept(&mut self) -> (Self::Io, Self::Addr) {
        let (stream, address) = <TcpListener as Listener>::accept(&mut self.inner).await;
        (DeadlineIo::new(stream, self.lifetime), address)
    }
    fn local_addr(&self) -> io::Result<Self::Addr> {
        self.inner.local_addr()
    }
}

pub struct DeadlineIo<T> {
    inner: T,
    deadline: Pin<Box<Sleep>>,
}
impl<T> DeadlineIo<T> {
    pub fn new(inner: T, lifetime: Duration) -> Self {
        Self {
            inner,
            deadline: Box::pin(tokio::time::sleep(lifetime)),
        }
    }
    fn expired(&mut self, context: &mut Context<'_>) -> bool {
        self.deadline.as_mut().poll(context).is_ready()
    }
}
fn deadline_error() -> io::Error {
    io::Error::new(io::ErrorKind::TimedOut, "Connection lifetime exceeded")
}

impl<T: AsyncRead + Unpin> AsyncRead for DeadlineIo<T> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        if self.expired(context) {
            return Poll::Ready(Err(deadline_error()));
        }
        Pin::new(&mut self.inner).poll_read(context, buffer)
    }
}
impl<T: AsyncWrite + Unpin> AsyncWrite for DeadlineIo<T> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        context: &mut Context<'_>,
        buffer: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.expired(context) {
            return Poll::Ready(Err(deadline_error()));
        }
        Pin::new(&mut self.inner).poll_write(context, buffer)
    }
    fn poll_flush(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        if self.expired(context) {
            return Poll::Ready(Err(deadline_error()));
        }
        Pin::new(&mut self.inner).poll_flush(context)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<io::Result<()>> {
        if self.expired(context) {
            return Poll::Ready(Err(deadline_error()));
        }
        Pin::new(&mut self.inner).poll_shutdown(context)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test(start_paused = true)]
    async fn continuous_bytes_do_not_extend_absolute_lifetime() {
        let (stream, mut peer) = tokio::io::duplex(64);
        let mut bounded = DeadlineIo::new(stream, Duration::from_secs(30));
        for _ in 0..3 {
            peer.write_all(b"x").await.unwrap();
            let mut received = [0_u8; 1];
            bounded.read_exact(&mut received).await.unwrap();
            tokio::time::advance(Duration::from_secs(9)).await;
        }
        tokio::time::advance(Duration::from_secs(4)).await;
        peer.write_all(b"x").await.unwrap();
        assert_eq!(
            bounded.read_exact(&mut [0_u8; 1]).await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
    }

    #[tokio::test(start_paused = true)]
    async fn blocked_outgoing_body_is_interrupted_by_absolute_deadline() {
        let (stream, _non_reading_peer) = tokio::io::duplex(1);
        let mut bounded = DeadlineIo::new(stream, Duration::from_secs(30));
        // The first byte fills the transport. The second cannot be written; virtual time advances.
        assert_eq!(
            bounded.write_all(b"xx").await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
    }
}
