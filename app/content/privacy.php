<main class="site-main static-page">
    <header class="static-header text-center">
        <h1 class="text-2xl" style="margin-bottom: var(--space-xs);">Privacy by Design</h1>
        <p class="text-base text-muted" style="margin: 0;">What we cannot see cannot be shared.</p>
    </header>

    <div class="static-content">
        
        <section style="display: flex; gap: var(--space-lg); border-top: 2px solid var(--color-text-base); padding-top: var(--space-lg); align-items: flex-start;">
            <div style="flex: 0 0 60px; font-weight: 700; color: var(--color-accent); font-size: var(--text-2xl); line-height: 1;">01</div>
            <div>
                <h2 style="margin-top: 0; font-size: 1.25rem;">No IP Logging. Zero Traces.</h2>
                <p>We do not collect, store, or share your data. Most services log your IP for rate limiting; we don't. Our infrastructure is designed to be blind to your network identity. What we do not see, we cannot log or hand over.</p>
            </div>
        </section>

        <section style="display: flex; gap: var(--space-lg); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-lg); align-items: flex-start;">
            <div style="flex: 0 0 60px; font-weight: 700; color: var(--color-accent); font-size: var(--text-2xl); line-height: 1;">02</div>
            <div>
                <h2 style="margin-top: 0; font-size: 1.25rem;">Stateless Proof-of-Work (PoW)</h2>
                <p>To prevent abuse without tracking you, we use anonymous CPU-based challenges (Hashcash). Your browser solves a small puzzle to prove a human is behind the request, allowing us to maintain a stable service without ever needing to know who or where you are.</p>
            </div>
        </section>
 
        <section style="display: flex; gap: var(--space-lg); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-lg); align-items: flex-start;">
            <div style="flex: 0 0 60px; font-weight: 700; color: var(--color-accent); font-size: var(--text-2xl); line-height: 1;">03</div>
            <div>
                <h2 style="margin-top: 0; font-size: 1.25rem;">Zero-Knowledge Fragments</h2>
                <p>Encryption happens purely in your browser. The decryption key remains in the URL fragment (the part after the #), which is never sent to the network. The server only sees an encrypted blob it cannot read.</p>
            </div>
        </section>
 
        <section style="display: flex; gap: var(--space-lg); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-lg); align-items: flex-start;">
            <div style="flex: 0 0 60px; font-weight: 700; color: var(--color-accent); font-size: var(--text-2xl); line-height: 1;">04</div>
            <div>
                <h2 style="margin-top: 0; font-size: 1.25rem;">RAM-Only & No-Store Policy</h2>
                <p>Decrypted content is kept in volatile RAM and is never saved to cookies, local storage, or browser caches. Strict 'No-Store' headers ensure that no proxy or browser keeps a local copy of your session. Once consumed or expired, data is physically wiped from our disks.</p>
            </div>
        </section>

    </div>
</main>
