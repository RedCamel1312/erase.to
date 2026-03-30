# Protokoll Version 1 (message-v1)

Dieses Dokument ist das verbindliche Fundament fÃ¼r den Austausch und die Speicherung von Nachrichten in **erase.to**. Es legt die Datenstrukturen in drei exakt definierten Ebenen fest.

## Namenskonventionen (Globale Regeln)
- Wir nutzen striktes **`snake_case`** fÃ¼r alle JSON- und API-Felder.
- **Konsistente Keys:** 
  - `format_version` (nicht version oder v)
  - `created_at` (nicht timestamp oder date)
  - `expires_at` (fÃ¼r serverseitig errechnete, absolute Zeitpunkte)
  - `expiration_policy` (fÃ¼r vom Nutzer gewÃ¤hlte relative ZeitrÃ¤ume, z.B. 1_hour)
  - `is_single_use` (nicht oneTime oder burn_after_read)
  - `requires_passphrase` (nicht hasPassword oder passphrase_used)

---

## Ebene A: Klartext-Nachrichtenobjekt (Pre-Encryption)
Dieses Objekt existiert **ausschlieÃŸlich im flÃ¼chtigen RAM (Browser)** des Senders vor der VerschlÃ¼sselung und des EmpfÃ¤ngers nach der erfolgreichen EntschlÃ¼sselung. Es wird niemals Ã¼ber das Netzwerk gesendet oder auf eine Festplatte geschrieben.

```json
{
  "format_version": 1,
  "message_content": "Der eigentliche, vom Nutzer getippte Klartext.",
  "created_at": "2026-03-29T07:00:00.000Z",
  "expiration_policy": "1_hour",
  "is_single_use": true,
  "requires_passphrase": false
}
```
*Zweck der Metadaten hier:* Der EmpfÃ¤nger muss nach der EntschlÃ¼sselung absolut sicher und fÃ¤lschungssicher (durch AEAD/GCM Authentifizierung) wissen, unter welchen PrÃ¤missen die Nachricht gesendet wurde â€“ ohne sich auf eine unverschlÃ¼sselte Server-Aussage verlassen zu mÃ¼ssen.

---

## Ebene B: Kryptographisches Paket (Storage Payload)
Dieses Objekt ist exakt das, was das Frontend via HTTP `POST` Ã¼ber die Leitung schickt, und was das Backend (`storage.php`) als "Opaque Blob" in der SQLite speichert. Der Server versteht nur die Ã¤uÃŸeren Routing-Metadaten.

```json
{
  "format_version": 1,
  "crypto_algorithm": "AES-GCM",
  "kdf_algorithm": "PBKDF2",
  "crypto_iv": "base64_encoded_12_byte_iv==",
  "kdf_salt": "base64_encoded_16_byte_salt==",
  "kdf_iterations": 210000,
  
  "ciphertext": "base64_encoded_encrypted_payload_and_auth_tag...",
  
  "expiration_policy": "1_hour",
  "is_single_use": true,
  "requires_passphrase": false,
  "created_at": "2026-03-29T07:00:00.000Z"
}
```
*Zweck:* SÃ¤mtliche kryptographischen Initialisierungsvektoren (IV) und Salts liegen bereit fÃ¼r den EmpfÃ¤nger. Der Klartext existiert hier physisch nicht mehr.

---

## Ebene C: Ã–ffentliche Server-Antwort (API Response)
Dies ist das JSON-Objekt, das der Server nach einem erfolgreichen Erstellen (`POST`) oder beim Anfragen der Paket-Metadaten (`GET`) zurÃ¼ckgibt. Es orchestriert nur die OberflÃ¤che.

```json
{
  "public_id": "k7x9p2m4",
  "expires_at": "2026-03-29T08:00:00.000Z",
  "is_single_use": true,
  "requires_passphrase": false
}
```
*Zweck:* Die API-Response enthÃ¤lt **niemals** den lokalen SchlÃ¼sselanteil, niemals den Klartext und niemals den finalen, fertigen EmpfÃ¤nger-Link. Das Frontend komponiert sich den Share-Link aus dieser `public_id` und seinem eigenen geheimen Fragment selbst zusammen.
