<?php
// app/includes/footer.php
// Der Footer: SchlieÃŸt das UI stark und souverÃ¤n ab.
?>
    <footer class="site-footer">
        <div class="container footer-grid">
            
            <!-- Marke links (StÃ¤rker inszeniert als Produktabschluss) -->
            <div class="footer-brand stack-xs">
                <a href="/" class="logo-link" style="display: flex; align-items: center; gap: 0.35rem; text-decoration: none;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="logo-icon" style="color: var(--color-text-base); width: 1.1em; height: 1.1em; transform: translateY(-0.06em);"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span class="brand-name" style="margin: 0; font-weight: 600; font-size: 1.35rem; letter-spacing: -0.02em; color: var(--color-text-base);">erase.to</span>
                </a>
                <p class="text-sm text-muted" style="margin: 0; max-width: 32ch;">Encrypted messages with minimal traces.</p>
            </div>

            <!-- Mitte: Nützliche Links -->
            <nav class="footer-nav">
                <a href="/about.php" class="nav-link">About Us</a>
                <a href="/privacy.php" class="nav-link">Privacy</a>
                <a href="/terms.php" class="nav-link">Terms</a>
            </nav>

            <!-- Rechts: Technik Prinzipien, leise -->
            <div class="footer-tech stack-xs">
                <p class="text-xs text-muted" style="opacity: 0.8;">Zero tracking.</p>
                <p class="text-xs text-muted" style="opacity: 0.8;">Client-side crypto.</p>
            </div>

        </div>
    </footer>
