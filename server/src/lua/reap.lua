-- KEYS: note index, charges, total, challenge index. ARGV: prefix.
if not ledger_types(KEYS[1], KEYS[2], KEYS[3]) or not is_type(KEYS[4], 'zset') then return {'capacity'} end
local time = now_seconds()
reap_notes(KEYS[1], KEYS[2], KEYS[3], ARGV[1], time, 128)
redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', tostring(time))
return {'ok'}
