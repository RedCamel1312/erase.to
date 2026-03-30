<?php
namespace App\Messages;

class Validator {
    private static array $schema = [
        'format_version'      => 'integer',
        'crypto_algorithm'    => 'string',
        'crypto_iv'           => 'string',
        'ciphertext'          => 'string',
        'expiration_policy'   => 'string',
        'is_single_use'       => 'boolean',
        'requires_passphrase' => 'boolean',
        'created_at'          => 'string',
        'kdf_algorithm'       => 'string',
        'kdf_salt'            => 'string',
        'kdf_iterations'      => 'integer',
        'pow_nonce'           => 'string'
    ];

    private static array $requiredBaseFields = [
        'format_version', 'crypto_algorithm', 'crypto_iv',
        'ciphertext', 'expiration_policy', 'is_single_use',
        'requires_passphrase', 'created_at'
    ];

    public static function validateStoragePayload(array $payload): void {
        // 1. Unbekannte Felder strikt ablehnen
        foreach ($payload as $key => $value) {
            if (!isset(self::$schema[$key])) {
                throw new \InvalidArgumentException("Unknown field detected: {$key}");
            }
        }

        // 2. Basis-Pflichtfelder auf Vorhandensein und Typ prüfen
        foreach (self::$requiredBaseFields as $field) {
            if (!isset($payload[$field])) {
                throw new \InvalidArgumentException("Missing required field: {$field}");
            }
            
            $expectedType = self::$schema[$field];
            $actualType = gettype($payload[$field]);
            if ($actualType !== $expectedType) {
                throw new \InvalidArgumentException("Field '{$field}' must be {$expectedType}, {$actualType} given.");
            }
        }

        // 3. Wert-Validierung
        if ($payload['format_version'] !== 1) {
            throw new \InvalidArgumentException("Unsupported format version. Expected: 1");
        }
        if ($payload['crypto_algorithm'] !== 'AES-GCM') {
            throw new \InvalidArgumentException("Unsupported crypto algorithm. Expected: AES-GCM");
        }

        $validExpirys = ['10_minutes', '1_hour', '24_hours', '7_days'];
        if (!in_array($payload['expiration_policy'], $validExpirys, true)) {
            throw new \InvalidArgumentException("Invalid expiration policy.");
        }

        // 4. Passphrasen-Abhängige Felder prüfen
        if ($payload['requires_passphrase'] === true) {
            $passFields = ['kdf_algorithm', 'kdf_salt', 'kdf_iterations'];
            foreach ($passFields as $f) {
                if (!isset($payload[$f])) {
                    throw new \InvalidArgumentException("Field '{$f}' is required when using a passphrase.");
                }
                if (gettype($payload[$f]) !== self::$schema[$f]) {
                    throw new \InvalidArgumentException("Field '{$f}' has invalid type.");
                }
            }
            if ($payload['kdf_algorithm'] !== 'PBKDF2') {
                 throw new \InvalidArgumentException("Unsupported KDF algorithm. Expected: PBKDF2");
            }
            if ($payload['kdf_iterations'] < 100000 || $payload['kdf_iterations'] > 1000000) {
                 throw new \InvalidArgumentException("KDF iterations out of safe bounds.");
            }
        }
    }
}
