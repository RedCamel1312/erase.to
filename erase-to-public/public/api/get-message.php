<?php
/**
 * public/api/get-message.php
 * Öffentlicher API Endpunkt für den Client-Read Request (`/v/id`).
 */

require_once __DIR__ . '/../../app/http/json.php';
require_once __DIR__ . '/../../app/http/request.php';
require_once __DIR__ . '/../../app/http/response.php';
require_once __DIR__ . '/../../app/messages/id.php';
require_once __DIR__ . '/../../app/messages/storage.php';
require_once __DIR__ . '/../../app/messages/get-handler.php';

use App\Http\Request;
use App\Http\Response;
use App\Messages\GetHandler;

// --- SCHRITT 78: API ISOLATION (Fetch Metadata) ---
if (!Request::validateFetchMetadata()) {
    Response::error("Not Found.", 404);
}

// 1. Parameter prüfen
$publicId = isset($_GET['id']) ? trim($_GET['id']) : '';

if (empty($publicId)) {
    Response::error("Missing parameter 'id'.", 400);
}

// 2. Harte Form-Prüfung der ID gegen Traversal & Trash Bytes
if (!preg_match('/^[a-z0-9]{12}$/i', $publicId)) {
    Response::error("Invalid message ID format.", 400);
}

try {
    // 3. Delegation in die Domäne -> Sucht und bewertet Paket
    $storagePayload = GetHandler::process($publicId);

    // 4. Lieferung des originalen Krypto-Pakets an das Client-UI
    Response::json($storagePayload, 200);

} catch (\RuntimeException $e) {
    // Die HTTP-Codes 404 (Not Found) oder 410 (Gone) vom Handler direkt auf das Wire legen
    $code = $e->getCode() ?: 404;
    Response::error($e->getMessage(), $code);
} catch (\Exception $e) {
    // Fallback bei Datei-Zugriffsfehlern usw.
    error_log("Failed to process message retrieval: " . $e->getMessage());
    Response::error("Internal Server Error.", 500);
}
