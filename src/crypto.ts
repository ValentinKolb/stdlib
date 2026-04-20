import { fromBase64, toBase64, fromBase32, toBase32, toHex, fromHex } from "./encoding";

const DEFAULT_SIGNATURE_AGE = 1000 * 60 * 60; // 1 hour
const CLOCK_SKEW_TOLERANCE = 1000 * 30; // 30 seconds

const encoder = new TextEncoder();
const decoder = new TextDecoder();

//====================================
// COMMON UTILITIES
//====================================

/**
 * Async hash a string using SHA-256
 * @param s - The string or Uint8Array to hash
 * @returns Hexadecimal hash string
 * @example hash("hello") // "2cf24d..."
 * @see common.fnv1aHash for synchronous FNV-1a hash (non-cryptographic)
 */
const hash = async (s: string | Uint8Array): Promise<string> => {
  const data = s instanceof Uint8Array ? s : encoder.encode(s);
  const hash = await globalThis.crypto.subtle.digest("SHA-256", data as BufferSource);
  return toHex(new Uint8Array(hash));
};

/**
 * Sync hash a string using FNV-1a algorithm. Don't use for security purposes!!
 * @param s - The string to hash
 * @returns Hexadecimal hash string
 */
const fnv1aHash = (s: string): string => {
  const FNV_OFFSET_BASIS = 2166136261;
  const FNV_PRIME = 16777619;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16);
};

/**
 * Generate a human-readable ID with customizable segment lengths
 * @param pattern - Segment lengths as separate arguments (default: 3, 4, 3, 4)
 * @returns Hyphen-separated ID using alphanumeric characters
 * @example
 * readableId() // "a3X-B7nm-4Kp-qR9v"
 * readableId(5, 5) // "3nK4p-Xm9Bq"
 * readableId(8) // "nm4K9pXq" (no hyphens)
 * readableId(2, 4, 2, 4, 2) // "a3-B7nm-4K-qR9v-X2"
 */
const readableId = (...pattern: number[]): string => {
  if (pattern.length === 0) pattern = [3, 4, 3, 4];
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const totalLen = pattern.reduce((a, b) => a + b);
  const chars = Array.from({ length: totalLen }, () => alphabet[randomIndex(alphabet.length)]);

  let i = 0;
  return pattern
    .map((len) => {
      const start = i;
      const end = i + len;
      i = end;
      return chars.slice(start, end).join("");
    })
    .join("-");
};

/**
 * Generate a high-entropy key for symmetric encryption
 * @param length - Key length in bytes (default: 32 for 256-bit)
 * @returns Hex-encoded random key
 * @example
 * const key = generateKey(); // "a3f2b8c9d4e5f6..."
 * const key128 = generateKey(16); // 128-bit key
 */
const generateKey = (length: number = 32): string => {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(length)));
};

/**
 * Returns a cryptographically secure random integer in [0, max).
 * Uses rejection sampling to eliminate modulo bias.
 *
 * @param max - Exclusive upper bound (returns 0 when max <= 1)
 */
export const randomIndex = (max: number): number => {
  if (max <= 1) return 0;
  const ceiling = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);

  do {
    globalThis.crypto.getRandomValues(buffer);
  } while (buffer[0]! >= ceiling);

  return buffer[0]! % max;
};

export const common = {
  hash,
  fnv1aHash,
  readableId,
  /** Generate a random UUID v4 using the platform's crypto API. */
  uuid: () => globalThis.crypto.randomUUID(),
  generateKey,
};

//====================================
// ASYMMETRIC ENCRYPTION (KEY PAIRS)
//====================================

/**
 * Splits a hybrid key string into its ECDSA and ECDH components.
 *
 * Expected format: `<prefix><ecdsaBase64>:<ecdhBase64>` where the prefix is a
 * 4-character header like "P01:" (public, version 1) or "S01:" (secret, version 1).
 * The prefix is preserved on both returned keys.
 *
 * @param hybridKey - Serialized hybrid key (e.g. `"P01:<ecdsa>:<ecdh>"`)
 * @returns Tuple of [ecdsaKey, ecdhKey], each with the original prefix
 * @throws If the key is missing the ":" separator or either part is empty
 */
