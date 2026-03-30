<?php
/**
 * public/api/create-message.php
 * API Eintritts-Schacht. Keine Logik hier, nur Delegation.
 */

// Autoload-Simulatonsbereich
require_once __DIR__ . '/../../app/http/json.php';
require_once __DIR__ . '/../../app/http/request.php';
require_once __DIR__ . '/../../app/http/response.php';
require_once __DIR__ . '/../../app/messages/validator.php';
require_once __DIR__ . '/../../app/messages/id.php';
require_once __DIR__ . '/../../app/messages/storage.php';
require_once __DIR__ . '/../../app/messages/create-handler.php';
require_once __DIR__ . '/../../app/security/pow.php';

use App\Http\Request;
use App\Http\Response;
use App\Messages\CreateHandler;
use App\Security\ProofOfWork;

// --- SCHRITT 78: API ISOLATION (Fetch Metadata) ---
if (!Request::validateFetchMetadata()) {
    Response::error("Not Found.", 404);
}

// Harte Limitierung: Max 200KB für ein Request (Schützt vor DDoS per Payload)
$MAX_PAYLOAD_BYTES = 200000;

// Method-Schutz
if (!Request::isPost()) {
    Response::error("Method Not Allowed.", 405, 'invalid_request');
}

// Content-Type Guard
if (!Request::isJson()) {
    Response::error("Expected application/json.", 415, 'invalid_request');
}

// Payload Extraktion & Limit-Enforcement
$payload = Request::getJsonPayload($MAX_PAYLOAD_BYTES);

if ($payload === null) {
    Response::error("Bad Request. Invalid JSON or too large.", 400, 'invalid_payload');
}

// --- PROOF OF WORK VERIFICATION (Zero-Trace Rate Limiting) ---
$nonce = $payload['pow_nonce'] ?? null;
if (!$nonce) {
    Response::error("Security verification missing.", 402, 'pow_required');
}

// Wir binden die Nonce an den Ciphertext, um Serialisierungs-Differenzen (JSON) zu vermeiden.
$payloadHash = hash('sha256', $payload['ciphertext'] ?? '');

if (!ProofOfWork::verify($payloadHash, $nonce)) {
    Response::error("Security verification failed. Invalid proof of work.", 402, 'pow_invalid');
}

try {
    // Delegation in die geschlossene App-Logik
    $serverResponse = CreateHandler::process($payload);
    
    // HTTP 201 Created Antwort ausliefern
    Response::json($serverResponse, 201);

} catch (\InvalidArgumentException $e) {
    // Unzulässige Paketform oder Verletzung der Schema-Regeln
    Response::error($e->getMessage(), 422, 'invalid_payload');
} catch (\Exception $e) {
    // Echte technische Fehler (Storage-Fehler, ID-Kollisionen nach 5 Versuchen)
    error_log("Creation failed: " . $e->getMessage());
    Response::error("The message could not be stored safely.", 500, 'storage_failed');
}
