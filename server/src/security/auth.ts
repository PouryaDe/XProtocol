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

export function generateShortId(bytes = 4): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateSs2022Key(method: string): string {
  const byteLen = method.includes('256') ? 32 : 16;
  return crypto.randomBytes(byteLen).toString('base64');
}
