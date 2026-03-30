<?php
namespace App\Messages;

class GetHandler {
    public static function process(string $publicId): array {
        // Formale ID-Prüfung, bevor das Storage überhaupt berührt wird -> schließt Directory Traversal komplett aus.
        if (!PublicId::isValid($publicId)) {
            throw new \RuntimeException("Message missing.", 404);
        }

        // 1. Storage Connector initialisieren
        $storagePath = __DIR__ . '/../../storage/messages';
        $storage = new Storage($storagePath);

        // 2. Speicher-Dokument gezielt laden
        $document = $storage->load($publicId);

        // 3. Fall: Existenz prüfen -> "fehlende Nachricht"
        if ($document === null) {
            throw new \RuntimeException("Message missing.", 404);
        }

        // 4. Fall: Verbrauchsstatus prüfen -> "verbrauchte Nachricht"
        if ($document['is_consumed'] === true) {
            $storage->delete($publicId); // Späteste physische Bereinigung
            throw new \RuntimeException("Message already consumed.", 410);
        }

        // 5. Fall: Ablaufzeitpunkt prüfen -> "abgelaufene Nachricht"
        if (time() > $document['expires_at']) {
            $storage->delete($publicId); // Sofortige physische Bereinigung (Garbage Collection bei Touch)
            throw new \RuntimeException("Message expired.", 410); 
        }

        // 6. Rückgabe: Exakt nur das Ebene B Storage Payload Objekt
        return $document['storage_payload'];
    }
}
