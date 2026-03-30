<?php
namespace App\Security;

/**
 * Content Security Policy (CSP) Manager for erase.to
 */
class CspManager {
    private static ?string $nonce = null;

    /**
     * Generiert einen einmaligen Nonce für den aktuellen Request.
     */
    public static function getNonce(): string {
        if (self::$nonce === null) {
            self::$nonce = bin2hex(random_bytes(16));
        }
        return self::$nonce;
    }

    /**
     * Setzt den CSP-Header mit strikten Regeln.
     */
    public static function sendHeader(): void {
        $nonce = self::getNonce();
        
        $policy = [
            "default-src 'none'",
            "script-src 'self' 'nonce-{$nonce}'",
            "style-src 'self' 'unsafe-inline'", // Erlaubt lokale Styles und Inline-Styles für UI-Komponenten
            "connect-src 'self'",
            "img-src 'self' data:",
            "font-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests"
        ];

        header("Content-Security-Policy: " . implode("; ", $policy));
        
        header("X-Frame-Options: DENY");
        header("X-Content-Type-Options: nosniff");
        header("Referrer-Policy: no-referrer");

        // SCHRITT 77: Browser-Feature Deaktivierung
        $permissions = "accelerometer=(), ambient-light-sensor=(), autoplay=(), battery=(), camera=(), display-capture=(), document-domain=(), encrypted-media=(), fullscreen=(), gamepad=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), usb=(), screen-wake-lock=(), web-share=()";
        header("Permissions-Policy: " . $permissions);
    }
}
