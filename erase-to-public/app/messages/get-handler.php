<?php
namespace App\Messages;

class GetHandler {
    public static function process(string $publicId): array {
        // Formal ID check before touching storage. Prevents directory traversal.
        if (!PublicId::isValid($publicId)) {
            throw new \RuntimeException("Message missing.", 404);
        }

        $storagePath = __DIR__ . '/../../storage/messages';
        $storage = new Storage($storagePath);

        $document = $storage->load($publicId);

        // File not found: message never existed or was already destroyed.
        if ($document === null) {
            throw new \RuntimeException("Message missing.", 404);
        }

        // Legacy: files stored with the old is_consumed flag (new architecture deletes immediately).
        if (isset($document['is_consumed']) && $document['is_consumed'] === true) {
            $storage->delete($publicId);
            throw new \RuntimeException("Message already consumed.", 410);
        }

        // Expiry check: delete immediately on access if the window has passed.
        if (time() > $document['expires_at']) {
            $storage->delete($publicId);
            throw new \RuntimeException("Message expired.", 410); 
        }

        // Return only the Level B crypto payload to the client.
        return $document['storage_payload'];
    }
}
