/**
 * Proof-of-Work Web Worker for erase.to.
 * Searches for a nonce such that SHA-256(challenge + payload + nonce) starts with '0000'.
 */
self.onmessage = async (e) => {
    const { challenge, payloadHash, difficulty } = e.data;
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;

    const challengeBuffer = new TextEncoder().encode(challenge);
    const payloadBuffer = new TextEncoder().encode(payloadHash);

    while (true) {
        const nonceBuffer = new TextEncoder().encode(nonce.toString());
        
        // Combine buffers: [challenge][payload][nonce]
        const combined = new Uint8Array(challengeBuffer.length + payloadBuffer.length + nonceBuffer.length);
        combined.set(challengeBuffer);
        combined.set(payloadBuffer, challengeBuffer.length);
        combined.set(nonceBuffer, challengeBuffer.length + payloadBuffer.length);

        const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashHex.startsWith(prefix)) {
            self.postMessage({ nonce: nonce.toString(), hash: hashHex });
            break;
        }

        nonce++;
        
        // Safety break for extremely slow devices (optional)
        if (nonce > 10000000) {
            self.postMessage({ error: 'Max attempts reached' });
            break;
        }
    }
};
