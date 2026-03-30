<?php
// public/create.php
// Die Arbeitsfläche (Workspace) zum Erstellen einer Nachricht.

require_once __DIR__ . '/../app/http/response.php';
\App\Http\Response::setNoStore();

require_once __DIR__ . '/../app/security/pow.php';
$powChallenge = \App\Security\ProofOfWork::getChallenge();

$prevent_indexing = true;
$page_title = "Create a message";
$extra_css = "/assets/css/pages-create.css";
$extra_js = ["/assets/js/clipboard.js", "/assets/js/pow.js", "/assets/js/create.js"];

require_once __DIR__ . '/../app/includes/head.php';
?>
<script nonce="<?= $nonce ?>">
    window.POW_CHALLENGE = "<?php echo $powChallenge; ?>";
</script>
<?php
require_once __DIR__ . '/../app/includes/layout-open.php';
require_once __DIR__ . '/../app/includes/header.php';
?>

<main class="site-main workspace">

    <!-- ==========================================
         BLOCK A: KOPFBEREICH
         Rein informativ. Keine Interaktion.
         ========================================== -->
    <header class="workspace-header text-center" style="display: flex; flex-direction: column; align-items: center;">
        <div class="accent-mark" style="width: 24px; height: 3px; background-color: var(--color-accent); margin-bottom: var(--space-sm);"></div>
        <h1 class="workspace-title" style="margin-bottom: 0;">Create a message</h1>
        <p class="workspace-intro" style="margin-top: var(--space-xs); margin-bottom: var(--space-xl);">
            Write a message, generate a link, let access stay brief.
        </p>
    </header>

    <form id="form-create" class="create-form" action="#" method="POST" novalidate style="display: flex; flex-direction: column; gap: var(--space-xl);">

        <!-- ==========================================
             BLOCK B: KOMPOSITIONSBEREICH
             Das Hauptobjekt der Seite.
             ========================================== -->
        <section class="form-group composition-area">
            <!-- 
                 1. DAS NACHRICHTENFELD (id="messageText")
                 Aufgabe: Eingabe der eigentlichen Nachricht.
                 Regel: Keine Speicherung im Browser. Kein Dictate. Kein Grammarly. 
            -->
            <label for="messageText" class="sr-only">Your message</label>
            <textarea id="messageText" name="message" class="form-control form-textarea" placeholder="Write your message here" style="border-radius: 0; box-shadow: 0 4px 20px rgba(0,0,0,0.06);" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-gramm="false" maxlength="100000" required autofocus></textarea>
            
            <div class="composition-footer" style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: var(--space-sm);">
                <div id="message-error" class="text-sm font-medium" style="color: #b75555; display: none; opacity: 0.9;"></div>
                <div id="char-counter" class="text-xs text-muted" style="margin-left: auto; opacity: 0.5; transition: opacity 0.2s ease, color 0.2s ease;">0 / 100,000</div>
            </div>
        </section>

        <!-- ==========================================
             BLOCK C: STEUERBEREICH
             SekundÃ¤re Ebene. Modular und ruhig.
             ========================================== -->
        <section class="settings-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-xl);">
            
            <div class="settings-column stack-md">
                
                <!-- 
                     2. DIE ABLAUFZEIT-AUSWAHL (id="expiry")
                     Aufgabe: Begrenzte Auswahl mit einfachen Zeitwerten.
                     Regelt: Wie lange eine Nachricht auf dem Server erhalten bleiben darf
                     (unabhÃ¤ngig davon, ob sie gelesen wurde oder nicht).
                -->
                <div class="form-group stack-xs">
                    <label for="expiry" style="display: block; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted);">01. Expiration</label>
                    <select id="expiry" name="expiry" class="form-control form-select" style="border-radius: 0; background: transparent; border-width: 0 0 1px 0; border-color: var(--color-border-subtle); padding-left: 0; padding-bottom: 0.4rem; font-size: 1.1em; color: var(--color-text-base);">
                        <option value="10_minutes">10 minutes</option>
                        <option value="1_hour" selected>1 hour</option>
                        <option value="24_hours">24 hours</option>
                        <option value="7_days">7 days</option>
                    </select>
                    <span class="text-xs text-muted" style="display: block; margin-top: 0.35rem; opacity: 0.8; line-height: 1.4;">
                        The message is removed after this time if it is not accessed earlier. Retention stays intentionally brief.
                    </span>
                </div>
                
                <!-- 
                     3. DER SINGLE-USE-SCHALTER (id="one_time")
                     Aufgabe: Ein einfaches Ja/Nein-Element.
                     Regelt: Ob eine Nachricht nach dem ersten erfolgreichen Ã–ffnen 
                     unbrauchbar wird.
                -->
                <div class="form-group protection-card" style="display: flex; align-items: flex-start; gap: var(--space-md); margin-top: var(--space-xl); padding: var(--space-md) var(--space-lg); background-color: var(--color-bg-surface); border-left: 3px solid var(--color-accent);">
                    <div class="custom-toggle" style="margin-top: 0.15rem;">
                        <input type="checkbox" id="one_time" name="one_time" class="form-checkbox" checked style="width: 1.25rem; height: 1.25rem; accent-color: var(--color-accent); cursor: pointer;">
                    </div>
                    <div class="toggle-label-group" style="flex: 1;">
                        <label for="one_time" style="display: block; cursor: pointer; font-weight: 600; font-size: 1rem; color: var(--color-text-base);">Single-use access</label>
                        <span class="text-sm text-muted" style="display: block; margin-top: 0.35rem; line-height: 1.5; opacity: 0.85;">
                            The message becomes unavailable after the first successful view. Once opened successfully, the stored copy is no longer kept available.
                        </span>
                    </div>
                </div>
            </div>

            <div class="settings-column stack-md">
                <!-- 
                     4. DAS OPTIONALE PASSPHRASE-FELD (id="passphrase")
                     Aufgabe: Ein zusÃ¤tzliches Schutzfeld.
                     Regelt: Ob neben dem lokalen SchlÃ¼ssel noch ein 
                     zweiter geheimer Faktor zur EntschlÃ¼sselung nÃ¶tig ist.
                -->
                <div class="form-group stack-xs">
                    <label for="passphrase" style="display: block; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted);">02. Protection</label>
                    <input type="password" id="passphrase" name="passphrase" class="form-control form-input passphrase-input" placeholder="Additional passphrase" maxlength="128">
                    <span class="text-xs text-muted" style="display: block; margin-top: 0.35rem; line-height: 1.4; opacity: 0.85;">
                        Acts as a second layer of derivation. The link and this phrase must be shared through completely separate channels for maximum security.
                    </span>
                </div>
            </div>

        </section>

        <!-- ==========================================
             BLOCK D: AKTIONS- UND ERGEBNISBEREICH
             Entscheidungskante & Status-Feedback.
             ========================================== -->
        <section class="actions-and-feedback" style="border-top: 2px solid var(--color-text-base); padding-top: var(--space-lg);">
            
            <div class="button-group" style="display: flex; gap: var(--space-sm); justify-content: flex-end;">
                <!-- 
                     6. DER SEKUNDÃ„R-BUTTON (id="btn-clear")
                     Aufgabe: Setzt die Seite restlos und sauber zurÃ¼ck.
                -->
                <button type="reset" id="btn-clear" class="btn btn-secondary" style="border-radius: 0;">Clear</button>

                <!-- 
                     5. DER PRIMÃ„R-BUTTON (id="btn-create")
                     Aufgabe: Startet spÃ¤ter den Krypto-Load und die Erzeugung der Nachricht.
                -->
                <button type="submit" id="btn-create" class="btn btn-primary" disabled style="border-radius: 0; padding-left: 2.5rem; padding-right: 2.5rem;">Seal & Generate Link</button>
            </div>

            <!-- 
                 7 & 8. STATUS- UND ERGEBNISFLÃ„CHE (id="status-workspace")
                 Fest verbaut, kein "Aufpoppen". 
            -->
            <div class="status-workspace" id="status-workspace" style="margin-top: var(--space-xl); border-top: 1px solid var(--color-border-subtle); padding-top: var(--space-lg);">
                
                <!-- Zone 1: Statusmeldung mit Status-Leuchte -->
                <div class="status-indicator" style="display: flex; align-items: flex-start; gap: var(--space-md);">
                    <!-- Leuchte (Grau=Ready, Gelb=Generating, GrÃ¼n=Success, Rot=Error) -->
                    <div id="status-light" style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--color-text-muted); opacity: 0.5; margin-top: 0.45rem; flex-shrink: 0; transition: background-color 0.3s ease, opacity 0.3s ease;"></div>
                    
                    <!-- Textmeldung -->
                    <div id="status-text-container">
                        <h3 id="status-headline" class="text-base" style="margin: 0; font-weight: 600; color: var(--color-text-base); transition: color 0.3s ease;">Ready to create a sealed link.</h3>
                        <p id="status-subline" class="text-sm text-muted" style="margin: 0.15rem 0 0 0; line-height: 1.4;">Configure the message and generate a link.</p>
                    </div>
                </div>

                <!-- Proof-of-Work Hint (Schritt 81) -->
                <div class="pow-hint text-xs text-muted" style="margin-left: calc(8px + var(--space-md)); margin-top: var(--space-sm); opacity: 0.7; margin-bottom: var(--space-md);">
                    <p style="margin: 0; display: flex; align-items: flex-start; gap: 6px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; margin-top: 1px;"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line></svg>
                        <span><strong>Zero-Trace Antispam:</strong> Your browser solves a small puzzle to secure the service without tracking or IP logging. This takes less than a second.</span>
                    </p>
                </div>

                <!-- Zone 2 & 3: Ergebnisbereich und Hinweise - Initial versteckt -->
                <div id="status-result" style="display: none; margin-top: var(--space-lg); padding-left: calc(8px + var(--space-md));">
                    <div style="display: flex; flex-wrap: wrap; gap: var(--space-xs);">
                        <input type="text" id="result-link" class="form-control form-input" value="https://erase.to/#/placeholder" readonly style="border-radius: 0; font-family: monospace; font-size: var(--text-sm); text-align: left; padding: 0.85rem 1rem; flex: 1; min-width: 200px; background-color: var(--color-bg-surface); border-color: var(--color-border-subtle); cursor: text;">
                        <button type="button" id="btn-copy" class="btn btn-primary" style="border-radius: 0; padding-left: 1.5rem; padding-right: 1.5rem; transition: all 0.2s ease;">Copy link</button>
                    </div>
                    
                    <!-- Zone 3: Sicherheits- und Teilhinweise -->
                    <div class="result-hints" style="margin-top: var(--space-md); padding: var(--space-md); background-color: var(--color-bg-surface); border-left: 2px solid var(--color-accent);">
                        <p class="text-sm text-muted" style="margin: 0; line-height: 1.5;">
                            <strong style="color: var(--color-text-base);">Share the link and any optional passphrase separately.</strong><br>
                            The local secret component should not be sent through the same channel if stronger separation is desired.
                        </p>
                        <p class="text-xs text-muted" style="margin: var(--space-xs) 0 0 0; opacity: 0.8;">
                            Availability depends on the selected retention window and access mode.
                        </p>
                    </div>
                </div>

            </div>

        </section>

        <!-- ==========================================
             BLOCK E: VERTRAUENS- UND TECHNIKHINWEIS
             Ruhig, knapp, nicht alarmistisch.
             ========================================== -->
        <section class="hints-area text-xs text-muted" style="opacity: 0.8; text-align: left; margin-top: var(--space-lg);">
            The secret key is never sent to the server in readable form. The final link mathematically separates the storage identifier and your local decryption component.
        </section>

    </form>
</main>

<?php
require_once __DIR__ . '/../app/includes/footer.php';
require_once __DIR__ . '/../app/includes/layout-close.php';
?>
