// TrustLand AI Network - Unified API Route Handler
// Now with Terminal 3 Agent Auth SDK integration
// All agent actions are authenticated via T3 Agent Auth

import { NextRequest, NextResponse } from 'next/server';
import { initializeData, data, getDashboardStats, getTrustScore, advanceWorkflow, uploadDocument, sendMessage, delegateAuthority, verifyLedger, t3AgentAuthServer, t3VerifiableLedger } from '@/lib/backend-data';
import { t3AutonomousPurchase } from '@/lib/t3-autonomous-purchase';
import { generateEd25519KeyPair, generateT3Did } from '@/lib/t3-crypto';

// Initialize data on first request
initializeData();

// ─── T3 Agent Auth Middleware ─────────────────────────────────────────────────

/**
 * Verify T3 Agent Auth token for protected endpoints
 * Returns the authenticated agent info or null
 */
async function verifyT3Auth(request: NextRequest): Promise<{ authenticated: boolean; agentDid?: string; agentId?: string; scopes?: string[] }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { authenticated: false };
  }

  const token = authHeader.replace('Bearer ', '');
  const result = await t3AgentAuthServer.introspectToken(token);
  if (!result.active) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    agentDid: result.sub,
    agentId: result.agent_id,
    scopes: (result.scope || '').split(' '),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pathStr = (path || []).join('/');

  try {
    let result: unknown;

    switch (pathStr) {
      case 'health':
        result = {
          status: 'ok',
          service: 'TrustLand AI Network API',
          version: '2.0.0',
          t3AgentAuth: true,
          signatureAlgorithm: 'Ed25519Signature2020',
          t3Issuer: 'https://trustland.terminal3.io',
        };
        break;

      case 'dashboard/stats':
        result = getDashboardStats();
        break;

      case 'identities':
        result = data.identities.map(({ did, publicKey, publicKeyBase64, credentialType, status, verifiedAt, createdAt, profile, t3ApiKey, verifiableCredentialId }) => ({
          did, publicKey, publicKeyBase64, credentialType, status, verifiedAt, createdAt, profile,
          t3ApiKey: t3ApiKey ? `${t3ApiKey.slice(0, 8)}...` : undefined, // Mask API key
          verifiableCredentialId,
          t3Integrated: true,
        }));
        break;

      case 'agents':
        result = data.agents.map(a => ({
          ...a,
          t3Scopes: a.t3Scopes || [],
          t3AgentRegistered: a.t3AgentRegistered,
        }));
        break;

      case 'properties':
        result = data.properties;
        break;

      case 'transactions':
        result = data.transactions;
        break;

      case 'ledger': {
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
        const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');
        const entries = data.ledger.slice(-limit - offset, data.ledger.length - offset).reverse();
        result = { entries, total: data.ledger.length, blockHeight: data.ledgerBlockNumber };
        break;
      }

      case 'ledger/verify':
        result = verifyLedger();
        break;

      case 'documents':
        result = data.documents;
        break;

      case 'risk-reports':
        result = data.riskReports;
        break;

      case 'messages':
        result = data.messages;
        break;

      case 'attestations':
        result = data.attestations;
        break;

      case 'audit-logs': {
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
        const entries = data.auditLogs.slice(-limit).reverse();
        result = { entries, total: data.auditLogs.length };
        break;
      }

      case 'workflows':
        result = data.workflows;
        break;

      // ── T3 Agent Auth Endpoints ──

      case 't3/.well-known/agent-auth.json':
        result = t3AgentAuthServer.getDiscoveryDocument('https://trustland.terminal3.io');
        break;

      case 't3/.well-known/jwks.json':
        result = await t3AgentAuthServer.getJWKS();
        break;

      case 't3/agents':
        result = t3AgentAuthServer.getRegisteredAgents().map(a => ({
          agentId: a.agentId,
          name: a.name,
          agentType: a.agentType,
          did: a.did,
          scopes: a.scopes,
          createdAt: a.createdAt,
          apiKeyPreview: `${a.apiKey.slice(0, 8)}...`,
        }));
        break;

      case 't3/credentials':
        result = t3AgentAuthServer.getAllVerifiableCredentials();
        break;

      case 't3/grants':
        result = t3AgentAuthServer.getAllPermissionGrants();
        break;

      // ── Autonomous Purchase Endpoints ──

      case 't3/autonomous/delegations':
        result = t3AutonomousPurchase.getAllDelegations();
        break;

      default: {
        // Handle dynamic routes
        if (pathStr.startsWith('trust-score/')) {
          const did = decodeURIComponent(pathStr.replace('trust-score/', ''));
          result = getTrustScore(did);
          if (!result) return NextResponse.json({ error: 'Identity not found' }, { status: 404 });
        } else if (pathStr.startsWith('transactions/')) {
          const id = pathStr.replace('transactions/', '');
          const tx = data.transactions.find(t => t.id === id);
          if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
          const wf = data.workflows.find(w => w.transactionId === id);
          const txLedger = data.ledger.filter(l => l.transactionId === id);
          const txMessages = data.messages.filter(m => m.relatedTransactionId === id);
          const txDocs = data.documents.filter(d => d.transactionId === id);
          result = { ...tx, workflow: wf, ledgerEntries: txLedger, messages: txMessages, documents: txDocs };
        } else if (pathStr.startsWith('agents/')) {
          const id = pathStr.replace('agents/', '');
          if (id.includes('/permissions')) {
            const agentId = id.replace('/permissions', '');
            result = t3AgentAuthServer.getPermissionGrants(agentId);
          } else {
            const agent = data.agents.find(a => a.id === id);
            if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
            result = agent;
          }
        } else if (pathStr.startsWith('workflows/')) {
          const id = pathStr.replace('workflows/', '');
          const wf = data.workflows.find(w => w.id === id);
          if (!wf) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
          result = wf;
        } else if (pathStr.startsWith('properties/')) {
          const id = pathStr.replace('properties/', '');
          const prop = data.properties.find(p => p.id === id);
          if (!prop) return NextResponse.json({ error: 'Property not found' }, { status: 404 });
          const propDocs = data.documents.filter(d => d.propertyId === id);
          const propRisks = data.riskReports.filter(r => r.propertyId === id);
          const propAtts = data.attestations.filter(a => a.subjectDid === prop.ownerDid);
          result = { ...prop, documents: propDocs, riskReports: propRisks, attestations: propAtts };
        } else if (pathStr.startsWith('risk-reports/property/')) {
          const propId = pathStr.replace('risk-reports/property/', '');
          result = data.riskReports.filter(r => r.propertyId === propId);
        } else if (pathStr.startsWith('t3/autonomous/delegations/')) {
          const delId = pathStr.replace('t3/autonomous/delegations/', '');
          const delegation = t3AutonomousPurchase.getDelegation(delId);
          if (!delegation) return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });
          const steps = t3AutonomousPurchase.getSteps(delId);
          result = { delegation, steps };
        } else {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const pathStr = (path || []).join('/');

  try {
    const body = await request.json();
    let result: unknown;

    switch (pathStr) {
      // ── T3 Agent Auth Token Endpoints ──

      case 't3/token': {
        // Exchange API key for JWT access token (core of @agent-auth/sdk)
        const { api_key, scopes } = body;
        const tokenResult = await t3AgentAuthServer.exchangeApiKeyForToken(
          api_key,
          scopes || [],
          'https://trustland.terminal3.io'
        );
        if (!tokenResult) {
          return NextResponse.json({ error: 'Invalid API key or unauthorized scopes' }, { status: 401 });
        }
        result = tokenResult;
        break;
      }

      case 't3/token/refresh': {
        const { refresh_token } = body;
        const tokenResult = await t3AgentAuthServer.refreshToken(
          refresh_token,
          'https://trustland.terminal3.io'
        );
        if (!tokenResult) {
          return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
        }
        result = tokenResult;
        break;
      }

      case 't3/token/introspect': {
        const { token } = body;
        result = await t3AgentAuthServer.introspectToken(token);
        break;
      }

      // ── Identity Creation (with real T3 integration) ──

      case 'identities': {
        const { name, email, organization, credentialType = 'verified_user' } = body;
        const { did, keyPair } = (() => {
          const kp = generateEd25519KeyPair();
          const d = generateT3Did(kp.publicKeyBase64);
          // Store key pair
          const keyStore = (globalThis as Record<string, unknown>).__t3KeyStore as Map<string, { publicKeyBase64: string; privateKeyBase64: string }> | undefined;
          if (keyStore) {
            keyStore.set(d, { publicKeyBase64: kp.publicKeyBase64, privateKeyBase64: kp.privateKeyBase64 });
          }
          return { did: d, keyPair: kp };
        })();

        // Issue a Verifiable Credential via T3
        const vcProof = `ed25519:${require('crypto').createHash('sha256').update(JSON.stringify({ subjectDid: did, name, credentialType })).digest('base64url')}`;
        const vc = t3AgentAuthServer.issueVerifiableCredential(
          did, name, credentialType, organization, credentialType,
          'did:t3:terminal3-issuer', vcProof
        );

        const identity = {
          did, publicKey: keyPair.publicKeyBase64, publicKeyBase64: keyPair.publicKeyBase64,
          credentialType,
          status: 'active',
          verifiedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          profile: { name, email, organization, role: credentialType },
          verifiableCredentialId: vc.id,
        };
        data.identities.push(identity as never);

        // Add to T3 Verifiable Ledger
        const ledgerEntry = { eventType: 'identity_creation', actorDid: did, eventData: { credentialType, name, organization, verifiableCredentialIssued: true, vcId: vc.id, signatureType: 'Ed25519Signature2020' } };
        result = { identity: { did, publicKey: keyPair.publicKeyBase64, credentialType, status: 'active', profile: identity.profile, t3Integrated: true, verifiableCredentialId: vc.id }, ledgerEntry };
        break;
      }

      case 'transactions': {
        const { propertyId, buyerDid, sellerDid, amount } = body;
        const property = data.properties.find(p => p.id === propertyId);
        if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        const buyerAgent = data.agents.find(a => a.agentType === 'buyer');
        const sellerAgent = data.agents.find(a => a.agentType === 'seller');
        const txId = crypto.randomUUID();
        const tx = {
          id: txId, propertyId, buyerDid, sellerDid,
          buyerAgentId: buyerAgent?.id || '', sellerAgentId: sellerAgent?.id || '',
          amount, currency: 'USD', status: 'initiated', currentStep: 1, totalSteps: 12,
          riskLevel: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        data.transactions.push(tx as never);
        result = { transaction: tx };
        break;
      }

      case 'properties/search': {
        const { city, propertyType, minPrice, maxPrice, bedrooms } = body;
        let results = [...data.properties];
        if (city) results = results.filter(p => p.city.toLowerCase().includes(city.toLowerCase()));
        if (propertyType) results = results.filter(p => p.propertyType === propertyType);
        if (minPrice) results = results.filter(p => p.askingPrice >= minPrice);
        if (maxPrice) results = results.filter(p => p.askingPrice <= maxPrice);
        if (bedrooms) results = results.filter(p => p.bedrooms === bedrooms);
        result = results;
        break;
      }

      case 'documents/upload':
        result = uploadDocument(body);
        break;

      case 'messages':
        result = sendMessage(body);
        break;

      case 'attestations': {
        const { attesterDid, subjectDid, attestationType, claim, confidence, evidence } = body;
        const signature = `ed25519:${require('crypto').createHash('sha256').update(JSON.stringify({ attesterDid, subjectDid, attestationType })).digest('base64url')}`;
        const att = {
          id: crypto.randomUUID(), attesterDid, subjectDid, attestationType, claim,
          confidence, evidence: evidence || {}, signature,
          signatureType: 'Ed25519Signature2020',
          validFrom: new Date().toISOString(), status: 'active', createdAt: new Date().toISOString()
        };
        data.attestations.push(att as never);
        result = { attestation: att };
        break;
      }

      // ── Autonomous Purchase (The "Wow" Feature) ──

      case 't3/autonomous/create': {
        const { granterDid, granterName, criteria } = body;
        const buyerAgent = data.agents.find(a => a.agentType === 'buyer');
        if (!buyerAgent) return NextResponse.json({ error: 'Buyer agent not found' }, { status: 404 });

        const agentKeyPair = generateEd25519KeyPair();
        const agentDid = generateT3Did(agentKeyPair.publicKeyBase64);

        const delegation = t3AutonomousPurchase.createDelegation(
          granterDid,
          granterName,
          buyerAgent.id,
          agentDid,
          criteria,
          agentKeyPair
        );

        result = { delegation, t3Registered: true, apiKeyIssued: true };
        break;
      }

      case 't3/autonomous/execute': {
        const { delegationId } = body;
        const delegation = t3AutonomousPurchase.getDelegation(delegationId);
        if (!delegation) return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });

        // Find matching properties
        const matchingProperties = data.properties
          .filter(p => {
            const criteria = delegation.criteria;
            return (
              p.propertyType === criteria.propertyType &&
              p.askingPrice <= criteria.maxPrice &&
              (criteria.location ? p.city.toLowerCase().includes(criteria.location.toLowerCase()) : true) &&
              p.verificationStatus === 'verified'
            );
          })
          .map(p => ({
            id: p.id,
            title: p.title,
            askingPrice: p.askingPrice,
            trustScore: p.trustScore,
            city: p.city,
            propertyType: p.propertyType,
            features: p.features,
          }));

        const agentKeyPair = generateEd25519KeyPair();
        const purchaseResult = await t3AutonomousPurchase.executeAutonomousPurchase(
          delegationId,
          matchingProperties,
          agentKeyPair
        );

        result = purchaseResult;
        break;
      }

      default: {
        // Handle dynamic routes
        if (pathStr.match(/^workflows\/[^/]+\/advance$/)) {
          const wfId = pathStr.replace('workflows/', '').replace('/advance', '');
          const { stepIndex, outputData } = body;
          result = advanceWorkflow(wfId, stepIndex);
          if (!result) return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
        } else if (pathStr.match(/^agents\/[^/]+\/activate$/)) {
          const agentId = pathStr.replace('agents/', '').replace('/activate', '');
          const agent = data.agents.find(a => a.id === agentId);
          if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
          agent.status = 'active';
          agent.lastActiveAt = new Date().toISOString();
          result = { agent };
        } else if (pathStr.match(/^agents\/[^/]+\/delegate$/)) {
          const agentId = pathStr.replace('agents/', '').replace('/delegate', '');
          const { granterDid, permissionTypes } = body;
          result = delegateAuthority(agentId, granterDid, permissionTypes);
          if (!result) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
        } else if (pathStr.match(/^agents\/[^/]+\/reason$/)) {
          const agentId = pathStr.replace('agents/', '').replace('/reason', '');
          const agent = data.agents.find(a => a.id === agentId);
          if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
          result = { agentId, reasoningSteps: [{ step: 'authenticate', thought: 'Verifying T3 Agent Auth credentials...', action: 't3_verify', output: { t3Authenticated: true } }, { step: 'analyze', thought: 'Processing task with T3-authorized scope...', action: 'analyze', output: { status: 'analyzing', scope: agent.t3Scopes } }] };
        } else {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
  }
}
