<?php
namespace App\Messages;

class PublicId {
    public const LENGTH = 12;
    // Basis-Satz ohne leicht verwechselbare Zeichen (kein O, 0, I, l)
    public const CHARSET = 'abcdefghjkmnpqrstuvwxyz123456789';

    /**
     * Erzeugt eine kryptografisch sichere, unvorhersehbare ID.
     */
    public static function generate(): string {
        $id = '';
        $maxIndex = strlen(self::CHARSET) - 1;
        try {
            for ($i = 0; $i < self::LENGTH; $i++) {
                $id .= self::CHARSET[random_int(0, $maxIndex)];
            }
        } catch (\Exception $e) {
            // Extrem-Fallback: cryptographically secure pseudo-random bytes
            $fallback = bin2hex(random_bytes(self::LENGTH));
            $id = substr($fallback, 0, self::LENGTH);
        }
        return $id;
    }

    /**
     * Prüft streng, ob eine ID dem erlaubten Format entspricht.
     * Verhindert Dateisystem-Injection und wilde Queries vorab.
     */
    public static function isValid(string $id): bool {
        if (strlen($id) !== self::LENGTH) {
            return false;
        }
        
        $pattern = '/^[' . self::CHARSET . ']+$/';
        if (!preg_match($pattern, $id)) {
            // Fallback für den bin2hex-Notfall des CSRNG
            if (!preg_match('/^[a-f0-9]{' . self::LENGTH . '}$/', $id)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Erzeugt eine absolut eindeutige ID gegen das übergebene Storage.
     */
    public static function generateUnique(Storage $storage): string {
        $maxAttempts = 5;
        for ($i = 0; $i < $maxAttempts; $i++) {
            $id = self::generate();
            if (!$storage->exists($id)) {
                return $id;
            }
        }
        throw new \RuntimeException("Storage is exhausted or randomizer failed to provide unique ID.", 500);
    }
}
