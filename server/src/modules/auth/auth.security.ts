import bcrypt from "bcrypt";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const BCRYPT_ROUNDS = 10;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;

export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

export const verifyPassword = async (password: string, storedHash: string) => {
  if (storedHash.startsWith("$2")) {
    return bcrypt.compare(password, storedHash);
  }

  const [algorithm, salt, hash] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  const storedBuffer = Buffer.from(hash, "hex");

  if (storedBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedKey);
};

export const generateSessionToken = () => {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
};

export const hashSessionToken = (token: string) => {
  return createHash("sha256").update(token).digest("hex");
};
