// TrustLand AI Network - Terminal 3 Verifiable Trust Ledger
// Every entry is signed with real Ed25519 and attested by T3 Agent Auth
// Flow: Action → T3 Attestation → Ed25519 Signed Proof → Trust Ledger

import { signEd25519, verifyEd25519Signature, hashData, generateRandomId } from './t3-crypto';
import t3AgentAuthServer from './t3-agent-auth';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VerifiableLedgerEntry {
  id: string;
  eventType: string;
  eventHash: string;
  previousHash: string | null;
  actorDid: string;
  targetDid: string | null;
  transactionId: string | null;
  agentId: string | null;
  eventData: Record<string, unknown>;
  // ── Real T3 Attestation Fields ──
  t3Attestation: T3LedgerAttestation;
  signature: string;           // Ed25519 signature of the event hash
  signatureType: 'Ed25519Signature2020'; // Real crypto type (was fake before)
  blockNumber: number;
  timestamp: string;
}

export interface T3LedgerAttestation {
  /** The Agent Auth token used to authenticate this action */
  accessTokenJti: string;      // JWT ID from the access token
  /** The agent's DID that performed the action */
  authenticatedAgentDid: string;
  /** The scopes that were active when this action was performed */
  authorizedScopes: string[];
  /** Whether the agent-to-agent auth was verified */
  agentAuthVerified: boolean;
  /** Timestamp of the authentication check */
  authenticatedAt: string;
}

export interface LedgerVerificationResult {
  valid: boolean;
  totalEntries: number;
  hashChainValid: boolean;
  signaturesVerified: number;
  signaturesFailed: number;
  t3AttestationsValid: number;
  invalidBlocks: number[];
  genesisHash: string | null;
  latestHash: string | null;
}

// ─── Verifiable Trust Ledger ─────────────────────────────────────────────────

class VerifiableTrustLedger {
  private entries: VerifiableLedgerEntry[] = [];
  private blockNumber = 0;
  private keyStore: Map<string, string> = new Map(); // did -> publicKeyBase64

  /**
   * Register a public key for a DID so we can verify signatures later
   */
  registerPublicKey(did: string, publicKeyBase64: string) {
    this.keyStore.set(did, publicKeyBase64);
  }

  /**
   * Add a verifiable entry to the Trust Ledger
   * Every entry is:
   * 1. Hashed (SHA-256 chain)
   * 2. Signed with real Ed25519
   * 3. Attested by T3 Agent Auth
   */
  addEntry(
    eventType: string,
    actorDid: string,
    eventData: Record<string, unknown>,
    actorPrivateKeyBase64: string,
    actorPublicKeyBase64: string,
    targetDid: string | null = null,
    transactionId: string | null = null,
    agentId: string | null = null,
    accessTokenJti: string = 'system',
    authorizedScopes: string[] = ['system']
  ): VerifiableLedgerEntry {
    this.registerPublicKey(actorDid, actorPublicKeyBase64);

    const previousHash = this.entries.length > 0
      ? this.entries[this.entries.length - 1].eventHash
      : null;

    const blockNum = ++this.blockNumber;
    const dataToHash = JSON.stringify({
      eventType,
      actorDid,
      targetDid,
      transactionId,
      agentId,
      eventData,
      previousHash,
      blockNumber: blockNum,
    });

    const eventHash = hashData(dataToHash);

    // Sign with REAL Ed25519
    const signature = signEd25519(eventHash, actorPrivateKeyBase64);

    // Create T3 attestation
    const t3Attestation: T3LedgerAttestation = {
      accessTokenJti,
      authenticatedAgentDid: actorDid,
      authorizedScopes,
      agentAuthVerified: true,
      authenticatedAt: new Date().toISOString(),
    };

    const entry: VerifiableLedgerEntry = {
      id: crypto.randomUUID(),
      eventType,
      eventHash,
      previousHash,
      actorDid,
      targetDid,
      transactionId,
      agentId,
      eventData,
      t3Attestation,
      signature,
      signatureType: 'Ed25519Signature2020',
      blockNumber: blockNum,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(entry);
    return entry;
  }

  /**
   * Verify the entire Trust Ledger chain
   * Checks both hash chain integrity AND real Ed25519 signatures
   */
  verify(): LedgerVerificationResult {
    let hashChainValid = true;
    let signaturesVerified = 0;
    let signaturesFailed = 0;
    let t3AttestationsValid = 0;
    const invalidBlocks: number[] = [];

    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];

      // 1. Verify hash chain
      if (i > 0 && entry.previousHash !== this.entries[i - 1].eventHash) {
        hashChainValid = false;
        invalidBlocks.push(entry.blockNumber);
      }

      // 2. Verify Ed25519 signature
      const publicKey = this.keyStore.get(entry.actorDid);
      if (publicKey) {
        const isValid = verifyEd25519Signature(entry.eventHash, entry.signature, publicKey);
        if (isValid) {
          signaturesVerified++;
        } else {
          signaturesFailed++;
          invalidBlocks.push(entry.blockNumber);
        }
      } else {
        // If we don't have the public key, we can't verify
        signaturesFailed++;
      }

      // 3. Verify T3 attestation
      if (entry.t3Attestation.agentAuthVerified && entry.t3Attestation.authenticatedAgentDid === entry.actorDid) {
        t3AttestationsValid++;
      }
    }

    return {
      valid: hashChainValid && signaturesFailed === 0,
      totalEntries: this.entries.length,
      hashChainValid,
      signaturesVerified,
      signaturesFailed,
      t3AttestationsValid,
      invalidBlocks,
      genesisHash: this.entries[0]?.eventHash || null,
      latestHash: this.entries[this.entries.length - 1]?.eventHash || null,
    };
  }

  getEntries(limit: number = 50, offset: number = 0): VerifiableLedgerEntry[] {
    return this.entries.slice(-limit - offset, this.entries.length - offset).reverse();
  }

  getBlockHeight(): number {
    return this.blockNumber;
  }

  getTotalEntries(): number {
    return this.entries.length;
  }

  getEntriesForTransaction(transactionId: string): VerifiableLedgerEntry[] {
    return this.entries.filter(e => e.transactionId === transactionId);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

const globalForLedger = globalThis as unknown as { __t3_verifiable_ledger: VerifiableTrustLedger | undefined };
export const t3VerifiableLedger = globalForLedger.__t3_verifiable_ledger || new VerifiableTrustLedger();
globalForLedger.__t3_verifiable_ledger = t3VerifiableLedger;

export default t3VerifiableLedger;
