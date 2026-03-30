<?php
/**
 * public/api/consume-message.php
 * Öffentlicher API Endpunkt für die Bestätigung der lokalen Entschlüsselung.
 */

require_once __DIR__ . '/../../app/http/json.php';
require_once __DIR__ . '/../../app/http/request.php';
require_once __DIR__ . '/../../app/http/response.php';
require_once __DIR__ . '/../../app/messages/id.php';
require_once __DIR__ . '/../../app/messages/storage.php';
require_once __DIR__ . '/../../app/messages/consume-handler.php';

use App\Http\Request;
use App\Http\Response;
use App\Messages\ConsumeHandler;

// --- SCHRITT 78: API ISOLATION (Fetch Metadata) ---
if (!Request::validateFetchMetadata()) {
    Response::error("Not Found.", 404);
}

// 1. Method-Schutz (State Mutation erfordert POST)
if (!Request::isPost() || !Request::isJson()) {
    Response::error("Bad Request. Expected JSON POST.", 400);
}

$payload = Request::getJsonPayload(10000);

if (!isset($payload['public_id'])) {
    Response::error("Missing parameter 'public_id'.", 400);
}

$publicId = trim($payload['public_id']);

// 2. Harte Form-Prüfung der ID
if (!preg_match('/^[a-z0-9]{12}$/i', $publicId)) {
    Response::error("Invalid message ID format.", 400);
}

try {
    // 3. Delegation in die Domäne -> Markiert Paket als unlesbar
    $success = ConsumeHandler::process($publicId);
    
    if ($success) {
        Response::json(['status' => 'consumed'], 200);
    } else {
        Response::error("Internal Server Error. File lock failed.", 500);
    }

} catch (\RuntimeException $e) {
    $code = $e->getCode() ?: 404;
    Response::error($e->getMessage(), $code);
} catch (\Exception $e) {
    error_log("Failed to consume message: " . $e->getMessage());
    Response::error("Internal Server Error.", 500);
}
