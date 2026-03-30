/**
 * clipboard.js
 * Isolierte Lösung für das Zwischenablage-Verhalten.
 * Kapselt die Clipboard-API robuster vor Browser-Besonderheiten.
 */
const ClipboardUtility = {
    copy: async (textToCopy) => {
        try {
            await navigator.clipboard.writeText(textToCopy);
            return true;
        } catch (err) {
            console.warn('Clipboard API failed', err);
            // Späterer Fallback auf document.execCommand('copy') falls nötig
            return false;
        }
    }
};

window.ClipboardUtility = ClipboardUtility;
