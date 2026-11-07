-- Fixed, short-lived public, access, challenge and create buckets. No network identity is used.
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local rate = tonumber(ARGV[1])
local burst = rate * 2
local old = redis.call('HMGET', KEYS[1], 'tokens', 'at')
local tokens = tonumber(old[1]) or burst
local at = tonumber(old[2]) or now
tokens = math.min(burst, tokens + math.max(0, now - at) * rate / 1000)
if tokens < 1 then return 0 end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens - 1), 'at', tostring(now))
redis.call('PEXPIRE', KEYS[1], 4000)
return 1
