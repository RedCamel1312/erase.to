<?php
// public/view.php
// Die Ansicht zum Entschlüsseln und Lesen einer Nachricht.

require_once __DIR__ . '/../app/http/response.php';
\App\Http\Response::setNoStore();

$prevent_indexing = true;
$page_title = "Open message";
$extra_css = "/assets/css/pages-view.css";
$extra_js = ["/assets/js/clipboard.js", "/assets/js/view.js"];

require_once __DIR__ . '/../app/includes/head.php';
require_once __DIR__ . '/../app/includes/layout-open.php';
require_once __DIR__ . '/../app/includes/header.php';
?>

<main class="site-main workspace">
    
    <!-- BEREICH A: Seitenkopf (Immer sichtbar, ruhender Rahmen) -->
    <div class="workspace-header text-center" style="display: flex; flex-direction: column; align-items: center; margin-bottom: var(--space-xl);">
        <div class="accent-mark" style="width: 24px; height: 3px; background-color: var(--color-accent); margin-bottom: var(--space-sm);"></div>
        <h1 class="workspace-title" style="margin-bottom: 0;">Open message</h1>
        <p class="workspace-intro" style="margin-top: var(--space-xs); margin-bottom: 0;">
            Local decryption environment for received packages.
        </p>
    </div>

    <!-- Die stabile Lesemaschine -->
    <div class="view-container" style="max-width: 800px; margin: 0 auto; width: 100%;">

        <!-- BEREICH 0: Sicherheitswarnungen (Pre-Decryption Sensibilisierung) -->
        <div id="security-warnings" class="surface-box" style="margin-bottom: var(--space-xl); border: 1px solid var(--color-border-subtle); padding: var(--space-lg); background: rgba(201, 142, 84, 0.03);">
            <h2 style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #c98e54; margin-top: 0; margin-bottom: var(--space-sm); display: flex; align-items: center; gap: 8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                Security Precautions
            </h2>
            <ul class="text-sm text-muted" style="margin: 0; padding-left: 1.25rem; line-height: 1.6;">
                <li><strong>Private Devices:</strong> Do not open sensitive packages on untrusted or public hardware.</li>
                <li><strong>No Residue:</strong> On shared machines, clear the local view and close the tab immediately after reading.</li>
                <li><strong>Safe Channels:</strong> Always share links and passphrases via separate, independent communication channels.</li>
            </ul>
        </div>
        
        <!-- BEREICH B: Paket- und Schlüsselzustand (Mini-Status Pill) -->
        <div id="view-status-bar" style="text-align: center; margin-bottom: var(--space-md);">
            <span id="state-indicator" class="text-sm font-medium" style="display: inline-flex; align-items: center; gap: 8px; padding: 0.5rem 1rem; border-radius: var(--radius-sm); background-color: var(--color-bg-surface); border: 1px solid var(--color-border-subtle); color: var(--color-text-muted); transition: all 0.2s ease;">
                <span id="state-icon">⚿</span>
                <span id="state-title">Waiting for link data...</span>
            </span>
        </div>

        <!-- BEREICH C: Passphrase Eingabebereich (Standardmäßig unsichtbar) -->
        <div id="state-action-prompt" style="display: none; justify-content: center; margin-bottom: var(--space-md);">
            <div class="surface-box" style="width: 100%; max-width: 380px; padding: var(--space-lg); text-align: center; border: 1px solid var(--color-accent);">
                
                <h2 style="font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-accent); margin-top: 0; margin-bottom: var(--space-xs);">Additional passphrase required</h2>
                <p class="text-sm text-muted" style="margin-top: 0; margin-bottom: var(--space-md); line-height: 1.5;">The message cannot be opened with the link alone. Enter the additional phrase shared separately.</p>
                
                <p id="passphrase-error-msg" class="text-sm" style="display: none; color: #b75555; background: rgba(183, 85, 85, 0.05); border: 1px solid rgba(183, 85, 85, 0.2); padding: 0.5rem; border-radius: 4px; margin-bottom: var(--space-md); line-height: 1.4;">Package loaded, but decryption failed. The additional passphrase appears to be incorrect.</p>

                <div class="stack-sm">
                    <input type="password" id="unlock-passphrase" class="form-control form-input" style="text-align: center;">
                    <button type="button" id="btn-unlock" class="btn btn-primary" style="width: 100%;">Continue decryption</button>
                </div>
            </div>
        </div>

        <!-- BEREICH D: Eigentlicher Lesebereich (Unsichtbar, bis Text entschlüsselt ist) -->
        <div id="message-content-area" style="display: none;">
            <div class="message-card surface-box" style="padding: var(--space-2xl) var(--space-xl); border: 1px solid var(--color-border-subtle); border-radius: 0; background-color: var(--color-bg-surface); min-height: 200px;">
                <div id="readonly-message" style="font-family: inherit; font-size: 1.05rem; line-height: 1.8; color: var(--color-text-base); white-space: pre-wrap; word-wrap: break-word; user-select: text;"></div>
            </div>
        </div>

        <!-- BEREICH E: Folgeaktionen (Sichtbarkeit zwingend an Bereich D gekoppelt) -->
        <div id="message-actions-area" class="actions-area" style="display: none; gap: var(--space-sm); align-items: center; justify-content: center; flex-wrap: wrap; margin-top: var(--space-lg);">
            <button type="button" id="btn-copy-content" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.6rem 1.2rem; background: transparent; border-color: var(--color-border-subtle);">Copy content</button>
            <button type="button" id="btn-clear-view" class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.6rem 1.2rem; background: transparent; border-color: var(--color-border-subtle); color: var(--color-text-muted);">Clear local view</button>
            <a href="/create.php" class="btn btn-primary" style="font-size: 0.85rem; padding: 0.6rem 1.2rem;">Create new message</a>
        </div>
        
    </div>

</main>

<?php
require_once __DIR__ . '/../app/includes/footer.php';
require_once __DIR__ . '/../app/includes/layout-close.php';
?>
