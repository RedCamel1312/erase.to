use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use bytes::Bytes;
use erase_server::{
    error::ApiError,
    protocol::{Header, MAX_PACKET_BYTES, parse_packet, random_token, token_hash, verify_work},
};

fn header() -> Header {
    Header {
        version: 1,
        id: random_token().unwrap(),
        ttl: 60,
        views: 1,
        peek: "a".repeat(64),
        read: "b".repeat(64),
        revoke: "c".repeat(64),
        kdf: "none".into(),
        salt: String::new(),
        nonce: URL_SAFE_NO_PAD.encode([1_u8; 24]),
    }
}
fn packet(header: &[u8], ciphertext_length: usize) -> Bytes {
    let mut result = b"ERS1".to_vec();
    result.extend_from_slice(&(header.len() as u32).to_be_bytes());
    result.extend_from_slice(header);
    result.resize(result.len() + ciphertext_length, 42);
    result.into()
}

#[test]
fn preserves_exact_header_bytes_and_enforces_binary_boundaries() {
    let encoded = serde_json::to_vec(&header()).unwrap();
    let bytes = packet(&encoded, 4112);
    let parsed = parse_packet(bytes.clone()).unwrap();
    assert_eq!(parsed.bytes, bytes);
    assert_eq!(parsed.header_bytes.as_ref(), encoded);
    assert!(parse_packet(packet(&encoded, 16)).is_err());
    assert!(parse_packet(packet(&encoded, 4113)).is_err());
    assert!(matches!(
        parse_packet(packet(&encoded, MAX_PACKET_BYTES)),
        Err(ApiError::TooLarge)
    ));
    let mut bad_magic = bytes.to_vec();
    bad_magic[0] = b'X';
    assert!(parse_packet(bad_magic.into()).is_err());
    let mut bad_length = bytes.to_vec();
    bad_length[4..8].copy_from_slice(&2049_u32.to_be_bytes());
    assert!(parse_packet(bad_length.into()).is_err());
}

#[test]
fn fixed_limits_and_resource_defaults_match_large_client_transfers() {
    use erase_server::{
        config::Config,
        protocol::{MAX_CONTENT_BYTES, MAX_TEXT_BYTES},
    };
    let config = Config::new("https://erase.test", "redis://127.0.0.1/".into()).unwrap();
    assert_eq!(MAX_CONTENT_BYTES, 67_108_864);
    assert_eq!(MAX_TEXT_BYTES, 8_388_608);
    assert_eq!(MAX_PACKET_BYTES, 67_141_632);
    assert_eq!(config.max_in_flight, 2);
    assert_eq!(config.challenge_seconds, 420);
    assert_eq!(config.request_timeout.as_secs(), 300);
    assert_eq!(config.connection_lifetime.as_secs(), 360);
}

#[test]
fn rejects_duplicate_missing_unknown_fields_and_bad_ranges() {
    let good = serde_json::to_string(&header()).unwrap();
    for extra in [",\"version\":1}", ",\"plaintext\":\"forbidden\"}"] {
        let malformed = format!("{}{extra}", &good[..good.len() - 1]);
        assert!(parse_packet(packet(malformed.as_bytes(), 4112)).is_err());
    }
    for (field, value) in [
        ("ttl", serde_json::json!(59)),
        ("ttl", serde_json::json!(604801)),
        ("views", serde_json::json!(0)),
        ("views", serde_json::json!(101)),
        ("version", serde_json::json!(2)),
        ("read", serde_json::json!("f".repeat(63))),
        ("kdf", serde_json::json!("arbitrary")),
        ("salt", serde_json::json!("unexpected")),
    ] {
        let mut changed: serde_json::Value = serde_json::from_str(&good).unwrap();
        changed[field] = value;
        assert!(parse_packet(packet(&serde_json::to_vec(&changed).unwrap(), 4112)).is_err());
    }
    let mut missing: serde_json::Value = serde_json::from_str(&good).unwrap();
    missing.as_object_mut().unwrap().remove("peek");
    assert!(parse_packet(packet(&serde_json::to_vec(&missing).unwrap(), 4112)).is_err());
    let mut noncanonical = header();
    noncanonical.id = "a".repeat(43);
    assert!(parse_packet(packet(&serde_json::to_vec(&noncanonical).unwrap(), 4112)).is_err());
    assert!(parse_packet(packet(good.replacen('{', "{ ", 1).as_bytes(), 4112)).is_err());
    assert!(
        parse_packet(packet(
            good.replacen("\"version\"", "\"ver\\u0073ion\"", 1)
                .as_bytes(),
            4112
        ))
        .is_err()
    );
}

#[test]
fn supports_fixed_argon2_parameters_and_hashes_raw_capabilities() {
    let mut value = header();
    value.kdf = "argon2id".into();
    value.salt = URL_SAFE_NO_PAD.encode([2_u8; 16]);
    assert!(parse_packet(packet(&serde_json::to_vec(&value).unwrap(), 4112)).is_ok());
    let encoded = URL_SAFE_NO_PAD.encode([0_u8; 32]);
    assert_eq!(
        token_hash(&encoded).unwrap(),
        "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925"
    );
    assert!(token_hash(&"a".repeat(43)).is_err());
}

#[test]
fn proof_is_bound_to_packet_and_canonical_safe_integer_nonce() {
    let challenge = random_token().unwrap();
    let mut nonce = 0_u64;
    while !verify_work(&challenge, &nonce.to_string(), b"packet", 8) {
        nonce += 1;
    }
    assert!(verify_work(&challenge, &nonce.to_string(), b"packet", 8));
    assert!(!verify_work(&challenge, &format!("0{nonce}"), b"packet", 8));
    assert!(!verify_work(&challenge, "9007199254740992", b"packet", 8));
    assert!(!verify_work(&challenge, "-1", b"packet", 8));
    let mut altered = b"different packet".to_vec();
    while verify_work(&challenge, &nonce.to_string(), &altered, 8) {
        altered.push(b'x');
    }
    assert!(!verify_work(&challenge, &nonce.to_string(), &altered, 8));
}

#[test]
fn one_thousand_bounded_malformed_packets_never_panic() {
    fn next(state: &mut u64) -> u8 {
        *state ^= *state << 13;
        *state ^= *state >> 7;
        *state ^= *state << 17;
        *state as u8
    }
    let valid = packet(&serde_json::to_vec(&header()).unwrap(), 4112);
    let mut state = 0x4552_5331_243f_6a88_u64;
    for case in 0..1000 {
        let mut input = if case % 2 == 0 {
            valid.to_vec()
        } else {
            let length = usize::from(next(&mut state)) * 16;
            (0..length).map(|_| next(&mut state)).collect::<Vec<_>>()
        };
        if !input.is_empty() {
            for _ in 0..8 {
                let position = (usize::from(next(&mut state)) * 31 + usize::from(next(&mut state)))
                    % input.len();
                input[position] = next(&mut state);
            }
            if case % 3 == 0 {
                input.truncate(usize::from(next(&mut state)).min(input.len()));
            }
        }
        assert!(
            std::panic::catch_unwind(|| parse_packet(Bytes::from(input))).is_ok(),
            "Parser panicked on bounded case {case}"
        );
    }
}
