<?php
namespace App\Messages;

class Storage {
    private string $storageDir;

    public function __construct(string $storageDir) {
        $this->storageDir = rtrim($storageDir, '/\\');
        
        // Sicheres Basis-Verzeichnis anlegen (rwx------)
        if (!is_dir($this->storageDir)) {
            mkdir($this->storageDir, 0700, true);
        }
        
        // Absoluter Schutz gegen unvorhergesehenes Web-Routing
        $htaccessPath = $this->storageDir . '/.htaccess';
        if (!file_exists($htaccessPath)) {
            file_put_contents($htaccessPath, "Deny from all\n");
        }
    }

    private function getFilePath(string $publicId): string {
        // Harte ID-Prüfung gegen Directory Traversal (z.B. ../../)
        if (!preg_match('/^[a-z0-9]{12}$/i', $publicId)) {
            throw new \InvalidArgumentException("Invalid public ID format used for storage.");
        }
        return $this->storageDir . '/' . $publicId . '.json';
    }

    public function save(string $publicId, array $payload, int $expiresAtTimestamp): bool {
        $filePath = $this->getFilePath($publicId);
        
        if (file_exists($filePath)) {
            return false; // Kollisionsschutz
        }
        
        $document = [
            'public_id' => $publicId,
            'storage_payload' => $payload,
            'created_at' => time(),
            'expires_at' => $expiresAtTimestamp,
            'is_single_use' => $payload['is_single_use'] ? true : false,
            'is_consumed' => false,
            'consumed_at' => null
        ];

        // 1. In sichere Temp-Datei schreiben
        $encoded = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        $tmpPath = $filePath . '.' . bin2hex(random_bytes(8)) . '.tmp';
        
        if (file_put_contents($tmpPath, $encoded) === false) {
            return false;
        }

        // 2. Atomarer Move: Schlägt auf POSIX nicht fehl durch unfertige Lesezustände
        if (!rename($tmpPath, $filePath)) {
            @unlink($tmpPath);
            return false;
        }

        return true;
    }

    public function exists(string $publicId): bool {
        try {
            return file_exists($this->getFilePath($publicId));
        } catch (\InvalidArgumentException $e) {
            return false;
        }
    }

    public function load(string $publicId): ?array {
        try {
            $filePath = $this->getFilePath($publicId);
        } catch (\InvalidArgumentException $e) {
            return null;
        }
        
        if (!file_exists($filePath)) {
            return null;
        }
        
        $fp = @fopen($filePath, 'r');
        if ($fp === false) return null;

        // Shared Lock: Mehrere Leser erlaubt, blockiert während LOCK_EX schreibt
        if (!flock($fp, LOCK_SH)) {
            fclose($fp);
            return null;
        }
        
        $encoded = stream_get_contents($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        
        if ($encoded === false || empty($encoded)) return null;
        
        $document = json_decode($encoded, true);
        if (json_last_error() !== JSON_ERROR_NONE) return null;
        
        return $document;
    }

    public function markConsumed(string $publicId): bool {
        try {
            $filePath = $this->getFilePath($publicId);
        } catch (\InvalidArgumentException $e) {
            return false;
        }

        if (!file_exists($filePath)) { return false; }

        $fp = @fopen($filePath, 'c+');
        if ($fp === false) return false;

        // Exclusive Lock: Niemand darf währenddessen lesen oder schreiben
        if (!flock($fp, LOCK_EX)) {
            fclose($fp);
            return false;
        }

        $encoded = stream_get_contents($fp);
        if ($encoded === false || empty($encoded)) {
            flock($fp, LOCK_UN); fclose($fp); return false;
        }

        $document = json_decode($encoded, true);
        if (json_last_error() !== JSON_ERROR_NONE || !isset($document['is_consumed'])) {
            flock($fp, LOCK_UN); fclose($fp); return false;
        }

        if ($document['is_consumed'] === true) {
            flock($fp, LOCK_UN); fclose($fp); return true;
        }

        $document['is_consumed'] = true;
        $document['consumed_at'] = time();

        $newEncoded = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, $newEncoded);
        fflush($fp);

        flock($fp, LOCK_UN);
        fclose($fp);

        return true;
    }
    
    public function delete(string $publicId): bool {
        try {
            $filePath = $this->getFilePath($publicId);
        } catch (\InvalidArgumentException $e) {
            return false;
        }

        // Unter Windows ist unlink() während LOCK blockiert, 
        // @ ignoriert Fehler, GC räumt später verwaiste Reste auf.
        if (file_exists($filePath)) {
            return @unlink($filePath);
        }
        return true;
    }
}
