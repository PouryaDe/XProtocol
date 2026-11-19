import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function generateWireGuardKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  // Raw 32-byte keys are the last 32 bytes of PKCS8/SPKI DER for X25519
  return {
    privateKey: privDer.subarray(privDer.length - 32).toString('base64'),
    publicKey: pubDer.subarray(pubDer.length - 32).toString('base64'),
  };
}

const PKCS8_X25519_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

/** Generate an X25519 keypair in Xray Reality raw base64url format. */
export function generateRealityKeypair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  return {
    privateKey: privDer.subarray(privDer.length - 32).toString('base64url'),
    publicKey: pubDer.subarray(pubDer.length - 32).toString('base64url'),
  };
}

/** Derive the matching Xray Reality base64url public key from a raw base64url private key. */
export function deriveRealityPublicKey(privateKeyB64u: string): string {
  try {
    const raw = Buffer.from((privateKeyB64u || '').trim(), 'base64url');
    if (raw.length !== 32) return '';
    const privObj = crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_X25519_PREFIX, raw]),
      format: 'der',
      type: 'pkcs8',
    });
    const pubObj = crypto.createPublicKey(privObj);
    const spki = pubObj.export({ format: 'der', type: 'spki' });
    return spki.subarray(spki.length - 32).toString('base64url');
  } catch {
    return '';
  }
}

export function generateShortId(bytes = 4): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateSs2022Key(method: string): string {
  const byteLen = method.includes('256') ? 32 : 16;
  return crypto.randomBytes(byteLen).toString('base64');
}
