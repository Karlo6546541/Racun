import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hmacSecret } from "./config";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function friendCode(): string {
  const b = randomBytes(6);
  return "AIL-" + Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

export function sign(value: string): string {
  return value + "." + createHmac("sha256", hmacSecret()).update(value).digest("base64url");
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signed);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

export function ipHash(ip: string): string {
  return createHmac("sha256", hmacSecret()).update("ip:" + ip).digest("hex").slice(0, 24);
}
