<?php
namespace App\Messages;

class CreateHandler {
    public static function process(array $payload): array {
        // 1. Gnadenlose Validierung des Formats (wirft bei Fehlern InvalidArgumentException)
        Validator::validateStoragePayload($payload);

        // 2. Flat-File Storage Initialisierung
        $storagePath = __DIR__ . '/../../storage/messages';
        $storage = new Storage($storagePath);

        // 3. Eindeutige Public ID unter Kollisionskontrolle erzeugen
        $publicId = PublicId::generateUnique($storage);

        // 4. Berechnung des echten Server-Ablaufzeitpunkts
        $expiresAtTimestamp = self::calculateExpiryTime($payload['expiration_policy']);
        
        // 5. Speichern
        $saved = $storage->save($publicId, $payload, $expiresAtTimestamp);

        if (!$saved) {
            throw new \RuntimeException("Flat-file document storage failed.", 500);
        }

        // 5. Ebene C: Die öffentliche Server-Antwort bauen (kein Ciphertext, kein Key!)
        return [
            'public_id' => $publicId,
            'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $expiresAtTimestamp),
            'is_single_use' => $payload['is_single_use'],
            'requires_passphrase' => $payload['requires_passphrase']
        ];
    }

    private static function calculateExpiryTime(string $policy): int {
        $now = time();
        switch ($policy) {
            case '10_minutes': return $now + 600;
            case '1_hour': return $now + 3600;
            case '24_hours': return $now + 86400;
            case '7_days': return $now + 604800;
            default: return $now + 3600; // Sicherer 1 Hour Fallback
        }
    }
}
