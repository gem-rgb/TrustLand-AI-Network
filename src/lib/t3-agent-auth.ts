// TrustLand AI Network - Terminal 3 Agent Auth Server
// Implements the Agent Auth Protocol as defined by Terminal 3
// Provides: discovery, token exchange, refresh, introspection, JWKS
// Each agent authenticates via @agent-auth/sdk against this server

import { SignJWT, jwtVerify, exportJWK, importJWK, type JWK, type KeyLike } from 'jose';
import { generateEd25519KeyPair, hashData, generateApiKey, type Ed25519KeyPair } from './t3-crypto';

// ─── Jose Key Conversion Helpers ──────────────────────────────────────────────
// jose v5+ requires CryptoKey/KeyObject/JWK for EdDSA — raw Uint8Array is rejected.
// These helpers convert tweetnacl Ed25519 key pairs to/from jose-compatible JWK.

/**
 * Convert a tweetnacl Ed25519 key pair to a JWK (JSON Web Key) for use with jose.
 * Ed25519 secret keys in tweetnacl are 64 bytes = 32-byte seed + 32-byte public key.
 * jose expects the JWK "d" field to contain just the 32-byte seed (per RFC 8037).
 */
function ed25519KeyPairToPrivateJWK(keyPair: Ed25519KeyPair, kid: string = 't3-server-key-1'): JWK {
  // tweetnacl secretKey is 64 bytes: first 32 = seed, last 32 = public key
  const seedBytes = keyPair.privateKey.slice(0, 32);
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    d: Buffer.from(seedBytes).toString('base64url'),
    x: keyPair.publicKeyBase64,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  };
}

function ed25519PublicKeyToJWK(publicKeyBase64: string, kid: string = 't3-server-key-1'): JWK {
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: publicKeyBase64,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface T3AgentRegistration {
  agentId: string;
  apiKey: string;
  name: string;
  agentType: string;
  did: string;
  scopes: string[];
  keyPair: Ed25519KeyPair;
  createdAt: string;
}

export interface T3AccessToken {
  sub: string;        // Agent DID
  agent_id: string;   // Agent UUID
  iss: string;        // T3 Agent Auth Server
  aud: string;        // TrustLand platform
  scope: string;      // Space-separated scopes
  iat: number;
  exp: number;
  jti: string;        // JWT ID for audit
  delegation?: {      // Optional delegation chain
    granter_did: string;
    permissions: string[];
    granted_at: number;
  };
}

export interface T3PermissionGrant {
  id: string;
  granterDid: string;
  granteeDid: string;
  agentId: string;
  permissions: string[];
  constraints: Record<string, unknown>;
  status: 'active' | 'revoked' | 'expired';
  issuedAt: string;
  expiresAt: string | null;
  signature: string;
}

export interface T3VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: string;
    name: string;
    organization?: string;
    role?: string;
    verified: boolean;
    verificationMethod: string;
  };
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
  };
}

// ─── T3 Agent Auth Server ────────────────────────────────────────────────────

class T3AgentAuthServer {
  private serverKeyPair: Ed25519KeyPair;
  /** Jose-compatible private key (KeyObject) for signing JWTs */
  private serverPrivateKey: KeyLike | Uint8Array;
  /** Jose-compatible public key (KeyObject) for verifying JWTs */
  private serverPublicKey: KeyLike | Uint8Array;
  /** The JWK form of the public key, returned by the JWKS endpoint */
  private serverPublicJWK: JWK;
  private registeredAgents: Map<string, T3AgentRegistration> = new Map();
  private apiKeys: Map<string, string> = new Map(); // apiKey -> agentId
  private refreshTokens: Map<string, { agentId: string; scope: string; exp: number }> = new Map();
  private permissionGrants: Map<string, T3PermissionGrant> = new Map();
  private verifiableCredentials: Map<string, T3VerifiableCredential> = new Map();

  constructor() {
    this.serverKeyPair = generateEd25519KeyPair();
    this.serverPublicJWK = ed25519PublicKeyToJWK(this.serverKeyPair.publicKeyBase64);
    // Convert raw tweetnacl key pair to jose-compatible KeyObjects.
    // We do this synchronously by caching the JWK; the actual importJWK call is async,
    // so we lazy-load the KeyObject on first use.
    this.serverPrivateKey = new Uint8Array(this.serverKeyPair.privateKey);
    this.serverPublicKey = new Uint8Array(this.serverKeyPair.publicKey);
  }

  /**
   * Lazily import the server private key as a jose KeyObject.
   * jose v5+ rejects raw Uint8Array for EdDSA — must be CryptoKey/KeyObject/JWK.
   */
  private async getSigningKey(): Promise<KeyLike> {
    const privateJWK = ed25519KeyPairToPrivateJWK(this.serverKeyPair);
    return await importJWK(privateJWK) as KeyLike;
  }