const splitHybridKey = (hybridKey: string): [string, string] => {
  if (hybridKey.length < 5) {
    throw new Error("Invalid hybrid key format: key too short");
  }
  const prefix = hybridKey.slice(0, 4); // Contains version and type prefix (e.g. "P01:" or "S01:")
  const keys = hybridKey.slice(4);
  if (!keys.includes(":")) {
    throw new Error("Invalid hybrid key format: missing ':' separator between ECDSA and ECDH keys");
  }
  const [ecdsa, ecdh] = keys.split(":");
  if (!ecdsa || !ecdh) {
    throw new Error("Invalid hybrid key format: both ECDSA and ECDH key parts must be non-empty");
  }
  return [`${prefix}${ecdsa}`, `${prefix}${ecdh}`];
};

/**
 * Deserializes a prefixed Base64 key string into a WebCrypto `CryptoKey`.
 *
 * Expected format: `<TypeChar><Version>:<base64KeyData>`.
 * - TypeChar: "P" (public, imported as SPKI) or "S" (secret/private, imported as PKCS#8).
 * - Version: two-digit integer; only version 1 ("01") is currently supported.
 *
 * @param serialized - Prefixed Base64 key string (e.g. `"P01:MFkw..."`)
 * @param algorithm - Target algorithm ("ECDSA" or "ECDH"), always on P-256
 * @param usages - Permitted key usages (e.g. `["sign"]`, `["deriveBits"]`)
 * @throws If the version is not 1 or the type prefix is not "P" or "S"
 */
const deserializeKey = async (serialized: string, algorithm: "ECDSA" | "ECDH", usages: KeyUsage[]): Promise<CryptoKey> => {
  // Extract type and version from printable prefix (e.g. "P01:" or "S01:")
  const prefix = serialized.slice(0, 4);
  const typeChar = prefix[0];
  const version = parseInt(prefix.slice(1, 3), 10);
  const isPrivate = typeChar === "S";

  if (version !== 1) {
    throw new Error(`Unsupported key version: ${version}`);
  }

  if (typeChar !== "P" && typeChar !== "S") {
    throw new Error(`Invalid key type prefix: ${typeChar}`);
  }

  const format = isPrivate ? "pkcs8" : "spki";
  const keyData = fromBase64(serialized.slice(4));
  return await globalThis.crypto.subtle.importKey(format, keyData as BufferSource, { name: algorithm, namedCurve: "P-256" }, true, usages);
};

/**
 * Creates an ECDSA-SHA256 digital signature for the given message.
 *
 * Side effects: generates a fresh UUID nonce and captures the current timestamp;
 * both are included in the signed payload (`nonce:message:timestamp`) and returned
 * alongside the Base64-encoded signature.
 *
 * @param data - Object containing the hybrid private key and message to sign
 * @returns Object with the generated nonce, timestamp, and Base64 signature
 */
const sign = async (data: {
  privateKey: string;
  message: string;
}): Promise<{
  nonce: string;
  timestamp: number;
  signature: string;
}> => {
  const nonce = globalThis.crypto.randomUUID();
  const timestamp = Date.now();
  const { message, privateKey } = data;

  const [ecdsaKey] = splitHybridKey(privateKey);
  const messageBuffer = encoder.encode(`${nonce}:${message}:${timestamp}`);
  const signature = await globalThis.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await deserializeKey(ecdsaKey, "ECDSA", ["sign"]),
    messageBuffer as BufferSource,
  );

  return {
    nonce,
    timestamp,
    signature: toBase64(new Uint8Array(signature)),
  };
};

/**
 * Verifies an ECDSA-SHA256 signature against the reconstructed payload.
 *
 * Security notes:
 * - Rejects signatures with timestamps more than 30 seconds in the future (clock skew tolerance).
 * - Rejects signatures older than `maxAge` (default 1 hour).
 * - Returns `false` (never throws) on any cryptographic failure.
 *
 * @param data - Verification parameters including the hybrid public key,
 *               Base64 signature, nonce, original message, and timestamp
 * @returns `true` if the signature is valid and within the allowed time window
 */
