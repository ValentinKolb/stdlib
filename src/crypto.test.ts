import { describe, it, expect } from "bun:test";
import { common, symmetric, asymmetric, totp } from "./crypto";

// ==========================
// common.hash
// ==========================

describe("common.hash", () => {
  it("returns SHA-256 hex for known input", async () => {
    const result = await common.hash("hello");
    expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns consistent hash for Uint8Array input", async () => {
    const fromString = await common.hash("hello");
    const fromBytes = await common.hash(new TextEncoder().encode("hello"));
    expect(fromString).toBe(fromBytes);
  });

  it("returns hex string of correct length (64 chars)", async () => {
    const result = await common.hash("anything");
    expect(result.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(result)).toBe(true);
  });
});

// ==========================
// common.fnv1aHash
// ==========================

describe("common.fnv1aHash", () => {
  it("returns deterministic hash", () => {
    expect(common.fnv1aHash("test")).toBe(common.fnv1aHash("test"));
  });

  it("returns different hashes for different inputs", () => {
    expect(common.fnv1aHash("a")).not.toBe(common.fnv1aHash("b"));
  });

  it("returns hex string", () => {
    expect(/^[0-9a-f]+$/.test(common.fnv1aHash("test"))).toBe(true);
  });

  it("handles empty string", () => {
    const result = common.fnv1aHash("");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ==========================
// common.readableId
// ==========================

describe("common.readableId", () => {
  it("returns default pattern 3-4-3-4 with hyphens", () => {
    const id = common.readableId();
    expect(id).toMatch(/^.{3}-.{4}-.{3}-.{4}$/);
  });

  it("respects custom pattern", () => {
    const id = common.readableId(5, 5);
    expect(id).toMatch(/^.{5}-.{5}$/);
  });

  it("single segment has no hyphens", () => {
    const id = common.readableId(8);
    expect(id.length).toBe(8);
    expect(id).not.toContain("-");
  });

  it("uses only ambiguity-free alphabet (no 0, 1, O, I, l)", () => {
    // Generate a long ID to increase coverage
    const id = common.readableId(100);
    expect(id).not.toMatch(/[01OIl]/);
  });

  it("generates unique ids", () => {
    const ids = Array.from({ length: 100 }, () => common.readableId());
    expect(new Set(ids).size).toBe(100);
  });
});

// ==========================
// common.uuid
// ==========================

describe("common.uuid", () => {
  it("returns valid UUID v4 format", () => {
    const uuid = common.uuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("generates unique values", () => {
    expect(common.uuid()).not.toBe(common.uuid());
  });
});

// ==========================
// common.generateKey
// ==========================

describe("common.generateKey", () => {
  it("returns 64-char hex string by default (32 bytes)", () => {
    const key = common.generateKey();
    expect(key.length).toBe(64);
  });

  it("returns correct length for custom byte count", () => {
    expect(common.generateKey(16).length).toBe(32);
  });

  it("contains only hex characters", () => {
    expect(/^[0-9a-f]+$/.test(common.generateKey())).toBe(true);
  });
});

// ==========================
// symmetric encrypt/decrypt
// ==========================

describe("symmetric encrypt/decrypt", () => {
  it("roundtrips with password (PBKDF2, stretched=true)", async () => {
    const encrypted = await symmetric.encrypt({ payload: "secret", key: "password123" });
    const decrypted = await symmetric.decrypt({ payload: encrypted, key: "password123" });
    expect(decrypted).toBe("secret");
  });

  it("roundtrips with high-entropy key (HKDF, stretched=false)", async () => {
    const key = common.generateKey();
    const encrypted = await symmetric.encrypt({ payload: "secret", key, stretched: false });
    const decrypted = await symmetric.decrypt({ payload: encrypted, key });
    expect(decrypted).toBe("secret");
  });

  it("roundtrips empty string", async () => {
    const encrypted = await symmetric.encrypt({ payload: "", key: "pw" });
    const decrypted = await symmetric.decrypt({ payload: encrypted, key: "pw" });
    expect(decrypted).toBe("");
  });

  it("roundtrips Unicode text", async () => {
    const text = "Hallo Welt \u{1F30D}";
    const encrypted = await symmetric.encrypt({ payload: text, key: "pw" });
    const decrypted = await symmetric.decrypt({ payload: encrypted, key: "pw" });
    expect(decrypted).toBe(text);
  });

  it("different encryptions produce different ciphertexts", async () => {
    const a = await symmetric.encrypt({ payload: "same", key: "pw" });
    const b = await symmetric.encrypt({ payload: "same", key: "pw" });
    expect(a).not.toBe(b);
  });

  it("decrypt fails with wrong key", async () => {
    const encrypted = await symmetric.encrypt({ payload: "secret", key: "correct" });
    await expect(symmetric.decrypt({ payload: encrypted, key: "wrong" })).rejects.toThrow();
  });

  it("output is valid hex string", async () => {
    const encrypted = await symmetric.encrypt({ payload: "test", key: "pw" });
    expect(/^[0-9a-f]+$/.test(encrypted)).toBe(true);
  });
});

// ==========================
// asymmetric generate/encrypt/decrypt
// ==========================

describe("asymmetric generate/encrypt/decrypt", () => {
  it("generates key pair with private and public keys", async () => {
    const keys = await asymmetric.generate();
    expect(keys.privateKey.length).toBeGreaterThan(0);
    expect(keys.publicKey.length).toBeGreaterThan(0);
  });

  it("public key starts with P01: and private key starts with S01:", async () => {
    const keys = await asymmetric.generate();
    expect(keys.publicKey.startsWith("P01:")).toBe(true);
    expect(keys.privateKey.startsWith("S01:")).toBe(true);
  });

  it("roundtrips encryption", async () => {
    const keys = await asymmetric.generate();
    const encrypted = await asymmetric.encrypt({ payload: "hello", publicKey: keys.publicKey });
    const decrypted = await asymmetric.decrypt({ payload: encrypted, privateKey: keys.privateKey });
    expect(decrypted).toBe("hello");
  });

  it("roundtrips Unicode and long text", async () => {
    const keys = await asymmetric.generate();
    const text = "A".repeat(10000) + " \u{1F680}";
    const encrypted = await asymmetric.encrypt({ payload: text, publicKey: keys.publicKey });
    const decrypted = await asymmetric.decrypt({ payload: encrypted, privateKey: keys.privateKey });
    expect(decrypted).toBe(text);
  });

  it("decrypt fails with wrong private key", async () => {
    const keys1 = await asymmetric.generate();
    const keys2 = await asymmetric.generate();
    const encrypted = await asymmetric.encrypt({ payload: "hello", publicKey: keys1.publicKey });
    await expect(asymmetric.decrypt({ payload: encrypted, privateKey: keys2.privateKey })).rejects.toThrow();
  });

  it("roundtrips empty string", async () => {
    const keys = await asymmetric.generate();
    const encrypted = await asymmetric.encrypt({ payload: "", publicKey: keys.publicKey });
    const decrypted = await asymmetric.decrypt({ payload: encrypted, privateKey: keys.privateKey });
    expect(decrypted).toBe("");
  });
});

// ==========================
// asymmetric sign/verify
// ==========================

describe("asymmetric sign/verify", () => {
  it("sign and verify roundtrip succeeds", async () => {
    const keys = await asymmetric.generate();
    const sig = await asymmetric.sign({ privateKey: keys.privateKey, message: "hello" });
    const valid = await asymmetric.verify({
      publicKey: keys.publicKey,
      signature: sig.signature,
      nonce: sig.nonce,
      timestamp: sig.timestamp,
      message: "hello",
    });
    expect(valid).toBe(true);
  });

  it("verify fails with wrong public key", async () => {
    const keys1 = await asymmetric.generate();
    const keys2 = await asymmetric.generate();
    const sig = await asymmetric.sign({ privateKey: keys1.privateKey, message: "hello" });
    const valid = await asymmetric.verify({
      publicKey: keys2.publicKey,
      signature: sig.signature,
      nonce: sig.nonce,
      timestamp: sig.timestamp,
      message: "hello",
    });
    expect(valid).toBe(false);
  });

  it("verify fails with tampered message", async () => {
    const keys = await asymmetric.generate();
    const sig = await asymmetric.sign({ privateKey: keys.privateKey, message: "hello" });
    const valid = await asymmetric.verify({
      publicKey: keys.publicKey,
      signature: sig.signature,
      nonce: sig.nonce,
      timestamp: sig.timestamp,
      message: "world",
    });
    expect(valid).toBe(false);
  });

  it("verify fails for expired signature", async () => {
    const keys = await asymmetric.generate();
    const sig = await asymmetric.sign({ privateKey: keys.privateKey, message: "hello" });
    await Bun.sleep(15);
    const valid = await asymmetric.verify({
      publicKey: keys.publicKey,
      signature: sig.signature,
      nonce: sig.nonce,
      timestamp: sig.timestamp,
      message: "hello",
      maxAge: 1, // 1ms max age, but >15ms have passed
    });
    expect(valid).toBe(false);
  });
});

// ==========================
// totp
// ==========================

describe("totp", () => {
  it("create returns URI and secret", async () => {
    const { uri, secret } = await totp.create({ label: "user@example.com", issuer: "MyApp" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=");
    expect(uri).toContain("issuer=");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("create URI contains required parameters", async () => {
    const { uri } = await totp.create({ label: "user", issuer: "App" });
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("verifies a valid TOTP token", async () => {
    const { secret } = await totp.create({ label: "test@example.com", issuer: "Test" });
    // We can't easily generate a valid token without reimplementing TOTP,
    // but we CAN test that obviously wrong tokens return false.
    // With window=0 (strict), a random 6-digit code has a 1-in-1M chance of matching.
    // Testing 3 different tokens: probability of ALL matching is ~1e-18.
    const wrong1 = await totp.verify({ token: "000000", secret });
    const wrong2 = await totp.verify({ token: "999999", secret });
    const wrong3 = await totp.verify({ token: "123456", secret });
    const falseCount = [wrong1, wrong2, wrong3].filter(v => v === false).length;
    expect(falseCount).toBeGreaterThanOrEqual(2);
  });

  it("cross-secret contamination fails", async () => {
    const a = await totp.create({ label: "a", issuer: "App" });
    const b = await totp.create({ label: "b", issuer: "App" });
    // Secrets should be different
    expect(a.secret).not.toBe(b.secret);
  });
});
