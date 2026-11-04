local function now_seconds()
    return tonumber(redis.call('TIME')[1])
end

local function is_type(key, expected)
    local kind = redis.call('TYPE', key).ok
    return kind == 'none' or kind == expected
end

local function constant_equal(a, b)
    if not a or not b or #a ~= 64 or #b ~= 64 then return false end
    local difference = 0
    for i = 1, 64 do
        difference = bit.bor(difference, bit.bxor(string.byte(a, i), string.byte(b, i)))
    end
    return difference == 0
end

local function release_note(note, id, index, charges, total)
    local charge = tonumber(redis.call('HGET', charges, id) or '0')
    local previous = tonumber(redis.call('GET', total) or '0')
    redis.call('DEL', note)
    redis.call('ZREM', index, id)
    redis.call('HDEL', charges, id)
    if charge > 0 then redis.call('SET', total, tostring(math.max(0, previous - charge))) end
end

local function reap_notes(index, charges, total, prefix, time, limit)
    local expired = redis.call('ZRANGEBYSCORE', index, '-inf', tostring(time), 'LIMIT', 0, limit)
    for _, id in ipairs(expired) do release_note(prefix .. 'note:' .. id, id, index, charges, total) end
end

local function ledger_types(index, charges, total)
    return is_type(index, 'zset') and is_type(charges, 'hash') and is_type(total, 'string')
end

local function failed(result)
    return type(result) == 'table' and result.err ~= nil
end
