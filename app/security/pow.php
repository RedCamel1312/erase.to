<?php
namespace App\Security;

/**
 * Proof-of-Work (Hashcash) Implementation for Zero-Trace Rate Limiting.
 */
class ProofOfWork {
    private const DIFFICULTY = 4; // Number of leading zeros (hex)
    private const WINDOW = 600;  // 10 minutes challenge validity

    /**
     * Erzeugt eine zeitbasierte Challenge (Stateless).
     * Ändert sich alle 10 Minuten.
     */
    public static function getChallenge(): string {
        $config = require __DIR__ . '/../config.php';
        $siteSecret = $config['site_secret'] ?? 'unsafe_default';
        
        // Aktuelles Zeitfenster
        $windowIndex = floor(time() / self::WINDOW);
        
        return hash_hmac('sha256', (string)$windowIndex, $siteSecret);
    }

    /**
     * Verifiziert eine Nonce gegen den aktuellen oder den vorherigen Challenge-Token.
     * (Zwei Fenster erlauben sanfte Übergänge für den User).
     */
    public static function verify(string $payloadRaw, string $nonce): bool {
        $config = require __DIR__ . '/../config.php';
        $siteSecret = $config['site_secret'] ?? 'unsafe_default';
        $now = time();
        
        $currentWindow = floor($now / self::WINDOW);
        $prevWindow = $currentWindow - 1;

        $attempts = [
            hash_hmac('sha256', (string)$currentWindow, $siteSecret),
            hash_hmac('sha256', (string)$prevWindow, $siteSecret)
        ];

        foreach ($attempts as $challenge) {
            $hash = hash('sha256', $challenge . $payloadRaw . $nonce);
            if (str_starts_with($hash, str_repeat('0', self::DIFFICULTY))) {
                return true;
            }
        }

        return false;
    }
}
