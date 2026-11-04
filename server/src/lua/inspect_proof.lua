-- KEYS: challenge lease, spent challenge. No mutation.
if redis.call('EXISTS', KEYS[2]) == 1 then return {'proof_reused'} end
local lease = redis.call('GET', KEYS[1])
if not lease then return {'proof_invalid'} end
local expires, bits = string.match(lease, '^(%d+):(%d+)$')
if not expires or tonumber(expires) <= now_seconds() then return {'proof_invalid'} end
return {'ok', bits}