const verify = async (data: {
  publicKey: string;
  signature: string;
  nonce: string;
  timestamp: number;
  message: string;
  maxAge?: number;
}): Promise<boolean> => {
  const { signature, nonce, message, publicKey, timestamp, maxAge = DEFAULT_SIGNATURE_AGE } = data;

  const now = Date.now();

  // Reject timestamps too far in the future (clock skew)
  if (timestamp > now + CLOCK_SKEW_TOLERANCE) return false;

  // Reject timestamps too old
  if (now - timestamp > maxAge) return false;

  try {
    const [ecdsaKey] = splitHybridKey(publicKey);
    return await globalThis.crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await deserializeKey(ecdsaKey, "ECDSA", ["verify"]),
      fromBase64(signature) as BufferSource,
      encoder.encode(`${nonce}:${message}:${timestamp}`) as BufferSource,
    );
  } catch {
    return false;
  }
};

/**
 * Generates a hybrid ECDSA + ECDH key pair on the P-256 curve.
 *
 * Two separate key pairs are created and combined into a single serialized string
 * so one identity can both sign (ECDSA) and encrypt (ECDH). The hybrid format
 * avoids re-using the same key material for different cryptographic operations.
 *
 * Serialized format: `<prefix><ecdsaBase64>:<ecdhBase64>` with prefix "S01:" for
 * the private key and "P01:" for the public key.
 *
 * @returns Object with `privateKey` and `publicKey` as serialized hybrid strings
 * @example
 * const { privateKey, publicKey } = await generate();
 */
const generate = async (): Promise<{
  privateKey: string;
  publicKey: string;
}> => {
  // Generate both key pairs
  const ecdsa = await globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);

  const ecdh = await globalThis.crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);

  // Export and combine keys with versioning
  const ecdsaPriv = toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("pkcs8", ecdsa.privateKey)));
  const ecdhPriv = toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("pkcs8", ecdh.privateKey)));
  const ecdsaPub = toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("spki", ecdsa.publicKey)));
  const ecdhPub = toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("spki", ecdh.publicKey)));

  // Printable key prefixes: S=private (secret), P=public, 01=version 1
  const privPrefix = "S01:";
  const pubPrefix = "P01:";

  return {
    privateKey: `${privPrefix}${ecdsaPriv}:${ecdhPriv}`,
    publicKey: `${pubPrefix}${ecdsaPub}:${ecdhPub}`,
  };
};

/**
 * Encrypts a string using ephemeral ECDH key agreement and AES-256-GCM.
 *
 * Output format: `<ephemeralPublicKeySPKI_base64>:<versionByte><iv12><ciphertext>_base64`.
 * An ephemeral key pair is generated per call so that the same plaintext encrypts
 * differently each time. The ephemeral public key is bound to the ciphertext via
 * AES-GCM Additional Authenticated Data (AAD), preventing key-substitution attacks.
 *
 * @param data - Payload string and the recipient's hybrid public key
 * @throws If the public key format is invalid
 * @example
 * const encrypted = await asymmetric.encrypt({ payload: "secret", publicKey });
 */
const asymEncrypt = async (data: { payload: string; publicKey: string }): Promise<string> => {
  const { payload, publicKey } = data;
  const [, ecdhKey] = splitHybridKey(publicKey);

  // Generate ephemeral key pair
  const ephemeral = await globalThis.crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);

  // Import recipient's public key
  const recipientPubKey = await deserializeKey(ecdhKey, "ECDH", []);

  // Derive shared secret via deriveBits
  const sharedSecret = await globalThis.crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: recipientPubKey,
    },
    ephemeral.privateKey,
    256, // 32 bytes
  );

  // Export public keys for binding
  const ephPubRaw = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", ephemeral.publicKey));

  // Create salt from ephemeral public key for context binding
  const salt = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", ephPubRaw)).slice(0, 16);

  // Import shared secret for HKDF
  const sharedKey = await globalThis.crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);

  // Derive encryption key with HKDF
  const encryptKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: encoder.encode("asym:v1:encrypt"),
    },
    sharedKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  // Encrypt with ephemeral public key as AAD
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await globalThis.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: ephPubRaw,
    },
    encryptKey,
    encoder.encode(payload),
  );

  // Format: version + ephemeral public key + iv + ciphertext
  const version = 0x01;
  const ephPubEncoded = toBase64(new Uint8Array(await globalThis.crypto.subtle.exportKey("spki", ephemeral.publicKey)));

  const result = new Uint8Array([version, ...iv, ...new Uint8Array(encrypted)]);

  return `${ephPubEncoded}:${toBase64(result)}`;
};

