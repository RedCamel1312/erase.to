<?php
namespace App\Messages;

class ConsumeHandler {
    public static function process(string $publicId): bool {
        if (!PublicId::isValid($publicId)) {
            throw new \RuntimeException("Message not found or already destroyed.", 404);
        }

        $storagePath = __DIR__ . '/../../storage/messages';
        $storage = new Storage($storagePath);

        $document = $storage->load($publicId);

        if ($document === null) {
            throw new \RuntimeException("Message not found or already destroyed.", 404);
        }

        if (time() > $document['expires_at']) {
            $storage->delete($publicId);
            throw new \RuntimeException("Message expired.", 410); 
        }

        // Single-use: physically delete immediately, not just mark.
        // After this call the file no longer exists on disk.
        if ($document['is_single_use'] === true && $document['is_consumed'] === false) {
            return $storage->delete($publicId);
        }

        return true; 
    }
}
