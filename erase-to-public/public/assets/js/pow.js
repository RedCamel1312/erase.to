/**
 * Proof-of-Work Wrapper for erase.to.
 * Handles communication with the Web Worker.
 */
const ProofOfWork = {
    calculate: function(payloadHash) {
        return new Promise((resolve, reject) => {
            if (!window.POW_CHALLENGE) {
                return reject('Missing PoW challenge');
            }

            const worker = new Worker('/assets/js/pow.worker.js');
            
            worker.onmessage = (e) => {
                if (e.data.nonce) {
                    worker.terminate();
                    resolve(e.data.nonce);
                } else if (e.data.error) {
                    worker.terminate();
                    reject(e.data.error);
                }
            };

            worker.onerror = (err) => {
                worker.terminate();
                reject(err);
            };

            worker.postMessage({
                challenge: window.POW_CHALLENGE,
                payloadHash: payloadHash,
                difficulty: 4 // Match with PHP self::DIFFICULTY
            });
        });
    }
};

window.ProofOfWork = ProofOfWork;