/**
 * Decrypts a string produced by `asymEncrypt` using the recipient's hybrid private key.
 *
 * Expected input format: `<ephemeralPubBase64>:<encryptedDataBase64>`.
 * Verifies the AAD binding of the ephemeral public key; decryption fails if
 * the ciphertext or ephemeral key has been tampered with.
 *
 * @param data - Encrypted payload string and the recipient's hybrid private key
 * @throws If the payload format is invalid, the version is unsupported, or decryption fails
 * @example
 * const decrypted = await asymmetric.decrypt({ payload: encrypted, privateKey });
 */
const asymDecrypt = async (data: { payload: string; privateKey: string }): Promise<string> => {
  const { payload: encryptedData, privateKey } = data;
  const separatorIndex = encryptedData.indexOf(":");
  if (separatorIndex === -1) throw new Error("Invalid encrypted payload format");
  const ephPub = encryptedData.slice(0, separatorIndex);
  const encData = encryptedData.slice(separatorIndex + 1);
  if (!ephPub || !encData) throw new Error("Invalid encrypted payload format");
  const encrypted = fromBase64(encData);

  // Check version
  const version = encrypted[0];
  if (version !== 0x01) {
    throw new Error(`Unsupported asymmetric encryption version: ${version}`);
  }

  const [, ecdhKey] = splitHybridKey(privateKey);
  const iv = encrypted.subarray(1, 13);
  const ciphertext = encrypted.subarray(13);

  // Import keys
  const ephemeralPub = await globalThis.crypto.subtle.importKey(
    "spki" as const,
    fromBase64(ephPub) as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  const myPrivateKey = await deserializeKey(ecdhKey, "ECDH", ["deriveBits"]);

  // Derive shared secret via deriveBits
  const sharedSecret = await globalThis.crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: ephemeralPub,
    },
    myPrivateKey,
    256, // 32 bytes
  );

  // Export ephemeral public key for salt
  const ephPubRaw = new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", ephemeralPub));

  // For decryption, we'll use just the ephemeral key for salt
  // This is still secure as the ephemeral key is unique per encryption
  const salt = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", ephPubRaw)).slice(0, 16);

  // Import shared secret for HKDF
  const sharedKey = await globalThis.crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);

  // Derive decryption key with HKDF
  const decryptKey = await globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: encoder.encode("asym:v1:encrypt"),
    },
    sharedKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  // Decrypt with ephemeral key as AAD
  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: ephPubRaw as BufferSource,
    },
    decryptKey,
    ciphertext as BufferSource,
  );

  return decoder.decode(decrypted);
};

/**
 * Asymmetric encryption utilities (hybrid ECDSA + ECDH)
 */
export const asymmetric = {
  generate,
  sign,
  verify,
  encrypt: asymEncrypt,
  decrypt: asymDecrypt,
};

//====================================
// SYMMETRIC ENCRYPTION
//====================================

/**
 * Derives an AES-256-GCM key from a low-entropy password using PBKDF2.
 * Uses 100,000 iterations of SHA-256 to make brute-force attacks expensive.
 * Intended for user-supplied passwords; for high-entropy keys use `deriveKeyHKDF`.
 *
 * @param password - User-supplied password
 * @param salt - Random 16-byte salt (must be stored alongside ciphertext)
 */