  /**
   * Lazily import the server public key as a jose KeyObject for verification.
   */
  private async getVerificationKey(): Promise<KeyLike> {
    return await importJWK(this.serverPublicJWK) as KeyLike;
  }

  // ─── Discovery Endpoint ──────────────────────────────────────────────────

  getDiscoveryDocument(issuer: string) {
    return {
      issuer,
      token_endpoint: `${issuer}/api/t3/token`,
      refresh_endpoint: `${issuer}/api/t3/token/refresh`,
      introspect_endpoint: `${issuer}/api/t3/token/introspect`,
      jwks_uri: `${issuer}/api/t3/.well-known/jwks.json`,
      audience: 'trustland-platform',
      grant_types_supported: ['api_key'],
      token_endpoint_auth_methods_supported: ['api_key'],
      response_types_supported: ['token'],
      scopes_supported: [
        'search:properties',
        'negotiate:offers',
        'verify:ownership',
        'survey:property',
        'value:assess',
        'legal:review',
        'finance:assess',
        'registry:verify',
        'sign:contracts',
        'delegate:authority',
        'autonomous:purchase',
      ],
    };
  }

  // ─── JWKS Endpoint ──────────────────────────────────────────────────────

  async getJWKS() {
    // Return the persistent server public key (not a fresh keypair)
    return {
      keys: [
        {
          ...this.serverPublicJWK,
          kid: 't3-server-key-1',
          use: 'sig',
          alg: 'EdDSA',
        },
      ],
    };
  }

  private async getPublicKeyJWK() {
    return this.serverPublicJWK;
  }

  // ─── Agent Registration ──────────────────────────────────────────────────

  registerAgent(
    agentId: string,
    name: string,
    agentType: string,
    did: string,
    scopes: string[],
    keyPair: Ed25519KeyPair
  ): T3AgentRegistration {
    const apiKey = generateApiKey();

    const registration: T3AgentRegistration = {
      agentId,
      apiKey,
      name,
      agentType,
      did,
      scopes,
      keyPair,
      createdAt: new Date().toISOString(),
    };

    this.registeredAgents.set(agentId, registration);
    this.apiKeys.set(apiKey, agentId);

    return registration;
  }

  // ─── Token Exchange (API Key -> JWT) ─────────────────────────────────────

