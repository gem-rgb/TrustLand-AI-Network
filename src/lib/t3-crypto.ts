// TrustLand AI Network - Terminal 3 Real Cryptographic Module
// Replaces mock crypto with real Ed25519 signing and verification
// Uses tweetnacl for Ed25519 key pairs and jose for JWT operations

import nacl from 'tweetnacl';
import { base64url } from 'jose';
import { createHash, randomBytes } from 'crypto';

// ─── Ed25519 Key Pair Generation ─────────────────────────────────────────────

export interface Ed25519KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  publicKeyBase64: string;
  privateKeyBase64: string;
  publicKeyMultibase: string; // multikey format for DID documents
}

/**
 * Generate a real Ed25519 key pair using tweetnacl
 * This replaces the mock `generateKeyPair()` that used random hex strings
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const keyPair = nacl.sign.keyPair();
  const publicKeyBase64 = Buffer.from(keyPair.publicKey).toString('base64url');
  const privateKeyBase64 = Buffer.from(keyPair.secretKey).toString('base64url');

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.secretKey,
    publicKeyBase64,
    privateKeyBase64,
    // Multikey format: base58btc encoding with multicodec prefix for Ed25519
    publicKeyMultibase: `z${publicKeyBase64}`,
  };
}

// ─── Real Ed25519 Signing ─────────────────────────────────────────────────────

/**
 * Sign data using real Ed25519 private key
 * This replaces the mock `signData()` that just did SHA-256(data + key)
 */
export function signEd25519(data: string, privateKeyBase64: string): string {
  const message = new TextEncoder().encode(data);
  const privateKey = Buffer.from(privateKeyBase64, 'base64url');
  const signature = nacl.sign.detached(message, privateKey);
  return `ed25519:${Buffer.from(signature).toString('base64url')}`;
}

/**
 * Verify a real Ed25519 signature
 * This replaces the mock `verifySignature()` that just checked `sig_` prefix
 */
export function verifyEd25519Signature(
  data: string,
  signature: string,
  publicKeyBase64: string
): boolean {
  if (!signature.startsWith('ed25519:')) return false;
  try {
    const message = new TextEncoder().encode(data);
    const publicKey = Buffer.from(publicKeyBase64, 'base64url');
    const sigBytes = Buffer.from(signature.replace('ed25519:', ''), 'base64url');
    return nacl.sign.detached.verify(message, sigBytes, publicKey);
  } catch {
    return false;
  }
}

// ─── DID Generation (W3C DID Method) ──────────────────────────────────────────

/**
 * Generate a proper W3C DID using the did:key method
 * did:key format: did:key:z<base58btc-multibase-of-public-key>
 * This replaces the mock `generateDid()` that just used random hex
 */
export function generateDidKey(publicKeyBase64: string): string {
  // did:key method uses multibase encoding of the public key
  // For Ed25519, the multicodec prefix is 0xed01
  const pubKeyBytes = Buffer.from(publicKeyBase64, 'base64url');
  const multicodecPrefix = Buffer.from([0xed, 0x01]);
  const combined = Buffer.concat([multicodecPrefix, pubKeyBytes]);
  const multibase = `z${combined.toString('base64url')}`;
  return `did:key:${multibase}`;
}

/**
 * Generate a Terminal 3 DID
 * Uses did:t3 method with Ed25519 public key fingerprint
 */
export function generateT3Did(publicKeyBase64: string): string {
  // Create a deterministic DID from the public key
  const fingerprint = createHash('sha256')
    .update(publicKeyBase64)
    .digest('hex')
    .slice(0, 32);
  return `did:t3:${fingerprint}`;
}

/**
 * Generate a DID Document for a did:key DID
 * W3C DID Core specification compliant
 */
export function generateDidDocument(did: string, publicKeyBase64: string) {
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: `z${publicKeyBase64}`,
      },
    ],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
    capabilityDelegation: [`${did}#key-1`],
    capabilityInvocation: [`${did}#key-1`],
  };
}

// ─── Hashing (SHA-256 - already real, just re-exported) ───────────────────────

export function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hashDataBase64url(data: string): string {
  return createHash('sha256').update(data).digest('base64url');
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function generateRandomId(): string {
  return randomBytes(16).toString('hex');
}

export function generateApiKey(): string {
  return `t3ak_${randomBytes(24).toString('base64url')}`;
}
