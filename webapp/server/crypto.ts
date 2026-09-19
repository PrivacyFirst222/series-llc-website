import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
  createHmac,
  createDecipheriv,
  hkdfSync,
} from "node:crypto";
import { env } from "./env";
import { seal, unseal } from "./encryption";

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `s1:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [v, saltHex, keyHex] = stored.split(":");
  if (v !== "s1" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Opaque bearer token: random value to the user, only its hash in the DB. */
export function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hmacSha256Base64(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("base64");
}

/** Legacy v1 values use the prior session secret. New values use the versioned
 * encryption key ring. Migrate all live values before retiring either key;
 * pending EIN numbers and S-election numbers inside their edit window matter. */
function secretKey(): Buffer {
  return Buffer.from(hkdfSync("sha256", process.env.LEGACY_SESSION_SECRET || env.SESSION_SECRET, "fpsllc-ein-v1", "ein-encryption", 32));
}

export function encryptSecret(plain: string): string {
  return `v2:${seal(Buffer.from(plain)).toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (stored.startsWith("v2:")) return unseal(Buffer.from(stored.slice(3), "base64")).toString();
  const [v, ivHex, tagHex, ctHex] = stored.split(":");
  if (v !== "v1" || !ivHex || !tagHex || !ctHex) throw new Error("bad secret format");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
