import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(envVar: string): Buffer {
  const secret = process.env[envVar];
  if (!secret) throw new Error(`${envVar} is not set.`);
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string, envVar: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(envVar), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(payload: string, envVar: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload.");
  const decipher = crypto.createDecipheriv(ALGO, getKey(envVar), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
