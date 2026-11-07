-- KEYS: note, note index, charges, total. ARGV: id, capability hash, operation.
if not ledger_types(KEYS[2], KEYS[3], KEYS[4]) then return {'capacity'} end
if redis.call('EXISTS', KEYS[1]) == 0 then return {'unavailable'} end
local expires = tonumber(redis.call('HGET', KEYS[1], 'expires') or '0')
if expires <= now_seconds() then
    release_note(KEYS[1], ARGV[1], KEYS[2], KEYS[3], KEYS[4])
    return {'unavailable'}
end
local operation = ARGV[3]
local capability = ({meta='peek', check_open='read', open='read', delete='revoke'})[operation]
if not capability then return {'capacity'} end
if not constant_equal(redis.call('HGET', KEYS[1], capability), ARGV[2]) then return {'unavailable'} end
local remaining = tonumber(redis.call('HGET', KEYS[1], 'remaining') or '0')
if remaining < 1 then
    release_note(KEYS[1], ARGV[1], KEYS[2], KEYS[3], KEYS[4])
    return {'unavailable'}
end
if operation == 'check_open' then return {'ok'} end
if operation == 'meta' then
    local header = redis.call('HGET', KEYS[1], 'header')
    if not header then return {'unavailable'} end
    return {'ok', header, tostring(expires), tostring(remaining)}
end
if operation == 'delete' then
    release_note(KEYS[1], ARGV[1], KEYS[2], KEYS[3], KEYS[4])
    return {'ok'}
end
local packet = redis.call('HGET', KEYS[1], 'packet')
if not packet then return {'unavailable'} end
if remaining == 1 then
    release_note(KEYS[1], ARGV[1], KEYS[2], KEYS[3], KEYS[4])
else
    redis.call('HINCRBY', KEYS[1], 'remaining', -1)
end
-- No response bytes leave Valkey until authorization and consumption finish atomically.
return {'ok', packet}
