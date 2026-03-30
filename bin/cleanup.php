<?php
// bin/cleanup.php
// Routine for garbage collection of expired, consumed, or corrupt messages.
// Designed to run periodically via a server Cronjob.

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    die("Forbidden: CLI execution only.\n");
}

$storageDir = realpath(__DIR__ . '/../storage/messages');
$corruptDir = __DIR__ . '/../storage/corrupt';

if (!$storageDir || !is_dir($storageDir)) {
    echo "[erase.to GC] Storage directory not found or empty.\n";
    exit(0);
}

// Ensure corrupt directory exists (securely)
if (!is_dir($corruptDir)) {
    mkdir($corruptDir, 0700, true);
    file_put_contents($corruptDir . '/.htaccess', "Deny from all\n");
}

$files = glob($storageDir . '/*.json');
$now = time();

$stats = [
    'inspected' => is_array($files) ? count($files) : 0,
    'deleted_expired' => 0,
    'deleted_consumed' => 0,
    'moved_corrupt' => 0
];

echo "[erase.to GC] Initiating cleanup...\n";

if (is_array($files)) {
    foreach ($files as $file) {
        if (!is_file($file)) continue;

        $content = file_get_contents($file);
        if ($content === false) {
            continue;
        }

        $document = json_decode($content, true);

        // 1. Kaputte / Unvollständige Dateien checken
        if (json_last_error() !== JSON_ERROR_NONE || !isset($document['public_id'], $document['expires_at'], $document['is_consumed'])) {
            $filename = basename($file);
            rename($file, $corruptDir . '/' . time() . '_' . $filename);
            $stats['moved_corrupt']++;
            continue;
        }

        // 2. Abgelaufene Dateien hart löschen
        if ($now > $document['expires_at']) {
            unlink($file);
            $stats['deleted_expired']++;
            continue;
        }

        // 3. Verbrauchte Nachrichten sofort löschen
        // erase.to hortet keinen verbrauchten Datei-Müll.
        if ($document['is_consumed'] === true) {
            unlink($file);
            $stats['deleted_consumed']++;
            continue;
        }
    }
}

echo "[erase.to GC] Cleanup complete.\n";
echo " Inspected: {$stats['inspected']}\n";
echo " Expired deleted: {$stats['deleted_expired']}\n";
echo " Consumed deleted: {$stats['deleted_consumed']}\n";
echo " Corrupted moved: {$stats['moved_corrupt']}\n";