const deriveKeyPBKDF2 = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  const keyMaterial = await globalThis.crypto.subtle.importKey("raw", encoder.encode(password) as BufferSource, "PBKDF2", false, ["deriveKey"]);

  return await globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

/**
 * Derives an AES-256-GCM key from high-entropy key material using HKDF-SHA256.
 * Fast (single pass) because the input is already high-entropy (e.g. an API key
 * or the output of `common.generateKey`). Not suitable for user passwords.
 *
 * @param key - Hex-encoded high-entropy key material
 * @param salt - Random 16-byte salt (must be stored alongside ciphertext)
 */
const deriveKeyHKDF = async (key: string, salt: Uint8Array): Promise<CryptoKey> => {
  const keyMaterial = await globalThis.crypto.subtle.importKey("raw", fromHex(key) as BufferSource, "HKDF", false, ["deriveKey"]);

  return await globalThis.crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: encoder.encode("sym:v1:encrypt") as BufferSource,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

/**
 * Encrypts a string with AES-256-GCM, returning a hex-encoded blob.
 *
 * Output format (hex): `[version 1B][stretched flag 1B][salt 16B][iv 12B][ciphertext]`.
 *
 * The `stretched` flag selects the key derivation method:
 * - `true` (default): PBKDF2 -- slow, safe for user passwords.
 * - `false`: HKDF -- fast, for already-high-entropy keys (e.g. from `common.generateKey`).
 *
 * @param data - Payload, key, and optional stretched flag
 * @example
 * await symEncrypt({ payload: "secret", key: "user-password" });
 * await symEncrypt({ payload: "data", key: hexKey, stretched: false });
 */
const symEncrypt = async (data: { payload: string; key: string; stretched?: boolean }): Promise<string> => {
  const { payload, key, stretched = true } = data;

  // Generate random salt
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));

  // Derive key based on type
  const cryptoKey = stretched ? await deriveKeyPBKDF2(key, salt) : await deriveKeyHKDF(key, salt);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoder.encode(payload));

  // Format: [version (1 byte)] + [stretched flag (1 byte)] + [salt (16 bytes)] + [iv (12 bytes)] + [ciphertext]
  const version = 0x01;
  const flag = stretched ? 0x01 : 0x00;
  const result = new Uint8Array([version, flag, ...salt, ...iv, ...new Uint8Array(encrypted)]);

  return toHex(result);
};

/**
 * Decrypts a hex-encoded blob produced by `symEncrypt`.
 *
 * Automatically selects PBKDF2 or HKDF based on the embedded stretched flag.
 * Input format (hex): `[version 1B][stretched flag 1B][salt 16B][iv 12B][ciphertext]`.
 *
 * @param data - Hex-encoded encrypted payload and the original key
 * @throws If the version is unsupported or decryption fails (wrong key / corrupted data)
 * @example
 * const plaintext = await symDecrypt({ payload: encryptedHex, key: "password" });
 */
const symDecrypt = async (data: { payload: string; key: string }): Promise<string> => {
  const encrypted = fromHex(data.payload);

  // Check version
  const version = encrypted[0];
  if (version !== 0x01) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  // Parse format: [version (1 byte)][flag (1 byte)][salt (16 bytes)][iv (12 bytes)][ciphertext]
  const stretched = encrypted[1] === 0x01;
  const salt = encrypted.subarray(2, 18);
  const iv = encrypted.subarray(18, 30);
  const ciphertext = encrypted.subarray(30);

  // Derive key with correct method
  const cryptoKey = stretched ? await deriveKeyPBKDF2(data.key, salt) : await deriveKeyHKDF(data.key, salt);

  const decrypted = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, cryptoKey, ciphertext as BufferSource);

  return decoder.decode(decrypted);
};

/**
 * Symmetric encryption utilities using AES-GCM
 */
export const symmetric = {
  encrypt: symEncrypt,
  decrypt: symDecrypt,
};

//====================================
// TOTP (Time-based One-Time Password)
//====================================

/**
 * Computes an HMAC-SHA1 digest of the counter using the shared secret.
 * Used internally for TOTP code generation (SHA-1 is required by RFC 6238 / RFC 4226).
 *
 * @param secret - Raw secret bytes (decoded from Base32)
 * @param counter - 8-byte big-endian counter (typically `floor(unixSeconds / 30)`)
 */
