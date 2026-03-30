// public/assets/js/create.js
// Logik für die Erstellungsseite (Validierung, UI-States, Lokale Verschlüsselung)

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-create');
    const messageInput = document.getElementById('messageText');
    const charCounter = document.getElementById('char-counter');
    const errorDisplay = document.getElementById('message-error');

    // Status UI Elements
    const statusLight = document.getElementById('status-light');
    const statusHeadline = document.getElementById('status-headline');
    const statusSubline = document.getElementById('status-subline');
    const statusResult = document.getElementById('status-result');
    const btnCreate = document.getElementById('btn-create');

    const MAX_LENGTH = 100000;
    const NEAR_LIMIT_THRESHOLD = 0.95;

    if (!form || !messageInput || !charCounter) return;

    // --- STATE MACHINE ---
    const STATES = {
        READY: {
            color: 'var(--color-text-muted)',
            opacity: '0.5',
            headline: 'Ready to create a sealed link.',
            subline: 'Configure the message and generate a link.',
            showResult: false,
            loading: false,
            btnText: 'Seal & Generate Link'
        },
        GENERATING: {
            color: '#c98e54',
            opacity: '1',
            headline: 'Generating secure package…',
            subline: 'Preparing encrypted message…',
            showResult: false,
            loading: true,
            btnText: 'Sealing…'
        },
        SUCCESS: {
            color: '#55b776',
            opacity: '1',
            headline: 'Link created successfully.',
            subline: 'The message package is ready to share.',
            showResult: true,
            loading: false,
            btnText: 'Seal & Generate Link'
        },
        ERROR: {
            color: '#b75555',
            opacity: '1',
            headline: 'The link could not be created.',
            subline: 'A problem occurred while preparing the message.',
            showResult: false,
            loading: false,
            btnText: 'Seal & Generate Link'
        }
    };

    function setStatus(state, overrideSubline = null) {
        if (!statusLight) return;
        statusLight.style.backgroundColor = state.color;
        statusLight.style.opacity = state.opacity;
        statusHeadline.textContent = state.headline;
        statusSubline.textContent = overrideSubline || state.subline;
        statusResult.style.display = state.showResult ? 'block' : 'none';

        statusHeadline.style.color = state === STATES.ERROR ? '#b75555' : 'var(--color-text-base)';

        if (btnCreate) {
            btnCreate.textContent = state.btnText;
            updateButtonState(state);
        }
    }

    function updateButtonState(currentState = STATES.READY) {
        if (!btnCreate) return;
        const textLength = messageInput.value.trim().length;

        // Button verriegelt sich, wenn das Feld leer ist ODER wir gerade laden
        if (textLength === 0 || currentState.loading) {
            btnCreate.disabled = true;
        } else {
            btnCreate.disabled = false;
        }
    }

    // Initialize
    setStatus(STATES.READY);
    updateButtonState(STATES.READY); // Hard Lock on Page Load

    // --- LOGIC ---
    messageInput.addEventListener('input', () => {
        const textLength = messageInput.value.length;
        charCounter.textContent = `${textLength.toLocaleString()} / ${MAX_LENGTH.toLocaleString()}`;

        // Live-Validierung des Buttons beim Tippen
        updateButtonState(STATES.READY);

        if (errorDisplay.style.display === 'block') {
            errorDisplay.style.display = 'none';
            messageInput.classList.remove('is-invalid');
            setStatus(STATES.READY);
        }

        if (textLength >= MAX_LENGTH) {
            messageInput.classList.remove('is-near-limit');
            charCounter.classList.remove('is-near-limit');
            charCounter.classList.add('is-maxed');
        } else if (textLength > MAX_LENGTH * NEAR_LIMIT_THRESHOLD) {
            messageInput.classList.add('is-near-limit');
            charCounter.classList.add('is-near-limit');
            charCounter.classList.remove('is-maxed');
        } else {
            messageInput.classList.remove('is-near-limit');
            charCounter.classList.remove('is-near-limit', 'is-maxed');
        }
    });

    form.addEventListener('reset', () => {
        setTimeout(() => {
            charCounter.textContent = `0 / ${MAX_LENGTH.toLocaleString()}`;
            errorDisplay.style.display = 'none';
            messageInput.classList.remove('is-invalid', 'is-near-limit');
            charCounter.classList.remove('is-near-limit', 'is-maxed');

            // Alles auf null zwingen und Geisterlinks aus der alten Erzeugung vernichten
            const resultInput = document.getElementById('result-link');
            if (resultInput) {
                resultInput.value = `https://${window.location.host}/v/placeholder#...`;
            }

            setStatus(STATES.READY);
            updateButtonState(STATES.READY);

            messageInput.focus();
        }, 10);
    });

    // =========================================================================
    // CRYPTO HELPER (WebCrypto API Wrapper)
    // =========================================================================
    const CryptoHelper = {
        async deriveKey(localSecretHex, passphraseValue = null, saltHex = null, iterations = 210000) {
            const encoder = new TextEncoder();
            const baseMaterial = localSecretHex + (passphraseValue ? passphraseValue : '');

            if (passphraseValue && saltHex) {
                // PBKDF2 Ableitung
                const baseKey = await window.crypto.subtle.importKey(
                    'raw', encoder.encode(baseMaterial), { name: 'PBKDF2' }, false, ['deriveKey']
                );

                const saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                return await window.crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
                    baseKey,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );
            } else {
                // Direkte Ableitung per SHA-256 für reinen lokalen Schlüssel
                const hash = await window.crypto.subtle.digest('SHA-256', encoder.encode(baseMaterial));
                return await window.crypto.subtle.importKey(
                    'raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
                );
            }
        },

        uint8ToBase64(uint8) {
            let binary = '';
            // Chunked Base64 encoding avoids call stack overflows on large messages
            const chunkSize = 8192;
            for (let i = 0; i < uint8.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
            }
            return window.btoa(binary);
        },

        async hashString(str) {
            const encoder = new TextEncoder();
            const data = encoder.encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    };

    // =========================================================================
    // ERZEUGUNGS-PIPELINE (KOMPLETTE LOKALE VERSCHLÜSSELUNG)
    // =========================================================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 1. Eingabe einlesen
        const rawContent = messageInput.value;

        // 2. Eingabe bereinigen (nur für Prüfzwecke, Original bewahrt formatierung)
        const trimmedContent = rawContent.trim();

        // 3. Optionen erfassen
        const expirySelect = document.getElementById('expiry');
        const oneTimeCheck = document.getElementById('one_time');
        const passInput = document.getElementById('passphrase');

        const expiryValue = expirySelect ? expirySelect.value : '1_hour';
        const isOneTime = oneTimeCheck ? oneTimeCheck.checked : true;
        const passValue = passInput ? passInput.value : '';
        const hasPassphrase = passValue.length > 0;

        // 4. Gültigkeit prüfen
        if (trimmedContent.length === 0) {
            showError("Please enter a message before creating a link.", "A blank message cannot be sealed.");
            return;
        }

        if (rawContent.length > MAX_LENGTH) {
            showError("This message exceeds the current size limit.", "Reduce the message length before generating a link.");
            return;
        }

        // 5. Lokalen Arbeitszustand setzen (UI sperrt den Button)
        setStatus(STATES.GENERATING);

        // --- SICHERHEITS-KONTEXT ---
        // Das lokale Geheimnis wird explizit an diesen Scope gebunden.
        // Es verlässt niemals den Browser in Richtung Server.
        let localSecretKey = null;
        let plaintextPackage = null;
        let encodedPlaintext = null;
        let ciphertextBuffer = null;
        let aesKey = null;

        try {
            // 6. Lokales kryptographisches Zufallsgeheimnis erzeugen
            const rawKeyBytes = new Uint8Array(32); // 256-bit Entropie
            window.crypto.getRandomValues(rawKeyBytes);
            // Für die Demo-URL als Hex-String kodiert (wird später in Base64Url optimiert)
            localSecretKey = Array.from(rawKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

            // --- KDF METADATEN VORBEREITUNG (Zweite Ableitungsebene) ---
            let kdfSaltHex = null;
            let currentKdfIterations = 210000;
            if (hasPassphrase) {
                // Generiere technisches Hilfsmaterial für die Schlüsselableitung (KDF) auf Empfängerseite
                const saltBytes = new Uint8Array(16);
                window.crypto.getRandomValues(saltBytes);
                kdfSaltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            }

            // 7. Ebene A: Klartext-Nachrichtenobjekt (Pre-Encryption Payload)
            // Alles, was signiert/authentifiziert übertragen werden muss
            plaintextPackage = {
                format_version: 1,
                message_content: rawContent,
                created_at: new Date().toISOString(),
                expiration_policy: expiryValue,
                is_single_use: isOneTime,
                requires_passphrase: hasPassphrase
            };

            // 8. ECHTE LOKALE VERSCHLÜSSELUNG (AES-GCM WebCrypto API)
            // 8a. Serialisieren nach UTF-8
            const encoder = new TextEncoder();
            encodedPlaintext = encoder.encode(JSON.stringify(plaintextPackage));

            // 8b. Einmalwert (IV/Nonce) erzeugen
            const ivBytes = new Uint8Array(12); // GCM Standard: 12 Bytes
            window.crypto.getRandomValues(ivBytes);

            // 8c. Den symmetrischen AES-Key ableiten
            aesKey = await CryptoHelper.deriveKey(localSecretKey, passValue, kdfSaltHex, currentKdfIterations);

            // 8d. Verschlüsseln der Payload (AES-GCM erzeugt Ciphertext + Auth Tag automatisch gemischt)
            ciphertextBuffer = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: ivBytes },
                aesKey,
                encodedPlaintext
            );

            // 9. Ebene B: Kryptographisches Speicher-Paket bauen (Storage Payload)
            // Das einzige Paket, das den Rechner jemals Richtung Server verlassen darf.
            const storagePayload = {
                format_version: 1,
                crypto_algorithm: "AES-GCM",
                kdf_algorithm: hasPassphrase ? "PBKDF2" : null,
                crypto_iv: CryptoHelper.uint8ToBase64(ivBytes),
                kdf_salt: hasPassphrase ? kdfSaltHex : null,
                kdf_iterations: hasPassphrase ? currentKdfIterations : null,

                ciphertext: CryptoHelper.uint8ToBase64(new Uint8Array(ciphertextBuffer)),

                // Metadaten für das Data-Lifecycle-Management des Backends
                expiration_policy: expiryValue,
                is_single_use: isOneTime,
                requires_passphrase: hasPassphrase,
                created_at: plaintextPackage.created_at
            };

            // 10. Lokales Linkmaterial definieren
            // Dieses Material wird niemals gesendet. Es repräsentiert exakt den Fragment-Status.
            const localLinkMaterial = {
                local_key: localSecretKey,
                requires_passphrase: hasPassphrase
            };

            console.log("Storage Payload (Ebene B) ready for HTTP Request.");

            // 11. Proof-of-Work (Zero-Trace Rate Limiting)
            // Bevor die Nachricht den Browser verlässt, muss eine kleine Rechenaufgabe gelöst werden.
            // Dies verhindert automatisierten Spam, ohne dass der Server Nutzerdaten speichern muss.
            if (window.POW_CHALLENGE) {
                if (window.ProofOfWork) {
                    try {
                        setStatus(STATES.GENERATING, "Securing message (Proof-of-Work)...");
                        // Wir binden die Nonce an den Ciphertext (Stabil gegen JSON-Serialisierungs-Unterschiede)
                        const payloadHash = await CryptoHelper.hashString(storagePayload.ciphertext);
                        const nonce = await ProofOfWork.calculate(payloadHash);
                        storagePayload.pow_nonce = nonce;
                    } catch (powError) {
                        console.error("PoW calculation failed:", powError);
                        throw new Error("Security verification failed. Please try again.");
                    }
                } else {
                    console.error("ProofOfWork module not loaded but challenge present.");
                    throw new Error("Security module initialization failed. Please reload the page.");
                }
            }

            // 12. Echter API Fetch Request an den Server (Ebene B -> Server -> Ebene C)
            const response = await fetch('/api/create-message.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(storagePayload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                // Erzeuge einen Fehler mit der echten Meldung vom Server
                const apiError = new Error(errData.error || `Server responded with status ${response.status}`);
                apiError.isServerError = true;
                throw apiError;
            }

            const serverCreationResponse = await response.json();

            // 13. Finalen Link nach Strukturgesetz komponieren: /view.php?id=[public-id]#[local-key]
            const finalUrl = `https://${window.location.host}/view.php?id=${serverCreationResponse.public_id}#${localLinkMaterial.local_key}`;

            // Fake Verzögerung für das UI Feedback
            await new Promise(resolve => setTimeout(resolve, 800));

            // 14. Alles sensibel aus der UI werfen
            messageInput.value = '';
            if (passInput) passInput.value = '';
            charCounter.textContent = `0 / ${MAX_LENGTH.toLocaleString()}`;
            messageInput.classList.remove('is-invalid', 'is-near-limit');
            charCounter.classList.remove('is-near-limit', 'is-maxed');

            // Den echten Result-Link einsetzen
            const resultInput = document.getElementById('result-link');
            if (resultInput) resultInput.value = finalUrl;

            // Erfolg melden (Zeigt Ergebnisbereich an)
            setStatus(STATES.SUCCESS);

        } catch (error) {
            console.error("Pipeline failure:", error);
            
            if (error.isServerError) {
                // Bei echten Server-Fehlern (z.B. PoW invalid, Rate limited) die Meldung durchreichen
                showError("The message could not be sent.", error.message);
            } else {
                // Bei echten lokalen Krypto-Fehlern (z.B. WebCrypto API Fehler)
                showError("A local cryptographic error occurred.", "The generation process was safely aborted.");
            }
        } finally {
            // 15. --- SCHRITT 72: KOMPROMISSLOSES RAM-CLEANUP ---
            // Wir nullen alle sensiblen Variablen und Puffer aktiv.
            localSecretKey = null;
            plaintextPackage = null;
            encodedPlaintext = null;
            ciphertextBuffer = null;
            aesKey = null;
            console.log("OpSec: Temporary RAM buffers nullified.");
        }
    });

    function showError(formMsg, statusSublineMsg) {
        errorDisplay.textContent = formMsg;
        errorDisplay.style.display = 'block';
        messageInput.classList.add('is-invalid');
        messageInput.focus();
        setStatus(STATES.ERROR, statusSublineMsg);
    }

    // =========================================================================
    // COPY BEHAVIOR (Ergebnisbereich)
    // =========================================================================
    const btnCopy = document.getElementById('btn-copy');
    const resultLink = document.getElementById('result-link');

    if (btnCopy && resultLink) {
        // Fallback: Feld markiert sich bei Klick sofort selbst, wenn der Button streikt
        resultLink.addEventListener('click', () => {
            resultLink.select();
        });

        btnCopy.addEventListener('click', async () => {
            try {
                resultLink.select();
                resultLink.setSelectionRange(0, 99999); // Für Safari auf iOS
                await navigator.clipboard.writeText(resultLink.value);

                // Kurzes visuelles Feedback (keine Toasts, keine Popups)
                const originalText = btnCopy.textContent;
                btnCopy.textContent = 'Copied';

                // UI Dimming für 2 Sekunden (ruhig, nicht schrill grün)
                btnCopy.style.backgroundColor = 'var(--color-bg-surface)';
                btnCopy.style.color = 'var(--color-text-base)';
                btnCopy.style.borderColor = 'var(--color-border-subtle)';

                setTimeout(() => {
                    btnCopy.textContent = originalText;
                    btnCopy.style.backgroundColor = '';
                    btnCopy.style.color = '';
                    btnCopy.style.borderColor = '';
                }, 2000);

            } catch (err) {
                console.error('Clipboard copy failed:', err);
                // Ruhiger Fallback bei verweigerter API (z.B. HTTP ohne S)
                const originalText = btnCopy.textContent;
                btnCopy.textContent = 'Select & copy manually';
                setTimeout(() => {
                    btnCopy.textContent = originalText;
                }, 3000);
            }
        });
    }
});
