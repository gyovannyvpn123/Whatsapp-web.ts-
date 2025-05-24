/**
 * Utilități criptografice pentru WhatsApp Web
 */

import * as crypto from 'crypto';
import * as curve from 'curve25519-n';

/**
 * Generează o pereche de chei Curve25519
 */
export function generateKeyPair(): { publicKey: Buffer, privateKey: Buffer } {
  const privateKey = crypto.randomBytes(32);
  const keyPair = curve.makeKeyPair(privateKey);
  
  return {
    privateKey: Buffer.from(privateKey),
    publicKey: Buffer.from(keyPair.publicKey)
  };
}

/**
 * Generează chei HKDF
 * @param {Buffer} ikm Input keying material
 * @param {number} length Lungimea cheii generate
 * @param {Buffer} info Informații de context
 * @param {Buffer} salt Salt
 */
export function hkdf(ikm: Buffer, length: number, info?: Buffer, salt?: Buffer): Buffer {
  // Implementarea reală a HKDF conform RFC 5869
  const prk = crypto.createHmac('sha256', salt || Buffer.alloc(0))
    .update(ikm)
    .digest();
  
  let output = Buffer.alloc(0);
  let t = Buffer.alloc(0);
  
  for (let i = 1; i <= Math.ceil(length / 32); i++) {
    t = crypto.createHmac('sha256', prk)
      .update(Buffer.concat([t, info || Buffer.alloc(0), Buffer.from([i])])
      .digest();
    output = Buffer.concat([output, t]);
  }
  
  return output.slice(0, length);
}

/**
 * Criptare AES-CBC
 * @param {Buffer} data Date de criptat
 * @param {Buffer} key Cheia de criptare
 * @param {Buffer} iv Vector de inițializare
 */
export function aesEncrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/**
 * Decriptare AES-CBC
 * @param {Buffer} data Date de decriptat
 * @param {Buffer} key Cheia de decriptare
 * @param {Buffer} iv Vector de inițializare
 */
export function aesDecrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Calcul HMAC-SHA256
 * @param {Buffer} data Date de semnat
 * @param {Buffer} key Cheia de semnare
 */
export function hmacSign(data: Buffer, key: Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * Verificare HMAC-SHA256
 * @param {Buffer} data Date de verificat
 * @param {Buffer} key Cheia de verificare
 * @param {Buffer} signature Semnătura de verificat
 */
export function hmacVerify(data: Buffer, key: Buffer, signature: Buffer): boolean {
  const computed = hmacSign(data, key);
  return crypto.timingSafeEqual(computed, signature);
}

/**
 * Calcul SHA256
 * @param {Buffer} data Date de hașat
 */
export function sha256(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}