  async exchangeApiKeyForToken(
    apiKey: string,
    requestedScopes: string[],
    issuer: string
  ): Promise<{ access_token: string; token_type: string; expires_in: number; scope: string; refresh_token: string } | null> {
    const agentId = this.apiKeys.get(apiKey);
    if (!agentId) return null;

    const agent = this.registeredAgents.get(agentId);
    if (!agent) return null;

    // Validate requested scopes against agent's allowed scopes
    const validScopes = requestedScopes.filter(s => agent.scopes.includes(s));
    if (validScopes.length === 0) return null;

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600; // 1 hour

    // Create JWT access token signed with the server's Ed25519 key (jose KeyObject)
    const signingKey = await this.getSigningKey();
    const accessToken = await new SignJWT({
      sub: agent.did,
      agent_id: agent.agentId,
      iss: issuer,
      aud: 'trustland-platform',
      scope: validScopes.join(' '),
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 't3-server-key-1' })
      .sign(signingKey);

    // Create refresh token
    const refreshToken = `t3rt_${hashData(`${agentId}:${Date.now()}:${Math.random()}`)}`;
    this.refreshTokens.set(refreshToken, {
      agentId,
      scope: validScopes.join(' '),
      exp: now + 86400, // 24 hours
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: validScopes.join(' '),
      refresh_token: refreshToken,
    };
  }

  // ─── Token Refresh ────────────────────────────────────────────────────────

  async refreshToken(
    refreshToken: string,
    issuer: string
  ): Promise<{ access_token: string; token_type: string; expires_in: number; scope: string; refresh_token: string } | null> {
    const tokenData = this.refreshTokens.get(refreshToken);
    if (!tokenData) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now > tokenData.exp) {
      this.refreshTokens.delete(refreshToken);
      return null;
    }

    const agent = this.registeredAgents.get(tokenData.agentId);
    if (!agent) return null;

    const expiresIn = 3600;
    const scopes = tokenData.scope.split(' ');

    const signingKey = await this.getSigningKey();
    const accessToken = await new SignJWT({
      sub: agent.did,
      agent_id: agent.agentId,
      iss: issuer,
      aud: 'trustland-platform',
      scope: tokenData.scope,
      iat: now,
      exp: now + expiresIn,
      jti: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 't3-server-key-1' })
      .sign(signingKey);

    const newRefreshToken = `t3rt_${hashData(`${tokenData.agentId}:${Date.now()}:${Math.random()}`)}`;
    this.refreshTokens.delete(refreshToken);
    this.refreshTokens.set(newRefreshToken, {
      agentId: tokenData.agentId,
      scope: tokenData.scope,
      exp: now + 86400,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: tokenData.scope,
      refresh_token: newRefreshToken,
    };
  }

  // ─── Token Introspection ──────────────────────────────────────────────────

  async introspectToken(token: string): Promise<{ active: boolean; sub?: string; agent_id?: string; scope?: string; exp?: number }> {
    try {
      // Verify the JWT signature using the server's public key (jose KeyObject)
      const verificationKey = await this.getVerificationKey();
      const { payload } = await jwtVerify(token, verificationKey, {
        audience: 'trustland-platform',
      });

      return {
        active: true,
        sub: payload.sub as string,
        agent_id: payload.agent_id as string,
        scope: payload.scope as string,
        exp: payload.exp,
      };
    } catch {
      return { active: false };
    }
  }

  // ─── Permission Grants (Delegation) ──────────────────────────────────────

  createPermissionGrant(
    granterDid: string,
    granteeDid: string,
    agentId: string,
    permissions: string[],
    signature: string
  ): T3PermissionGrant {
    const grant: T3PermissionGrant = {
      id: crypto.randomUUID(),
      granterDid,
      granteeDid,
      agentId,
      permissions,
      constraints: { maxTransactionValue: 100000, properties: [] },
      status: 'active',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      signature,
    };

    this.permissionGrants.set(grant.id, grant);
    return grant;
  }

  getPermissionGrants(agentId: string): T3PermissionGrant[] {
    return Array.from(this.permissionGrants.values())
      .filter(g => g.agentId === agentId && g.status === 'active');
  }

  revokePermissionGrant(grantId: string): boolean {
    const grant = this.permissionGrants.get(grantId);
    if (!grant) return false;
    grant.status = 'revoked';
    return true;
  }

  // ─── Verifiable Credentials ───────────────────────────────────────────────

  issueVerifiableCredential(
    subjectDid: string,
    subjectName: string,
    subjectRole: string,
    subjectOrg: string | undefined,
    credentialType: string,
    issuerDid: string,
    proofValue: string
  ): T3VerifiableCredential {
    const vc: T3VerifiableCredential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://www.terminal3.io/credentials/v1',
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiableCredential', `${credentialType}Credential`],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: subjectDid,
        type: credentialType,
        name: subjectName,
        organization: subjectOrg,
        role: subjectRole,
        verified: true,
        verificationMethod: `${issuerDid}#key-1`,
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${issuerDid}#key-1`,
        proofPurpose: 'assertionMethod',
        proofValue,
      },
    };

    this.verifiableCredentials.set(vc.id, vc);
    return vc;
  }

  getVerifiableCredentials(subjectDid: string): T3VerifiableCredential[] {
    return Array.from(this.verifiableCredentials.values())
      .filter(vc => vc.credentialSubject.id === subjectDid);
  }

  // ─── Agent-to-Agent Authentication ────────────────────────────────────────

  /**
   * Verify that an agent is authenticated and has the required scope
   * This is the core of agent-to-agent trust
   */
  async verifyAgentAuth(
    accessToken: string,
    requiredScope: string
  ): Promise<{ authenticated: boolean; agentDid?: string; agentId?: string; scopes?: string[] }> {
    const introspection = await this.introspectToken(accessToken);
    if (!introspection.active) return { authenticated: false };

    const scopes = (introspection.scope || '').split(' ');
    if (!scopes.includes(requiredScope)) return { authenticated: false };

    return {
      authenticated: true,
      agentDid: introspection.sub,
      agentId: introspection.agent_id,
      scopes,
    };
  }

  // ─── Get All Registered Agents ───────────────────────────────────────────

  getRegisteredAgents(): T3AgentRegistration[] {
    return Array.from(this.registeredAgents.values());
  }

  getAgentByDid(did: string): T3AgentRegistration | undefined {
    return Array.from(this.registeredAgents.values()).find(a => a.did === did);
  }

  getAgentById(agentId: string): T3AgentRegistration | undefined {
    return this.registeredAgents.get(agentId);
  }

  getAllPermissionGrants(): T3PermissionGrant[] {
    return Array.from(this.permissionGrants.values());
  }

  getAllVerifiableCredentials(): T3VerifiableCredential[] {
    return Array.from(this.verifiableCredentials.values());
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

// Use globalThis to persist across HMR reloads
const globalForT3 = globalThis as unknown as { __t3_agent_auth_server: T3AgentAuthServer | undefined };
export const t3AgentAuthServer = globalForT3.__t3_agent_auth_server || new T3AgentAuthServer();
globalForT3.__t3_agent_auth_server = t3AgentAuthServer;

export default t3AgentAuthServer;