const generateHMAC = async (secret: Uint8Array, counter: bigint): Promise<Uint8Array> => {
  const key = await globalThis.crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);

  // Convert counter to 8-byte buffer (big-endian)
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, counter, false);

  const signature = await globalThis.crypto.subtle.sign("HMAC", key, buffer);
  return new Uint8Array(signature);
};

/**
 * Performs RFC 4226 dynamic truncation on an HMAC digest to produce a numeric OTP.
 * Extracts a 4-byte dynamic binary code at an offset determined by the last nibble
 * of the HMAC, then reduces it modulo 10^digits and zero-pads.
 *
 * @param hmac - HMAC-SHA1 digest (20 bytes)
 * @param digits - Number of output digits (default 6)
 */
const truncate = (hmac: Uint8Array, digits: number = 6): string => {
  const offset = hmac[hmac.length - 1]! & 0xf;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) | ((hmac[offset + 1]! & 0xff) << 16) | ((hmac[offset + 2]! & 0xff) << 8) | (hmac[offset + 3]! & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
};

/**
 * Creates a new TOTP shared secret (160-bit / 20 bytes) and an `otpauth://` URI
 * suitable for QR-code provisioning.
 *
 * The returned secret is Base32-encoded. It should be encrypted at rest
 * (e.g. with `symmetric.encrypt`) -- never stored in plain text.
 * The URI should only be transmitted over a trusted channel (typically rendered
 * as a QR code shown directly to the user).
 *
 * Uses SHA-1, 6 digits, 30-second period (standard defaults).
 *
 * @param data - Account label (e.g. email) and issuer (service name)
 * @returns Object with `uri` (otpauth URI) and `secret` (Base32 string)
 */
const createTotp = async (data: {
  label: string;
  issuer: string;
}): Promise<{
  uri: string;
  secret: string;
}> => {
  const { label, issuer } = data;

  // Generate 20 random bytes (160 bits) for secret
  const secretBytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
  const secret = toBase32(secretBytes);

  // Create otpauth URI (with plain secret for QR code)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params}`;

  return { uri, secret };
};

/**
 * Verifies a TOTP token against the shared secret.
 *
 * The `window` parameter controls how many adjacent 30-second time steps are
 * checked on each side of the current step. With the default `window = 1`,
 * the token is valid if it matches any of the 3 steps: previous, current, or next
 * (i.e. +/- 30 seconds tolerance).
 *
 * Uses constant-time comparison to prevent timing side-channel attacks.
 * Returns `false` (never throws) on invalid Base32 secrets.
 *
 * @param data - Token string, Base32 secret, and optional window size
 * @example
 * const ok = await totp.verify({ token: "123456", secret: base32Secret });
 */
const verifyTotp = async (data: { token: string; secret: string; window?: number }): Promise<boolean> => {
  const { token, secret, window = 1 } = data;

  try {
    const secretBytes = fromBase32(secret);
    const timeStep = 30; // 30 seconds per step
    const currentTime = Math.floor(Date.now() / 1000);
    const counter = BigInt(Math.floor(currentTime / timeStep));

    // Check current and adjacent time windows
    for (let i = -window; i <= window; i++) {
      const testCounter = counter + BigInt(i);
      const hmac = await generateHMAC(secretBytes, testCounter);
      const testToken = truncate(hmac, 6);

      // Constant-time comparison to prevent timing attacks
      if (token.length === testToken.length) {
        let match = 0;
        for (let j = 0; j < token.length; j++) {
          match |= token.charCodeAt(j) ^ testToken.charCodeAt(j);
        }
        if (match === 0) return true;
      }
    }

    return false;
  } catch {
    // Invalid base32 secrets and crypto errors → verification fails
    return false;
  }
};

/**
 * TOTP interface
 */
export const totp = {
  create: createTotp,
  verify: verifyTotp,
};

export const crypto = {
  common,
  asymmetric,
  symmetric,
  totp,
} as const;
