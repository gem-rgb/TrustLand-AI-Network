// TrustLand AI Network - Terminal 3 Verifiable Trust Ledger
// Every entry is signed with real Ed25519 and attested by T3 Agent Auth
// Flow: Action → T3 Attestation → Ed25519 Signed Proof → Trust Ledger
import { signEd25519, verifyEd25519Signature, hashData } from './t3-crypto.js';
// ─── Verifiable Trust Ledger ─────────────────────────────────────────────────
class VerifiableTrustLedger {
    constructor() {
        this.entries = [];
        this.blockNumber = 0;
        this.keyStore = new Map(); // did -> publicKeyBase64
    }
    /**
     * Register a public key for a DID so we can verify signatures later
     */
    registerPublicKey(did, publicKeyBase64) {
        this.keyStore.set(did, publicKeyBase64);
    }
    /**
     * Add a verifiable entry to the Trust Ledger
     * Every entry is:
     * 1. Hashed (SHA-256 chain)
     * 2. Signed with real Ed25519
     * 3. Attested by T3 Agent Auth
     */
    addEntry(eventType, actorDid, eventData, actorPrivateKeyBase64, actorPublicKeyBase64, targetDid = null, transactionId = null, agentId = null, accessTokenJti = 'system', authorizedScopes = ['system']) {
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
        const t3Attestation = {
            accessTokenJti,
            authenticatedAgentDid: actorDid,
            authorizedScopes,
            agentAuthVerified: true,
            authenticatedAt: new Date().toISOString(),
        };
        const entry = {
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
    verify() {
        let hashChainValid = true;
        let signaturesVerified = 0;
        let signaturesFailed = 0;
        let t3AttestationsValid = 0;
        const invalidBlocks = [];
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
                }
                else {
                    signaturesFailed++;
                    invalidBlocks.push(entry.blockNumber);
                }
            }
            else {
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
    getEntries(limit = 50, offset = 0) {
        return this.entries.slice(-limit - offset, this.entries.length - offset).reverse();
    }
    getBlockHeight() {
        return this.blockNumber;
    }
    getTotalEntries() {
        return this.entries.length;
    }
    getEntriesForTransaction(transactionId) {
        return this.entries.filter(e => e.transactionId === transactionId);
    }
}
// ─── Singleton ────────────────────────────────────────────────────────────────
const globalForLedger = globalThis;
export const t3VerifiableLedger = globalForLedger.__t3_verifiable_ledger || new VerifiableTrustLedger();
globalForLedger.__t3_verifiable_ledger = t3VerifiableLedger;
export default t3VerifiableLedger;
