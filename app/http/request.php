<?php
namespace App\Http;

class Request {
    public static function isPost(): bool {
        return $_SERVER['REQUEST_METHOD'] === 'POST';
    }

    public static function isJson(): bool {
        $contentType = isset($_SERVER["CONTENT_TYPE"]) ? trim($_SERVER["CONTENT_TYPE"]) : '';
        return strpos($contentType, 'application/json') !== false;
    }

    public static function getJsonPayload(int $maxBytes = 200000): ?array {
        if (!self::isPost() || !self::isJson()) {
            return null;
        }

        // 1. Vorabprüfung via Content-Length Header (sofern vorhanden)
        $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
        if ($contentLength > $maxBytes) {
            return null;
        }

        // 2. Reading Buffer (limitiert auf maxBytes + 1 zur Überlauf-Erkennung)
        $rawBody = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        
        if (empty($rawBody) || strlen($rawBody) > $maxBytes) {
            return null; // Payload leer oder zu groß
        }

        return Json::decode($rawBody);
    }

    /**
     * Valideiert die Fetch Metadata Header (Sec-Fetch-*).
     * Schützt vor Cross-Site-Anfragen, CSRF und unbefugter Einbettung.
     * 
     * @return bool True if the request is legitimate same-origin or headers are not supported.
     */
    public static function validateFetchMetadata(): bool {
        $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? null;
        $mode = $_SERVER['HTTP_SEC_FETCH_MODE'] ?? null;

        // Wenn die Header da sind, MÜSSEN sie strikt denselben Ursprung verlangen.
        if ($site !== null && $site !== 'same-origin') {
            return false;
        }

        // Mode-Check: Wir erwarten cors für API calls (fetch) oder navigate/same-origin.
        // 'no-cors' ist ein Indiz für blinde Cross-Site-Anfragen (CSRF Risiko).
        if ($mode !== null && !in_array($mode, ['cors', 'navigate', 'same-origin'])) {
            return false;
        }

        return true;
    }
}
