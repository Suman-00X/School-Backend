import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/* Password hashing with scrypt (memory-hard, built into Node; no native dependency).
   Stored as "scrypt$<N>$<r>$<p>$<salt>$<hash>" so parameters can be raised later:
   needsRehash() tells the login flow to re-hash with the current parameters. */

const scryptAsync = promisify(scrypt);
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const maxmem = params => 256 * params.N * params.r;

export const hashPassword = async password => {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, { ...PARAMS, maxmem: maxmem(PARAMS) });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
};

const parse = stored => {
  const [scheme, N, r, p, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "scrypt" || !hash) return null;
  return {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url")
  };
};

/* Constant-time comparison. A missing or malformed hash still costs one scrypt run,
   so response times do not reveal whether an account exists. */
const DUMMY = { ...PARAMS, salt: Buffer.alloc(16), hash: Buffer.alloc(KEY_LENGTH) };
export const verifyPassword = async (password, stored) => {
  const parsed = parse(stored);
  const { N, r, p, salt, hash } = parsed ?? DUMMY;
  const candidate = await scryptAsync(String(password).normalize("NFKC"), salt, hash.length, {
    N,
    r,
    p,
    maxmem: maxmem({ N, r })
  });
  return Boolean(parsed) && timingSafeEqual(candidate, hash);
};

export const needsRehash = stored => {
  const parsed = parse(stored);
  return !parsed || parsed.N !== PARAMS.N || parsed.r !== PARAMS.r || parsed.p !== PARAMS.p;
};
