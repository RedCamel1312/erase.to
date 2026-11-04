-- KEYS: note, note index, charges, total bytes, challenge, spent proof, challenge index.
-- ARGV: id, packet, exact header, peek/read/revoke hashes, ttl, views, max notes, max bytes, prefix, challenge id.
if not ledger_types(KEYS[2], KEYS[3], KEYS[4]) or not is_type(KEYS[7], 'zset') then return {'capacity'} end
if redis.call('EXISTS', KEYS[6]) == 1 then return {'proof_reused'} end
local lease = redis.call('GET', KEYS[5])
if not lease then return {'proof_invalid'} end
local proof_expires = tonumber(string.match(lease, '^(%d+):%d+$'))
local time = now_seconds()
if not proof_expires or proof_expires <= time then return {'proof_invalid'} end
reap_notes(KEYS[2], KEYS[3], KEYS[4], ARGV[11], time, 128)
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('HEXISTS', KEYS[3], ARGV[1]) == 1 then return {'id_conflict'} end
local previous = tonumber(redis.call('GET', KEYS[4]) or '0')
local charge = #ARGV[2] + #ARGV[3] + 1024
if redis.call('HLEN', KEYS[3]) >= tonumber(ARGV[9]) or previous + charge > tonumber(ARGV[10]) then return {'capacity'} end
local expires = time + tonumber(ARGV[7])

-- Lua is atomic but does not roll back command errors. All potentially failing writes
-- precede spending the challenge; explicit compensation removes partial records.
local function rollback()
    redis.pcall('DEL', KEYS[1])
    redis.pcall('ZREM', KEYS[2], ARGV[1])
    redis.pcall('HDEL', KEYS[3], ARGV[1])
    redis.pcall('SET', KEYS[4], tostring(previous))
    redis.pcall('DEL', KEYS[6])
    return {'capacity'}
end
local record = redis.pcall('HSET', KEYS[1], 'packet', ARGV[2], 'header', ARGV[3],
    'peek', ARGV[4], 'read', ARGV[5], 'revoke', ARGV[6], 'expires', tostring(expires), 'remaining', ARGV[8])
if failed(record) then return rollback() end
local ttl = redis.pcall('EXPIREAT', KEYS[1], expires)
if failed(ttl) or ttl ~= 1 then return rollback() end
if failed(redis.pcall('HSET', KEYS[3], ARGV[1], tostring(charge))) then return rollback() end
if failed(redis.pcall('ZADD', KEYS[2], expires, ARGV[1])) then return rollback() end
if failed(redis.pcall('SET', KEYS[4], tostring(previous + charge))) then return rollback() end
local spent = redis.pcall('SET', KEYS[6], '1', 'EXAT', proof_expires, 'NX')
if failed(spent) or not spent then return rollback() end
local consumed = redis.pcall('DEL', KEYS[5])
if failed(consumed) or consumed ~= 1 then return rollback() end
-- A stale index entry can only overcount pending leases until its bounded expiry.
redis.pcall('ZREM', KEYS[7], ARGV[12])
return {'ok', tostring(expires)}
