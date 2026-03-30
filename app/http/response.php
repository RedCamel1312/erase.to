<?php
namespace App\Http;

class Response {
    /**
     * Setzt strikte Anti-Caching Header für sensible Daten.
     */
    public static function setNoStore(): void {
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Cache-Control: post-check=0, pre-check=0', false);
        header('Pragma: no-cache');
        header('Expires: 0');
        header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');

        // SCHRITT 76: Framing-Schutz (Absolut)
        header("X-Frame-Options: DENY");
        header("Content-Security-Policy: frame-ancestors 'none'");

        // SCHRITT 77: Browser-Feature Deaktivierung
        $p = "accelerometer=(), autoplay=(), camera=(), display-capture=(), fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()";
        header("Permissions-Policy: " . $p);
    }

    public static function json(array $data, int $statusCode = 200): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        self::setNoStore();
        echo json_encode($data, JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(string $message, int $statusCode = 400, string $errorCode = 'internal_error'): void {
        self::json([
            'error' => $message,
            'code' => $errorCode
        ], $statusCode);
    }
}
