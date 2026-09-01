import { encryptSecret as encrypt, decryptSecret as decrypt } from "@/server/secret-crypto";

const ENV_VAR = "GITHUB_TOKEN_ENCRYPTION_SECRET";

export function encryptSecret(plaintext: string): string {
  return encrypt(plaintext, ENV_VAR);
}

export function decryptSecret(payload: string): string {
  return decrypt(payload, ENV_VAR);
}
