import bcrypt from "bcryptjs";

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plain-text password using bcrypt with 12 salt rounds.
 * Enforces non-empty and minimum length validation.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string" || password.trim().length === 0) {
    throw new Error("Password cannot be empty.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Securely verifies a candidate password against the stored password hash.
 * Supports legacy plaintext migration: returns true if matching, enabling immediate hash upgrade.
 */
export async function verifyPassword(
  candidatePassword: string,
  storedHash?: string | null
): Promise<boolean> {
  if (!candidatePassword || !storedHash || typeof candidatePassword !== "string") {
    return false;
  }

  // Bcrypt hash format starts with $2a$, $2b$, or $2y$
  if (storedHash.startsWith("$2")) {
    return bcrypt.compare(candidatePassword, storedHash);
  }

  // Legacy plaintext fallback check
  return candidatePassword === storedHash;
}

/**
 * Checks if a stored password string is an unhashed legacy plaintext password.
 */
export function isLegacyPlaintext(storedPassword?: string | null): boolean {
  if (!storedPassword || typeof storedPassword !== "string") {
    return false;
  }
  return !storedPassword.startsWith("$2");
}
