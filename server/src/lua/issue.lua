-- KEYS: challenge lease, challenge expiry index. ARGV: id, bits, lifetime, cap.
if not is_type(KEYS[2], 'zset') then return {'capacity'} end
local time = now_seconds()
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', tostring(time))
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[4]) then return {'capacity'} end
local expires = time + tonumber(ARGV[3])
local value = tostring(expires) .. ':' .. ARGV[2]
local lease = redis.pcall('SET', KEYS[1], value, 'EX', ARGV[3], 'NX')
if failed(lease) or not lease then return {'capacity'} end
local indexed = redis.pcall('ZADD', KEYS[2], expires, ARGV[1])
if failed(indexed) then redis.call('DEL', KEYS[1]); return {'capacity'} end
return {'ok', tostring(expires)}
