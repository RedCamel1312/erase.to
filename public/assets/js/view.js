// public/assets/js/view.js
// State Machine und Krypto-Logik für die Entschlüsselungsseite

document.addEventListener('DOMContentLoaded', () => {

    // --- SCHRITT 71: FRAGMENT-ENTORGUNG (URL CLEANUP) ---
    // Der kryptografische Schlüssel wird genau einmal beim Start eingelesen
    // und sofort aus der Adresszeile und der Browser-History getilgt.
    let localKeyHex = window.location.hash.substring(1);
    if (localKeyHex) {
        // Sofortige Tilgung: Der Schlüssel existiert ab jetzt nur noch im flüchtigen RAM (localKeyHex).
        // history.replaceState überschreibt den aktuellen Eintrag ohne Hash.
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
    
    // UI Konstanten entsprechend der festen 5-Zonen Architektur
    const stateIcon = document.getElementById('state-icon');
    const stateTitle = document.getElementById('state-title');
    const stateIndicator = document.getElementById('state-indicator');
    
    const actionPrompt = document.getElementById('state-action-prompt');
    const messageContentArea = document.getElementById('message-content-area');
    const messageActionsArea = document.getElementById('message-actions-area');
    
    const readonlyMessage = document.getElementById('readonly-message');
    const btnUnlock = document.getElementById('btn-unlock');
    const passInput = document.getElementById('unlock-passphrase');
    
    // Monochrom-puristische SVG Icons für den Status
    const SVG_KEY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>';
    const SVG_DOWN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    const SVG_LOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    const SVG_CPU = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>';
    const SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const SVG_X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    // Harte Liste der vorgesehenen Lese-States
    const STATES = {
        WAITING:            { icon: SVG_KEY, title: 'Waiting for link data...', color: 'var(--color-text-muted)' },
        LOADING:            { icon: SVG_DOWN, title: 'Loading...', color: 'var(--color-text-muted)' },
        RECEIVED:           { icon: SVG_CHECK, title: 'Package received.', color: 'var(--color-text-muted)' },
        PROMPT_PASS:        { icon: SVG_LOCK, title: 'Password required.', color: 'var(--color-text-base)' },
        DECRYPTING:         { icon: SVG_CPU, title: 'Decrypting locally...', color: '#c98e54' },
        READY:              { icon: SVG_CHECK, title: 'Decrypted locally.', color: '#55b776' },
        CLEARED:            { icon: SVG_KEY, title: 'Local view cleared.', color: 'var(--color-text-muted)' },
        
        ERR_ID_MISSING:     { icon: SVG_X, title: 'Message missing.', color: '#b75555' },
        ERR_SECRET_MISSING: { icon: SVG_X, title: 'Local secret missing.', color: '#b75555' },
        ERR_NOT_FOUND:      { icon: SVG_X, title: 'Message not found.', color: '#b75555' },
        ERR_EXPIRED:        { icon: SVG_X, title: 'Message expired.', color: '#b75555' },
        ERR_DECRYPT_FAIL:   { icon: SVG_X, title: 'Decryption failed.', color: '#b75555' },
        ERR_CONSUMED:       { icon: SVG_X, title: 'Message consumed.', color: '#b75555' }
    };

    function setViewState(stateObj, customDesc = null) {
        stateIcon.innerHTML = stateObj.icon;
        
        // Custom Desc Override für bestimmte UI-Fehlermeldungen im Indicator
        stateTitle.textContent = customDesc || stateObj.title;
        
        // Farbe der Status-Badge (Bereich B) setzen
        if (stateObj.color === '#b75555') {
            stateIndicator.style.borderColor = 'rgba(183, 85, 85, 0.4)';
            stateIndicator.style.color = '#b75555';
            stateIndicator.style.backgroundColor = 'rgba(183, 85, 85, 0.05)';
        } else if (stateObj.color === '#55b776') {
            stateIndicator.style.borderColor = 'rgba(85, 183, 118, 0.3)';
            stateIndicator.style.color = '#55b776';
            stateIndicator.style.backgroundColor = 'rgba(85, 183, 118, 0.08)';
        } else {
            stateIndicator.style.borderColor = 'var(--color-border-subtle)';
            stateIndicator.style.color = 'var(--color-text-muted)';
            stateIndicator.style.backgroundColor = 'var(--color-bg-surface)';
        }
        
        // Bereich C (Prompt): Nur sichtbar, wenn explizit Passwort gefordert wird
        if (stateObj === STATES.PROMPT_PASS) {
            actionPrompt.style.display = 'flex';
            setTimeout(() => passInput.focus(), 50);
        } else {
            actionPrompt.style.display = 'none'; 
        }
        
        // Bereich D & E: Nur sichtbar, wenn Status Ready ist
        const securityWarnings = document.getElementById('security-warnings');
        if (stateObj === STATES.READY) {
            messageContentArea.style.display = 'block';
            messageActionsArea.style.display = 'flex';
            if (securityWarnings) securityWarnings.style.display = 'none';
        } else {
            messageContentArea.style.display = 'none';
            messageActionsArea.style.display = 'none';
            // Bei Fehlern oder Wartezustand die Warnungen wieder zeigen (falls sie da waren)
            if (securityWarnings && stateObj !== STATES.CLEARED) securityWarnings.style.display = 'block';
        }
    }

    // =========================================================================
    // CRYPTO HELPER (WebCrypto API Wrapper für Decryption)
    // =========================================================================
    const CryptoHelper = {
        async deriveKey(localSecretHex, passphraseValue = null, saltHex = null, iterations = 210000) {
            const encoder = new TextEncoder();
            const baseMaterial = localSecretHex + (passphraseValue ? passphraseValue : '');
            
            if (passphraseValue && saltHex) {
                const baseKey = await window.crypto.subtle.importKey(
                    'raw', encoder.encode(baseMaterial), { name: 'PBKDF2' }, false, ['deriveKey']
                );
                
                const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                return await window.crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
                    baseKey,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['decrypt']
                );
            } else {
                const hash = await window.crypto.subtle.digest('SHA-256', encoder.encode(baseMaterial));
                return await window.crypto.subtle.importKey(
                    'raw', hash, { name: 'AES-GCM' }, false, ['decrypt']
                );
            }
        },
        
        base64ToUint8(base64) {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        }
    };

    // =========================================================================
    // EXECUTION PIPELINE
    // =========================================================================
    async function attemptDecryption(storagePayload, localKeyHex, passphraseValue, publicId) {
        setViewState(STATES.DECRYPTING);
        // Künstliches UX-Pacing für sichtbaren Status-Übergang
        await new Promise(r => setTimeout(r, 400));
        
        try {
            // 1. Differentieller AES-Key ableiten
            const aesKey = await CryptoHelper.deriveKey(
                localKeyHex, 
                passphraseValue, 
                storagePayload.kdf_salt, 
                storagePayload.kdf_iterations
            );

            // 2. Base64 Strings zu Buffer wandeln
            const ivBytes = CryptoHelper.base64ToUint8(storagePayload.crypto_iv);
            const cipherBytes = CryptoHelper.base64ToUint8(storagePayload.ciphertext);

            // 3. Echte Entschlüsselung (WebCrypto AES-GCM)
            // Schlägt hart fehl, wenn der Key oder der Auth Tag ungültig sind.
            const plaintextBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: ivBytes },
                aesKey,
                cipherBytes
            );

            // 4. Konvertieren & Parsen
            const decoder = new TextDecoder();
            const plaintextPackage = JSON.parse(decoder.decode(plaintextBuffer));

            // 5. Strikte Form-Prüfung Ebene A
            if (!plaintextPackage || plaintextPackage.format_version !== 1 || !plaintextPackage.message_content) {
                throw new Error("FORMAT_INVALID");
            }

            // 6. Erfolg: Content anzeigen!
            readonlyMessage.textContent = plaintextPackage.message_content;
            setViewState(STATES.READY);
            
            // 7. Serverseitigen Burn-Prozess auslösen (Single-Use Verbrauch)
            // Dies passiert BEWUSST erst, wenn der Text lokal unbeschadet im RAM liegt.
            if (storagePayload.is_single_use) {
                try {
                    const consumeRes = await fetch('/api/consume-message.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ public_id: publicId })
                    });
                    if (!consumeRes.ok) throw new Error("Consume status code: " + consumeRes.status);
                } catch (burnErr) {
                    console.warn("Server burn unconfirmed.", burnErr);
                    const statusText = document.getElementById('message-status-text');
                    if (statusText) {
                        statusText.innerHTML = `
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b75555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                            <span style="color: #b75555; font-weight: 500;">Burn unconfirmed</span>
                        `;
                    }
                }
            }
            
            return true;

        } catch (error) {
            console.warn("Local decryption pipeline failed:", error);
            return false;
        } finally {
            // --- SCHRITT 72: RAM-CONFINEMENT ---
            // Temporäre Puffer und Klartext-Objekte vernichten
            plaintextBuffer = null;
            plaintextPackage = null;
        }
    }

    async function startReadPipeline() {
        setViewState(STATES.WAITING);

        // 1. URL Parsen und extrahieren
        let publicId = null;
        const pathParts = window.location.pathname.split('/');
        const possibleId = pathParts[pathParts.length - 1];
        
        if (possibleId && possibleId.length === 12 && possibleId !== 'view.php') {
            publicId = possibleId;
        } else {
            const params = new URLSearchParams(window.location.search);
            publicId = params.get('id');
        }

        if (!publicId || publicId.length !== 12) {
            setViewState(STATES.ERR_ID_MISSING);
            return;
        }

        if (!localKeyHex || localKeyHex.trim().length < 16) {
            setViewState(STATES.ERR_SECRET_MISSING);
            return;
        }

        // 3. API Request ans Backend
        setViewState(STATES.LOADING);
        
        try {
            const response = await fetch('/api/get-message.php?id=' + encodeURIComponent(publicId));
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 404) {
                    throw new Error("404_MISSING");
                }
                if (response.status === 410) {
                    if (errData.error === "Message expired.") throw new Error("410_EXPIRED");
                    if (errData.error === "Message already consumed.") throw new Error("410_CONSUMED");
                    throw new Error("410_GONE");
                }
                throw new Error("API_ERROR");
            }
            
            const storagePayload = await response.json();
            setViewState(STATES.RECEIVED);
            await new Promise(r => setTimeout(r, 600)); // UX Pause
            
            // 4. Passphrase Check Routing
            if (storagePayload.requires_passphrase) {
                setViewState(STATES.PROMPT_PASS);
                
                const btnUnlock = document.getElementById('btn-unlock');
                const passInput = document.getElementById('unlock-passphrase');
                const errMsg = document.getElementById('passphrase-error-msg');
                
                // Helfer, der auf den Submit-Klick oder Enter wartet
                const waitForSubmit = () => new Promise(resolve => {
                    const clickHandler = () => { cleanup(); resolve(passInput.value); };
                    const keyHandler = (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); cleanup(); resolve(passInput.value); }
                    };
                    const cleanup = () => {
                        btnUnlock.removeEventListener('click', clickHandler);
                        passInput.removeEventListener('keypress', keyHandler);
                    };
                    btnUnlock.addEventListener('click', clickHandler);
                    passInput.addEventListener('keypress', keyHandler);
                });

                let decryptionSuccess = false;
                
                while (!decryptionSuccess) {
                    const passValue = await waitForSubmit();
                    if (!passValue) continue; // Leere Submits stumm ignorieren
                    
                    // UI beruhigen für den Ausführungsversuch
                    errMsg.style.display = 'none';
                    
                    decryptionSuccess = await attemptDecryption(storagePayload, localKeyHex, passValue, publicId);
                    
                    if (!decryptionSuccess) {
                        // Fehlschlag: Rückkehr in den Passphrase Prompt, aber MIT krassem Hinweis
                        setViewState(STATES.PROMPT_PASS);
                        errMsg.style.display = 'block';
                        passInput.value = ''; // Feld leeren für neuen Versuch
                        passInput.focus();
                    } else {
                        // Erfolg! Spurenverwischung
                        passInput.value = '';
                    }
                }

            } else {
                const success = await attemptDecryption(storagePayload, localKeyHex, null, publicId);
                // Ohne Passphrase gibt es keine 2. Chance: Wenn das hier knallt, knallt es hart.
                if (!success) {
                    setViewState(STATES.ERR_DECRYPT_FAIL);
                }
            }
            
        } catch (e) {
            if (e.message === "404_MISSING") setViewState(STATES.ERR_NOT_FOUND, "This link is invalid or the package never existed.");
            else if (e.message === "410_EXPIRED") setViewState(STATES.ERR_EXPIRED, "The retention period for this package has safely passed.");
            else if (e.message === "410_CONSUMED") setViewState(STATES.ERR_CONSUMED, "This single-use message has already been viewed and destroyed.");
            else if (e.message === "410_GONE") setViewState(STATES.ERR_EXPIRED, "The message is no longer available.");
            else setViewState(STATES.ERR_NOT_FOUND, "Network error or package read failure.");
        }
    }

    // =========================================================================
    // POST-DECRYPTION ACTIONS
    // =========================================================================
    const btnCopyContent = document.getElementById('btn-copy-content');
    const btnClearView = document.getElementById('btn-clear-view');

    if (btnCopyContent) {
        btnCopyContent.addEventListener('click', async () => {
            const textToCopy = readonlyMessage.textContent;
            
            // Abfangen: Lokaler View wurde bereits geleert oder ist noch nicht bereit
            if (!textToCopy || textToCopy.trim() === '') {
                const orig = btnCopyContent.textContent;
                btnCopyContent.textContent = 'Nothing to copy';
                setTimeout(() => btnCopyContent.textContent = orig, 2500);
                return;
            }

            try {
                // Präzise Kopie NUR des reinen entschlüsselten Content-Strings
                await navigator.clipboard.writeText(textToCopy);
                const orig = btnCopyContent.textContent;
                btnCopyContent.textContent = 'Copied';
                setTimeout(() => btnCopyContent.textContent = orig, 2000);
            } catch (err) {
                // Fallback für striktere Mobile Browser ohne Clipboard Permission
                console.warn("Clipboard API blocked, using fallback.", err);
                try {
                    const fallbackArea = document.createElement("textarea");
                    fallbackArea.value = textToCopy;
                    // Nimm es aus dem sichtbaren Viewport
                    fallbackArea.style.position = "fixed";
                    fallbackArea.style.top = "-9999px";
                    document.body.appendChild(fallbackArea);
                    fallbackArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(fallbackArea);
                    
                    const orig = btnCopyContent.textContent;
                    btnCopyContent.textContent = 'Copied';
                    setTimeout(() => btnCopyContent.textContent = orig, 2000);
                } catch (fallbackErr) {
                    console.error("All copy mechanisms failed.", fallbackErr);
                }
            }
        });
    }

    if (btnClearView) {
        btnClearView.addEventListener('click', () => {
            // 1. DOM hart leeren (Löscht den Klartext aus dem UI)
            readonlyMessage.textContent = '';
            
            // 2. Passphrase Input nullen
            if (passInput) passInput.value = '';
            
            // 3. Jegliche potenziellen Text-Markierungen aufheben
            if (window.getSelection) {
                window.getSelection().removeAllRanges();
            }

            // 4. --- SCHRITT 72: EXPLIZITE RAM-TILGUNG ---
            // Wir nullen die sensiblen lokalen Pointer aktiv.
            localKeyHex = null;
            
            // In neutralen UI-State wechseln (versteckt den Kasten und die Copy-Buttons final)
            setViewState(STATES.CLEARED);
            
            console.log("OpSec: Local RAM secrets nullified.");
        });
    }

    // =========================================================================
    // SCHRITT 80: AGGRESSIVER LOKALER LEBENSZYKLUS (Visibility & Inactivity)
    // =========================================================================
    
    // 1. Automatischer Cleanup bei Tab-Wechsel oder Minimierung
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && localKeyHex) {
            console.log("OpSec: Tab hidden. Purging local secrets.");
            btnClearView.click();
        }
    });

    // 2. Inaktivitäts-Timer (5 Minuten)
    let inactivityTimeout = null;
    const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 Minuten

    function resetInactivityTimer() {
        if (inactivityTimeout) clearTimeout(inactivityTimeout);
        if (!localKeyHex) return; // Kein Timer nötig, wenn nichts entschlüsselt ist

        inactivityTimeout = setTimeout(() => {
            console.log("OpSec: Inactivity limit reached. Purging local secrets.");
            btnClearView.click();
        }, INACTIVITY_LIMIT);
    }

    // Timer nur starten/resetten, wenn tatsächlich eine Nachricht im RAM ist
    ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    
    // 100ms Puffer nach DOM Load
    setTimeout(startReadPipeline, 100);
});
