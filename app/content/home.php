<main class="site-main">

    <!-- 1. Hero-Bereich -->
    <section class="hero-section text-center">
        <!-- Kleine architektonische WÃ¼rze, kein Hacker-Artwork -->
        <div class="hero-accent-mark" style="width: 32px; height: 4px; background-color: var(--color-accent); margin-bottom: var(--space-md); border-radius: 2px;"></div>
        
        <h1 class="hero-title">erase.to</h1>
        <p class="hero-subtitle text-xl">
            Zero-Trace Architecture. Just messages.
        </p>
        
        <!-- Erklärender Absatz -->
        <p class="hero-description text-base text-muted" style="max-width: 48ch; margin: 0 auto var(--space-lg); line-height: var(--line-height-base);">
            Your message is encrypted locally and resides exclusively in volatile RAM. No IP logging, no metadata, no permanent footprints. A quiet room for secure handoffs.
        </p>

        <!-- Zwei Aktionen -->
        <div class="hero-actions" style="display: flex; gap: var(--space-sm); justify-content: center; flex-wrap: wrap;">
            <a href="/create.php" class="btn btn-primary">Create message</a>
            <a href="#how-it-works" class="btn btn-secondary">How it works</a>
        </div>
        
        <!-- Sehr kleine technische Hinweise unterhalb -->
        <div class="hero-tech-hints text-xs text-muted" style="margin-top: var(--space-lg); display: flex; gap: var(--space-md); flex-wrap: wrap; justify-content: center; opacity: 0.85;">
            <span><span style="color: var(--color-accent);">&middot;</span> RAM-Only Execution</span>
            <span><span style="color: var(--color-accent);">&middot;</span> No IP Logging</span>
            <span><span style="color: var(--color-accent);">&middot;</span> Stateless PoW Antispam</span>
        </div>
    </section>

    <!-- 2. Vertrauensblock -->
    <!-- Ein ruhiges Grid mit produktbezogenen Prinzipien -->
    <section class="trust-section">
        <div class="trust-grid">
            <div class="trust-item">
                <h2 class="text-base" style="margin-bottom: var(--space-xs);">Encrypted before storage</h2>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">The server stores ciphertext, not readable plain text.</p>
            </div>
            <div class="trust-item">
                <h2 class="text-base" style="margin-bottom: var(--space-xs);">No account required</h2>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">Messages are created without user accounts.</p>
            </div>
            <div class="trust-item">
                <h2 class="text-base" style="margin-bottom: var(--space-xs);">Temporary by design</h2>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">Expiry is part of the product, not an afterthought.</p>
            </div>
        </div>
    </section>

    <!-- 3. How it works -->
    <section class="how-it-works" id="how-it-works">
        <h2 class="text-center">How it works</h2>
        <div class="grid-steps">
            
            <div class="step-card surface-box">
                <div class="step-num text-sm" style="margin-bottom: var(--space-xs);">01</div>
                <h3 class="text-base" style="margin-bottom: var(--space-xs);">Write</h3>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">You type a message that gets encrypted locally in your browser before reaching our server.</p>
            </div>

            <div class="step-card surface-box">
                <div class="step-num text-sm" style="margin-bottom: var(--space-xs);">02</div>
                <h3 class="text-base" style="margin-bottom: var(--space-xs);">Share</h3>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">You get a unique link containing the decryption key. Since keys stay in the URL fragment, they are never transmitted to our server.</p>
            </div>

            <div class="step-card surface-box">
                <div class="step-num text-sm" style="margin-bottom: var(--space-xs);">03</div>
                <h3 class="text-base" style="margin-bottom: var(--space-xs);">Disappear</h3>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">Messages are automatically purged from the server after they expire or optionally after the first successful view.</p>
            </div>
            
        </div>
    </section>

    <!-- 4. Why erase.to -->
    <section class="why-key-to">
        <h2 class="text-center">Why erase.to?</h2>
        <div class="trust-grid" style="margin-top: var(--space-lg);">
            <div class="step-card">
                <h3 class="text-base" style="margin-bottom: var(--space-xs);">Not another chat app</h3>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">erase.to is not a full messenger application.</p>
            </div>
            
            <div class="step-card">
                <h3 class="text-base" style="margin-bottom: var(--space-xs);">Not a vault for everything</h3>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">erase.to is for short, targeted handoffs, not for complete digital life archives.</p>
            </div>
            
            <div class="step-card">
                <h3 class="text-base" style="margin-bottom: var(--space-xs);">Not built around identity</h3>
                <p class="text-sm text-muted" style="margin: 0; line-height: var(--line-height-base);">The service is designed to work without user profiles.</p>
            </div>
        </div>
    </section>

    <!-- 5. Schlussbereich mit CTA -->
    <section class="cta-section surface-box stack-md text-center">
        <div class="cta-content stack-sm">
            <h2 style="margin-bottom:0;">Ready to drop a note?</h2>
            <p class="text-sm text-muted" style="margin-top:0;">Fast, secure, and trace free.</p>
        </div>
        <a href="/create.php" class="btn btn-primary">Create a message</a>
    </section>

</main>
