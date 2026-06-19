// TrustLand AI Network - Backend API Service (Legacy/Standalone)
// NOTE: The primary Terminal 3 Agent Auth SDK integration is in the Next.js app
// (src/lib/t3-*.ts, src/lib/backend-data.ts, src/app/api/[[...path]]/route.ts)
// This standalone service uses simulated crypto for demonstration purposes only.
// For the real Ed25519 + JWT + @agent-auth/sdk integration, see the Next.js backend.
//
// Terminal 3 Agent Auth SDK + Agent Orchestration + Trust Ledger

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { createHash, createSign, createVerify, randomBytes } from 'crypto';

const app = express();
const server = createServer(app);
const PORT = 3030;

// ─── Socket.IO Setup ────────────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ─── In-Memory Data Stores ──────────────────────────────────────────────────

interface T3Identity {
  did: string;
  publicKey: string;
  privateKey: string; // Only in demo - never in production
  credentialType: string;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
  profile: { name: string; email: string; organization?: string; role?: string };
}

interface Agent {
  id: string;
  identityDid: string;
  agentType: string;
  name: string;
  description: string;
  capabilities: string[];
  status: string;
  trustScore: number;
  config: Record<string, unknown>;
  lastActiveAt: string | null;
  createdAt: string;
}

interface VerifiableCredential {
  id: string;
  issuerDid: string;
  subjectDid: string;
  credentialType: string;
  credentialData: Record<string, unknown>;
  proof: string;
  proofType: string;
  validFrom: string;
  validUntil: string | null;
  status: string;
  createdAt: string;
}

interface PermissionGrant {
  id: string;
  granterDid: string;
  granteeDid: string;
  agentId: string;
  permissionType: string;
  scope: Record<string, unknown>;
  constraints: Record<string, unknown>;
  delegatedAt: string;
  expiresAt: string | null;
  status: string;
  signature: string;
}

interface TrustLedgerEntry {
  id: string;
  eventType: string;
  eventHash: string;
  previousHash: string | null;
  actorDid: string;
  targetDid: string | null;
  transactionId: string | null;
  agentId: string | null;
  eventData: Record<string, unknown>;
  signature: string;
  blockNumber: number;
  timestamp: string;
}

interface Property {
  id: string;
  title: string;
  address: string;
  city: string;
  region: string;
  country: string;
  propertyType: string;
  area: number;
  bedrooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  askingPrice: number;
  currency: string;
  description: string;
  features: string[];
  ownerDid: string;
  titleDeedRef: string;
  registryRef: string;
  verificationStatus: string;
  trustScore: number;
  status: string;
  lat: number;
  lng: number;
  createdAt: string;
}

interface Transaction {
  id: string;
  propertyId: string;
  buyerDid: string;
  sellerDid: string;
  buyerAgentId: string;
  sellerAgentId: string;
  amount: number;
  currency: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  riskLevel: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStep {
  id: string;
  workflowId: string;
  agentId: string | null;
  stepType: string;
  stepOrder: number;
  stepName: string;
  description: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  signature: string | null;
  outputData: Record<string, unknown> | null;
}

interface Workflow {
  id: string;
  transactionId: string;
  workflowType: string;
  definition: Record<string, unknown>;
  currentState: string;
  context: Record<string, unknown>;
  status: string;
  steps: WorkflowStep[];
  startedAt: string;
  completedAt: string | null;
}

interface Document {
  id: string;
  propertyId: string;
  transactionId: string | null;
  uploaderDid: string;
  documentType: string;
  fileName: string;
  fileHash: string;
  extractedData: Record<string, unknown> | null;
  verificationStatus: string;
  anomalies: string[];
  ocrConfidence: number | null;
  uploadedAt: string;
}

interface RiskReport {
  id: string;
  propertyId: string;
  transactionId: string | null;
  generatedBy: string;
  reportType: string;
  riskScore: number;
  riskLevel: string;
  findings: Array<{ severity: string; category: string; description: string; recommendation: string }>;
  recommendations: string[];
  dataSources: string[];
  generatedAt: string;
}

interface AgentMessage {
  id: string;
  senderDid: string;
  receiverDid: string;
  messageType: string;
  subject: string;
  content: Record<string, unknown>;
  relatedTransactionId: string | null;
  priority: string;
  signature: string;
  createdAt: string;
}

interface TrustAttestation {
  id: string;
  attesterDid: string;
  subjectDid: string;
  attestationType: string;
  claim: Record<string, unknown>;
  confidence: number;
  evidence: Record<string, unknown>;
  signature: string;
  validFrom: string;
  status: string;
  createdAt: string;
}

interface AuditLogEntry {
  id: string;
  identityId: string;
  action: string;
  actorDid: string;
  target: string | null;
  details: Record<string, unknown>;
  riskLevel: string;
  timestamp: string;
}

// ─── Data Stores ────────────────────────────────────────────────────────────
const identities: Map<string, T3Identity> = new Map();
const agents: Map<string, Agent> = new Map();
const credentials: Map<string, VerifiableCredential> = new Map();
const permissions: Map<string, PermissionGrant> = new Map();
const trustLedger: TrustLedgerEntry[] = [];
const properties: Map<string, Property> = new Map();
const transactions: Map<string, Transaction> = new Map();
const workflows: Map<string, Workflow> = new Map();
const documents: Map<string, Document> = new Map();
const riskReports: Map<string, RiskReport> = new Map();
const agentMessages: AgentMessage[] = [];
const attestations: Map<string, TrustAttestation> = new Map();
const auditLogs: AuditLogEntry[] = [];

let ledgerBlockNumber = 0;

// ─── Cryptographic Helpers ──────────────────────────────────────────────────

function generateDid(): string {
  return `did:t3:${randomBytes(16).toString('hex')}`;
}

function generateKeyPair(): { publicKey: string; privateKey: string } {
  // Simulated key pair for demo - in production use proper Ed25519
  const publicKey = `pk_${randomBytes(32).toString('hex')}`;
  const privateKey = `sk_${randomBytes(32).toString('hex')}`;
  return { publicKey, privateKey };
}

function signData(data: string, _privateKey: string): string {
  // Simulated signature for demo - in production use proper Ed25519 signing
  return `sig_${createHash('sha256').update(data + _privateKey).digest('hex')}`;
}

function verifySignature(data: string, signature: string, _publicKey: string): boolean {
  // Simulated verification - in production use proper Ed25519 verification
  return signature.startsWith('sig_');
}

function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function addToLedger(
  eventType: string,
  actorDid: string,
  eventData: Record<string, unknown>,
  targetDid: string | null = null,
  transactionId: string | null = null,
  agentId: string | null = null
): TrustLedgerEntry {
  const identity = Array.from(identities.values()).find(i => i.did === actorDid);
  const identityId = identity ? Array.from(identities.keys())[Array.from(identities.values()).indexOf(identity)] : 'unknown';

  const previousHash = trustLedger.length > 0 ? trustLedger[trustLedger.length - 1].eventHash : null;
  const dataToHash = JSON.stringify({ eventType, actorDid, targetDid, transactionId, agentId, eventData, previousHash, blockNumber: ledgerBlockNumber + 1 });
  const eventHash = hashData(dataToHash);
  const signature = signData(eventHash, identity?.privateKey || 'demo');

  const entry: TrustLedgerEntry = {
    id: uuidv4(),
    eventType,
    eventHash,
    previousHash,
    actorDid,
    targetDid,
    transactionId,
    agentId,
    eventData,
    signature,
    blockNumber: ++ledgerBlockNumber,
    timestamp: new Date().toISOString()
  };

  trustLedger.push(entry);

  // Add audit log
  auditLogs.push({
    id: uuidv4(),
    identityId,
    action: eventType,
    actorDid,
    target: targetDid,
    details: eventData,
    riskLevel: 'low',
    timestamp: new Date().toISOString()
  });

  // Emit real-time update
  io.emit('ledger_update', entry);
  io.emit('audit_update', auditLogs[auditLogs.length - 1]);

  return entry;
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

function seedData() {
  // Create institutional identities
  const institutions = [
    { name: 'National Land Registry', email: 'registry@trustland.gov', role: 'government', credentialType: 'government', org: 'Government Land Agency' },
    { name: 'First National Bank', email: 'loans@firstnational.com', role: 'financier', credentialType: 'institution', org: 'First National Bank' },
    { name: 'Chambers & Associates', email: 'legal@chambers.law', role: 'lawyer', credentialType: 'agent', org: 'Chambers & Associates LLP' },
    { name: 'Precision Surveys Inc.', email: 'surveys@precision.com', role: 'surveyor', credentialType: 'agent', org: 'Precision Surveys Inc.' },
    { name: 'Apex Valuations', email: 'val@apex.com', role: 'valuer', credentialType: 'agent', org: 'Apex Valuations Group' },
    { name: 'Alice Chen', email: 'alice@example.com', role: 'buyer', credentialType: 'verified_user', org: undefined },
    { name: 'Bob Martinez', email: 'bob@example.com', role: 'seller', credentialType: 'verified_user', org: undefined },
  ];

  institutions.forEach(inst => {
    const { publicKey, privateKey } = generateKeyPair();
    const did = generateDid();
    const id = uuidv4();
    identities.set(id, {
      did,
      publicKey,
      privateKey,
      credentialType: inst.credentialType,
      status: 'active',
      verifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      profile: { name: inst.name, email: inst.email, organization: inst.org, role: inst.role }
    });

    addToLedger('identity_creation', did, {
      credentialType: inst.credentialType,
      name: inst.name,
      organization: inst.org
    });
  });

  // Create agents
  const allIdentities = Array.from(identities.values());
  const agentDefinitions = [
    { type: 'buyer', name: 'Buyer Agent Alpha', desc: 'Autonomous property search and negotiation agent', capabilities: ['search_properties', 'negotiate_price', 'submit_offer', 'coordinate_financing'], trustScore: 87.5 },
    { type: 'seller', name: 'Seller Agent Beta', desc: 'Property listing and offer management agent', capabilities: ['list_property', 'verify_ownership', 'manage_offers', 'coordinate_sale'], trustScore: 92.3 },
    { type: 'surveyor', name: 'Survey Agent Gamma', desc: 'Property inspection and survey verification agent', capabilities: ['inspect_property', 'verify_boundaries', 'assess_condition', 'generate_report'], trustScore: 95.1 },
    { type: 'lawyer', name: 'Legal Agent Delta', desc: 'Legal compliance and contract validation agent', capabilities: ['validate_contracts', 'check_encumbrances', 'verify_compliance', 'draft_agreements'], trustScore: 96.8 },
    { type: 'valuer', name: 'Valuation Agent Epsilon', desc: 'Market analysis and property valuation agent', capabilities: ['market_analysis', 'compare_comps', 'assess_value', 'generate_valuation'], trustScore: 91.7 },
    { type: 'financing', name: 'Financing Agent Zeta', desc: 'Mortgage and financing assessment agent', capabilities: ['assess_affordability', 'check_credit', 'calculate_mortgage', 'approve_financing'], trustScore: 89.4 },
    { type: 'registry', name: 'Registry Agent Eta', desc: 'Government land registry verification agent', capabilities: ['verify_title', 'check_encumbrances', 'validate_ownership', 'register_transfer'], trustScore: 99.2 },
    { type: 'verification', name: 'Verification Agent Theta', desc: 'Multi-source verification and due diligence agent', capabilities: ['verify_identity', 'cross_reference', 'detect_fraud', 'generate_risk_report'], trustScore: 97.6 },
  ];

  agentDefinitions.forEach((def, i) => {
    const id = uuidv4();
    const identity = allIdentities[i] || allIdentities[0];
    agents.set(id, {
      id,
      identityDid: identity.did,
      agentType: def.type,
      name: def.name,
      description: def.desc,
      capabilities: def.capabilities,
      status: 'idle',
      trustScore: def.trustScore,
      config: {},
      lastActiveAt: null,
      createdAt: new Date().toISOString()
    });

    addToLedger('agent_registration', identity.did, {
      agentId: id,
      agentType: def.type,
      agentName: def.name,
      capabilities: def.capabilities
    });
  });

  // Create properties
  const sellerIdentity = allIdentities.find(i => i.profile.role === 'seller') || allIdentities[0];
  const propertyDefinitions = [
    { title: 'Sunset Villa', address: '123 Ocean Drive', city: 'Miami', region: 'FL', propertyType: 'residential', area: 3200, bedrooms: 4, bathrooms: 3, yearBuilt: 2019, askingPrice: 1250000, description: 'Stunning waterfront villa with panoramic ocean views', features: ['Ocean View', 'Pool', 'Smart Home', '3-Car Garage'], lat: 25.7617, lng: -80.1918, trustScore: 88.5, titleDeedRef: 'TD-2024-FL-001247', registryRef: 'REG-MIA-2019-45892' },
    { title: 'Metro Tower Office Suite', address: '456 Business Blvd', city: 'New York', region: 'NY', propertyType: 'commercial', area: 5500, bedrooms: null, bathrooms: null, yearBuilt: 2021, askingPrice: 2800000, description: 'Premium Class A office space in downtown Manhattan', features: ['City Views', 'Conference Rooms', '24/7 Security', 'Parking'], lat: 40.7128, lng: -74.006, trustScore: 94.2, titleDeedRef: 'TD-2023-NY-008934', registryRef: 'REG-NYC-2021-78234' },
    { title: 'Green Meadow Farm', address: '789 Rural Road', city: 'Austin', region: 'TX', propertyType: 'agricultural', area: 45000, bedrooms: 5, bathrooms: 2, yearBuilt: 2005, askingPrice: 890000, description: 'Working farm with modern facilities and irrigation system', features: ['Irrigation', 'Barn', 'Livestock Area', 'Solar Panels'], lat: 30.2672, lng: -97.7431, trustScore: 82.1, titleDeedRef: 'TD-2022-TX-005612', registryRef: 'REG-AUS-2005-32145' },
    { title: 'Harbor Loft', address: '321 Pier Street', city: 'San Francisco', region: 'CA', propertyType: 'residential', area: 1800, bedrooms: 2, bathrooms: 2, yearBuilt: 2018, askingPrice: 975000, description: 'Modern loft with bay bridge views in the heart of the city', features: ['Bay Views', 'Rooftop Access', 'Gym', 'Concierge'], lat: 37.7749, lng: -122.4194, trustScore: 91.8, titleDeedRef: 'TD-2024-CA-003456', registryRef: 'REG-SFO-2018-56789' },
    { title: 'Industrial Warehouse Complex', address: '567 Logistics Lane', city: 'Chicago', region: 'IL', propertyType: 'industrial', area: 25000, bedrooms: null, bathrooms: null, yearBuilt: 2015, askingPrice: 1500000, description: 'State-of-the-art warehouse with cold storage and loading docks', features: ['Cold Storage', 'Loading Docks', 'Security System', 'Rail Access'], lat: 41.8781, lng: -87.6298, trustScore: 86.3, titleDeedRef: 'TD-2021-IL-002789', registryRef: 'REG-CHI-2015-43216' },
    { title: 'Maple Heights Residence', address: '890 Maple Ave', city: 'Seattle', region: 'WA', propertyType: 'residential', area: 2400, bedrooms: 3, bathrooms: 2.5, yearBuilt: 2020, askingPrice: 685000, description: 'Contemporary home in quiet neighborhood near top schools', features: ['Garden', 'Home Office', 'EV Charger', 'Smart Thermostat'], lat: 47.6062, lng: -122.3321, trustScore: 93.7, titleDeedRef: 'TD-2023-WA-006543', registryRef: 'REG-SEA-2020-65432' },
  ];

  propertyDefinitions.forEach(def => {
    const id = uuidv4();
    properties.set(id, {
      id,
      ...def,
      country: 'US',
      currency: 'USD',
      ownerDid: sellerIdentity.did,
      verificationStatus: 'verified',
      status: 'available',
      createdAt: new Date().toISOString()
    });

    addToLedger('property_registration', sellerIdentity.did, {
      propertyId: id,
      propertyTitle: def.title,
      address: def.address,
      askingPrice: def.askingPrice
    });
  });

  // Create a sample active transaction with workflow
  const buyerIdentity = allIdentities.find(i => i.profile.role === 'buyer') || allIdentities[1];
  const buyerAgent = Array.from(agents.values()).find(a => a.agentType === 'buyer')!;
  const sellerAgent = Array.from(agents.values()).find(a => a.agentType === 'seller')!;
  const firstProperty = Array.from(properties.values())[0];

  const txId = uuidv4();
  transactions.set(txId, {
    id: txId,
    propertyId: firstProperty.id,
    buyerDid: buyerIdentity.did,
    sellerDid: sellerIdentity.did,
    buyerAgentId: buyerAgent.id,
    sellerAgentId: sellerAgent.id,
    amount: firstProperty.askingPrice,
    currency: 'USD',
    status: 'due_diligence',
    currentStep: 4,
    totalSteps: 12,
    riskLevel: 'low',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Create workflow for this transaction
  const workflowSteps: WorkflowStep[] = [
    { id: uuidv4(), workflowId: '', agentId: buyerAgent.id, stepType: 'authenticate', stepOrder: 1, stepName: 'Identity Authentication', description: 'Verify buyer identity using Terminal 3 credentials', status: 'completed', startedAt: new Date(Date.now() - 86400000 * 3).toISOString(), completedAt: new Date(Date.now() - 86400000 * 3 + 3600000).toISOString(), signature: signData('step1', buyerIdentity.privateKey), outputData: { verified: true, did: buyerIdentity.did } },
    { id: uuidv4(), workflowId: '', agentId: buyerAgent.id, stepType: 'delegate', stepOrder: 2, stepName: 'Authority Delegation', description: 'Buyer delegates authority to Buyer Agent', status: 'completed', startedAt: new Date(Date.now() - 86400000 * 2).toISOString(), completedAt: new Date(Date.now() - 86400000 * 2 + 1800000).toISOString(), signature: signData('step2', buyerIdentity.privateKey), outputData: { delegated: true, permissions: ['search', 'negotiate', 'sign'] } },
    { id: uuidv4(), workflowId: '', agentId: buyerAgent.id, stepType: 'search', stepOrder: 3, stepName: 'Property Search', description: 'Buyer Agent searches listings matching criteria', status: 'completed', startedAt: new Date(Date.now() - 86400000 * 2 + 1800000).toISOString(), completedAt: new Date(Date.now() - 86400000 + 3600000).toISOString(), signature: signData('step3', buyerIdentity.privateKey), outputData: { propertiesFound: 5, selectedProperty: firstProperty.id } },
    { id: uuidv4(), workflowId: '', agentId: buyerAgent.id, stepType: 'negotiate', stepOrder: 4, stepName: 'Agent Negotiation', description: 'Buyer Agent communicates with Seller Agent', status: 'active', startedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'verification')?.id || null, stepType: 'verify', stepOrder: 5, stepName: 'Ownership Verification', description: 'Verification Agent confirms seller ownership credentials', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'surveyor')?.id || null, stepType: 'survey', stepOrder: 6, stepName: 'Property Survey', description: 'Survey Agent performs due diligence inspection', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'valuer')?.id || null, stepType: 'value', stepOrder: 7, stepName: 'Market Valuation', description: 'Valuation Agent generates market assessment', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'lawyer')?.id || null, stepType: 'legal', stepOrder: 8, stepName: 'Legal Review', description: 'Legal Agent validates transaction requirements', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'financing')?.id || null, stepType: 'finance', stepOrder: 9, stepName: 'Financing Assessment', description: 'Financing Agent assesses affordability and approves mortgage', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'registry')?.id || null, stepType: 'register', stepOrder: 10, stepName: 'Registry Verification', description: 'Government Registry Agent verifies title authenticity', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: buyerAgent.id, stepType: 'sign', stepOrder: 11, stepName: 'Contract Signing', description: 'Both parties sign the final contract with cryptographic signatures', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
    { id: uuidv4(), workflowId: '', agentId: Array.from(agents.values()).find(a => a.agentType === 'registry')?.id || null, stepType: 'complete', stepOrder: 12, stepName: 'Transfer Registration', description: 'Registry Agent registers the property transfer', status: 'pending', startedAt: null, completedAt: null, signature: null, outputData: null },
  ];

  const wfId = uuidv4();
  workflowSteps.forEach(s => s.workflowId = wfId);

  workflows.set(wfId, {
    id: wfId,
    transactionId: txId,
    workflowType: 'property_transaction',
    definition: { type: 'property_transaction', version: '1.0' },
    currentState: 'negotiate',
    context: { buyerDid: buyerIdentity.did, sellerDid: sellerIdentity.did, propertyId: firstProperty.id },
    status: 'active',
    steps: workflowSteps,
    startedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    completedAt: null
  });

  // Create sample documents
  const docId1 = uuidv4();
  documents.set(docId1, {
    id: docId1,
    propertyId: firstProperty.id,
    transactionId: txId,
    uploaderDid: sellerIdentity.did,
    documentType: 'title_deed',
    fileName: 'title_deed_sunset_villa.pdf',
    fileHash: hashData('title_deed_sunset_villa'),
    extractedData: { owner: 'Bob Martinez', registrationNumber: 'TD-2024-FL-001247', issueDate: '2024-03-15', landArea: '3200 sq ft', zoning: 'Residential R-1' },
    verificationStatus: 'verified',
    anomalies: [],
    ocrConfidence: 0.97,
    uploadedAt: new Date(Date.now() - 86400000 * 2).toISOString()
  });

  const docId2 = uuidv4();
  documents.set(docId2, {
    id: docId2,
    propertyId: firstProperty.id,
    transactionId: txId,
    uploaderDid: sellerIdentity.did,
    documentType: 'survey_map',
    fileName: 'survey_map_sunset_villa.pdf',
    fileHash: hashData('survey_map_sunset_villa'),
    extractedData: { surveyor: 'Precision Surveys Inc.', surveyDate: '2024-01-20', boundaries: 'Verified', encroachments: 'None detected', area: '3200 sq ft structure, 8500 sq ft lot' },
    verificationStatus: 'verified',
    anomalies: [],
    ocrConfidence: 0.94,
    uploadedAt: new Date(Date.now() - 86400000 * 2 + 3600000).toISOString()
  });

  const docId3 = uuidv4();
  documents.set(docId3, {
    id: docId3,
    propertyId: firstProperty.id,
    transactionId: null,
    uploaderDid: sellerIdentity.did,
    documentType: 'valuation_report',
    fileName: 'valuation_sunset_villa_2024.pdf',
    fileHash: hashData('valuation_sunset_villa_2024'),
    extractedData: { valuer: 'Apex Valuations', valuationDate: '2024-02-10', marketValue: 1280000, method: 'Comparative Sales', confidence: 'High' },
    verificationStatus: 'verified',
    anomalies: [],
    ocrConfidence: 0.96,
    uploadedAt: new Date(Date.now() - 86400000).toISOString()
  });

  // Create sample risk report
  const rrId = uuidv4();
  riskReports.set(rrId, {
    id: rrId,
    propertyId: firstProperty.id,
    transactionId: txId,
    generatedBy: Array.from(agents.values()).find(a => a.agentType === 'verification')?.identityDid || '',
    reportType: 'full',
    riskScore: 15.3,
    riskLevel: 'low',
    findings: [
      { severity: 'info', category: 'Title', description: 'Title deed verified and clear of encumbrances', recommendation: 'No action required' },
      { severity: 'info', category: 'Survey', description: 'Property boundaries confirmed with no encroachments', recommendation: 'No action required' },
      { severity: 'low', category: 'Market', description: 'Asking price is 2.4% below recent comparable sales', recommendation: 'Favorable pricing for buyer' },
      { severity: 'info', category: 'Compliance', description: 'All zoning and building permits verified', recommendation: 'No action required' }
    ],
    recommendations: ['Proceed with transaction', 'Consider requesting updated valuation within 30 days', 'Verify flood zone status before closing'],
    dataSources: ['National Land Registry', 'County Records', 'Market Database', 'Building Permits Office'],
    generatedAt: new Date(Date.now() - 86400000).toISOString()
  });

  // Create sample attestations
  const regIdentity = allIdentities.find(i => i.profile.role === 'government');
  if (regIdentity) {
    attestations.set(uuidv4(), {
      id: uuidv4(),
      attesterDid: regIdentity.did,
      subjectDid: sellerIdentity.did,
      attestationType: 'identity_verification',
      claim: { name: 'Bob Martinez', verified: true, method: 'government_id', country: 'US' },
      confidence: 0.99,
      evidence: { documentType: 'passport', verificationDate: new Date().toISOString() },
      signature: signData('attestation1', regIdentity.privateKey),
      validFrom: new Date().toISOString(),
      status: 'active',
      createdAt: new Date().toISOString()
    });

    attestations.set(uuidv4(), {
      id: uuidv4(),
      attesterDid: regIdentity.did,
      subjectDid: sellerIdentity.did,
      attestationType: 'ownership_proof',
      claim: { propertyTitle: 'Sunset Villa', ownershipVerified: true, registryRef: 'REG-MIA-2019-45892' },
      confidence: 0.98,
      evidence: { registryCheck: true, titleSearch: 'clear', encumbrances: 'none' },
      signature: signData('attestation2', regIdentity.privateKey),
      validFrom: new Date().toISOString(),
      status: 'active',
      createdAt: new Date().toISOString()
    });
  }

  // Create sample messages
  agentMessages.push(
    {
      id: uuidv4(),
      senderDid: buyerIdentity.did,
      receiverDid: sellerIdentity.did,
      messageType: 'inquiry',
      subject: 'Inquiry about Sunset Villa',
      content: { message: 'I am interested in the Sunset Villa property. Is it still available?', propertyId: firstProperty.id, askingPrice: firstProperty.askingPrice },
      relatedTransactionId: txId,
      priority: 'normal',
      signature: signData('msg1', buyerIdentity.privateKey),
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: uuidv4(),
      senderDid: sellerIdentity.did,
      receiverDid: buyerIdentity.did,
      messageType: 'notification',
      subject: 'Re: Inquiry about Sunset Villa',
      content: { message: 'Yes, Sunset Villa is still available. I can arrange a virtual tour at your convenience.', propertyId: firstProperty.id },
      relatedTransactionId: txId,
      priority: 'normal',
      signature: signData('msg2', sellerIdentity.privateKey),
      createdAt: new Date(Date.now() - 86400000 * 2 + 7200000).toISOString()
    },
    {
      id: uuidv4(),
      senderDid: buyerIdentity.did,
      receiverDid: sellerIdentity.did,
      messageType: 'offer',
      subject: 'Offer for Sunset Villa',
      content: { message: 'I would like to make an offer of $1,220,000 for Sunset Villa.', propertyId: firstProperty.id, offerAmount: 1220000, currency: 'USD' },
      relatedTransactionId: txId,
      priority: 'high',
      signature: signData('msg3', buyerIdentity.privateKey),
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: uuidv4(),
      senderDid: sellerIdentity.did,
      receiverDid: buyerIdentity.did,
      messageType: 'counter_offer',
      subject: 'Re: Offer for Sunset Villa',
      content: { message: 'Thank you for your offer. I can accept $1,235,000 with all furnishings included.', propertyId: firstProperty.id, counterAmount: 1235000, currency: 'USD', includes: 'all furnishings' },
      relatedTransactionId: txId,
      priority: 'high',
      signature: signData('msg4', sellerIdentity.privateKey),
      createdAt: new Date(Date.now() - 86400000 + 3600000).toISOString()
    }
  );

  console.log(`✅ Seeded ${identities.size} identities, ${agents.size} agents, ${properties.size} properties, ${transactions.size} transactions`);
  console.log(`✅ Trust Ledger has ${trustLedger.length} entries, ${attestations.size} attestations`);
}

// ─── API Routes ─────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'TrustLand AI Network API', version: '1.0.0' });
});

// ─── Terminal 3 Identity Routes ─────────────────────────────────────────────

// Get all identities
app.get('/api/identities', (_req, res) => {
  const result = Array.from(identities.values()).map(({ privateKey, ...rest }) => rest);
  res.json(result);
});

// Get identity by DID
app.get('/api/identities/:did', (req, res) => {
  const identity = Array.from(identities.values()).find(i => i.did === req.params.did);
  if (!identity) { res.status(404).json({ error: 'Identity not found' }); return; }
  const { privateKey, ...rest } = identity;
  res.json(rest);
});

// Create new identity (Terminal 3 registration)
app.post('/api/identities', (req, res) => {
  const { name, email, organization, credentialType = 'verified_user' } = req.body;
  const { publicKey, privateKey } = generateKeyPair();
  const did = generateDid();
  const id = uuidv4();

  const identity: T3Identity = {
    did, publicKey, privateKey, credentialType,
    status: 'active',
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    profile: { name, email, organization, role: credentialType }
  };

  identities.set(id, identity);

  // Issue verifiable credential
  const credId = uuidv4();
  const credData = { name, email, organization, credentialType, issuedAt: new Date().toISOString() };
  const proof = signData(JSON.stringify(credData), privateKey);

  credentials.set(credId, {
    id: credId,
    issuerDid: 'did:t3:trustland-authority',
    subjectDid: did,
    credentialType: 'identity',
    credentialData: credData,
    proof,
    proofType: 'Ed25519Signature2018',
    validFrom: new Date().toISOString(),
    validUntil: null,
    status: 'active',
    createdAt: new Date().toISOString()
  });

  const ledgerEntry = addToLedger('identity_creation', did, { credentialType, name, organization });
  io.emit('identity_created', { did, credentialType });

  res.json({ identity: { did, publicKey, credentialType, status: 'active', profile: identity.profile }, credential: credentials.get(credId), ledgerEntry });
});

// ─── Agent Routes ───────────────────────────────────────────────────────────

app.get('/api/agents', (_req, res) => {
  res.json(Array.from(agents.values()));
});

app.get('/api/agents/:id', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  res.json(agent);
});

// Activate agent
app.post('/api/agents/:id/activate', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  agent.status = 'active';
  agent.lastActiveAt = new Date().toISOString();

  const ledgerEntry = addToLedger('agent_action', agent.identityDid, {
    agentId: agent.id,
    agentType: agent.agentType,
    action: 'activated'
  });

  io.emit('agent_status_change', { agentId: agent.id, status: 'active' });
  res.json({ agent, ledgerEntry });
});

// Delegate authority to agent
app.post('/api/agents/:id/delegate', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const { granterDid, permissionTypes, scope, constraints } = req.body;
  const granter = Array.from(identities.values()).find(i => i.did === granterDid);
  if (!granter) { res.status(400).json({ error: 'Granter identity not found' }); return; }

  const grants: PermissionGrant[] = [];

  for (const permType of (permissionTypes || ['search', 'negotiate'])) {
    const id = uuidv4();
    const grant: PermissionGrant = {
      id,
      granterDid,
      granteeDid: agent.identityDid,
      agentId: agent.id,
      permissionType: permType,
      scope: scope || {},
      constraints: constraints || {},
      delegatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
      status: 'active',
      signature: signData(`${granterDid}:${agent.identityDid}:${permType}`, granter.privateKey)
    };
    permissions.set(id, grant);
    grants.push(grant);
  }

  const ledgerEntry = addToLedger('permission_grant', granterDid, {
    agentId: agent.id,
    permissionTypes,
    grantCount: grants.length
  }, agent.identityDid);

  io.emit('permission_granted', { agentId: agent.id, permissions: grants });

  res.json({ grants, ledgerEntry });
});

// Get agent permissions
app.get('/api/agents/:id/permissions', (req, res) => {
  const agentPerms = Array.from(permissions.values()).filter(p => p.agentId === req.params.id && p.status === 'active');
  res.json(agentPerms);
});

// ─── Property Routes ────────────────────────────────────────────────────────

app.get('/api/properties', (_req, res) => {
  res.json(Array.from(properties.values()));
});

app.get('/api/properties/:id', (req, res) => {
  const property = properties.get(req.params.id);
  if (!property) { res.status(404).json({ error: 'Property not found' }); return; }

  const propertyDocs = Array.from(documents.values()).filter(d => d.propertyId === property.id);
  const propertyRisks = Array.from(riskReports.values()).filter(r => r.propertyId === property.id);
  const propertyAttestations = Array.from(attestations.values()).filter(a => a.subjectDid === property.ownerDid);

  res.json({ ...property, documents: propertyDocs, riskReports: propertyRisks, attestations: propertyAttestations });
});

// Search properties
app.post('/api/properties/search', (req, res) => {
  const { city, propertyType, minPrice, maxPrice, bedrooms } = req.body;
  let results = Array.from(properties.values());

  if (city) results = results.filter(p => p.city.toLowerCase().includes((city as string).toLowerCase()));
  if (propertyType) results = results.filter(p => p.propertyType === propertyType);
  if (minPrice) results = results.filter(p => p.askingPrice >= (minPrice as number));
  if (maxPrice) results = results.filter(p => p.askingPrice <= (maxPrice as number));
  if (bedrooms) results = results.filter(p => p.bedrooms === bedrooms);

  // Log the search
  const actorDid = req.headers['x-actor-did'] as string || 'did:t3:anonymous';
  addToLedger('agent_action', actorDid, {
    action: 'property_search',
    criteria: req.body,
    resultsCount: results.length
  });

  res.json(results);
});

// ─── Transaction Routes ─────────────────────────────────────────────────────

app.get('/api/transactions', (_req, res) => {
  res.json(Array.from(transactions.values()));
});

app.get('/api/transactions/:id', (req, res) => {
  const tx = transactions.get(req.params.id);
  if (!tx) { res.status(404).json({ error: 'Transaction not found' }); return; }

  const wf = Array.from(workflows.values()).find(w => w.transactionId === tx.id);
  const txLedgerEntries = trustLedger.filter(l => l.transactionId === tx.id);
  const txMessages = agentMessages.filter(m => m.relatedTransactionId === tx.id);
  const txDocs = Array.from(documents.values()).filter(d => d.transactionId === tx.id);

  res.json({ ...tx, workflow: wf, ledgerEntries: txLedgerEntries, messages: txMessages, documents: txDocs });
});

// Initiate new transaction
app.post('/api/transactions', (req, res) => {
  const { propertyId, buyerDid, sellerDid, amount } = req.body;
  const property = properties.get(propertyId);
  if (!property) { res.status(404).json({ error: 'Property not found' }); return; }

  const buyerAgent = Array.from(agents.values()).find(a => a.agentType === 'buyer');
  const sellerAgent = Array.from(agents.values()).find(a => a.agentType === 'seller');

  const txId = uuidv4();
  const tx: Transaction = {
    id: txId,
    propertyId,
    buyerDid,
    sellerDid,
    buyerAgentId: buyerAgent?.id || '',
    sellerAgentId: sellerAgent?.id || '',
    amount,
    currency: 'USD',
    status: 'initiated',
    currentStep: 1,
    totalSteps: 12,
    riskLevel: 'medium',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  transactions.set(txId, tx);

  const ledgerEntry = addToLedger('transaction_init', buyerDid, {
    transactionId: txId,
    propertyId,
    amount,
    status: 'initiated'
  }, sellerDid, txId);

  io.emit('transaction_created', tx);
  res.json({ transaction: tx, ledgerEntry });
});

// ─── Workflow Routes ────────────────────────────────────────────────────────

app.get('/api/workflows', (_req, res) => {
  res.json(Array.from(workflows.values()));
});

app.get('/api/workflows/:id', (req, res) => {
  const wf = workflows.get(req.params.id);
  if (!wf) { res.status(404).json({ error: 'Workflow not found' }); return; }
  res.json(wf);
});

// Advance workflow step
app.post('/api/workflows/:id/advance', (req, res) => {
  const wf = workflows.get(req.params.id);
  if (!wf) { res.status(404).json({ error: 'Workflow not found' }); return; }

  const { stepIndex, outputData } = req.body;
  const step = wf.steps[stepIndex];

  if (step) {
    step.status = 'completed';
    step.completedAt = new Date().toISOString();
    step.outputData = outputData || { completed: true };

    // Activate next step
    if (stepIndex + 1 < wf.steps.length) {
      const nextStep = wf.steps[stepIndex + 1];
      nextStep.status = 'active';
      nextStep.startedAt = new Date().toISOString();
      wf.currentState = nextStep.stepType;
    }

    // Update transaction
    const tx = Array.from(transactions.values()).find(t => t.id === wf.transactionId);
    if (tx) {
      tx.currentStep = stepIndex + 2;
      tx.updatedAt = new Date().toISOString();

      // Map step type to transaction status
      const statusMap: Record<string, string> = {
        'authenticate': 'initiated', 'delegate': 'initiated', 'search': 'negotiating',
        'negotiate': 'negotiating', 'verify': 'due_diligence', 'survey': 'due_diligence',
        'value': 'due_diligence', 'legal': 'legal_review', 'finance': 'financing',
        'register': 'registry_check', 'sign': 'completion', 'complete': 'completed'
      };
      tx.status = statusMap[wf.currentState] || 'initiated';
    }

    const ledgerEntry = addToLedger('agent_action', step.agentId ? (agents.get(step.agentId)?.identityDid || '') : '', {
      workflowId: wf.id,
      stepIndex,
      stepName: step.stepName,
      action: 'step_completed'
    }, null, wf.transactionId, step.agentId);

    io.emit('workflow_step_completed', { workflowId: wf.id, stepIndex, step });
    res.json({ workflow: wf, ledgerEntry });
  } else {
    res.status(400).json({ error: 'Invalid step index' });
  }
});

// ─── Trust Ledger Routes ────────────────────────────────────────────────────

app.get('/api/ledger', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const entries = trustLedger.slice(-limit - offset, trustLedger.length - offset).reverse();
  res.json({ entries, total: trustLedger.length, blockHeight: ledgerBlockNumber });
});

app.get('/api/ledger/verify', (_req, res) => {
  // Verify the entire chain integrity
  let valid = true;
  let invalidBlock = -1;

  for (let i = 1; i < trustLedger.length; i++) {
    if (trustLedger[i].previousHash !== trustLedger[i - 1].eventHash) {
      valid = false;
      invalidBlock = trustLedger[i].blockNumber;
      break;
    }
  }

  res.json({
    valid,
    totalEntries: trustLedger.length,
    blockHeight: ledgerBlockNumber,
    invalidBlock: valid ? null : invalidBlock,
    genesisHash: trustLedger[0]?.eventHash || null,
    latestHash: trustLedger[trustLedger.length - 1]?.eventHash || null
  });
});

// ─── Trust Score Routes ─────────────────────────────────────────────────────

app.get('/api/trust-score/:did', (req, res) => {
  const identity = Array.from(identities.values()).find(i => i.did === req.params.did);
  if (!identity) { res.status(404).json({ error: 'Identity not found' }); return; }

  const identityAttestations = Array.from(attestations.values()).filter(a => a.subjectDid === req.params.did && a.status === 'active');
  const identityLedgerEntries = trustLedger.filter(l => l.actorDid === req.params.did);
  const identityPermissions = Array.from(permissions.values()).filter(p => p.granterDid === req.params.did && p.status === 'active');
  const relatedAgents = Array.from(agents.values()).filter(a => a.identityDid === req.params.did);

  // Calculate dynamic trust score
  const identityScore = identity.verifiedAt ? 25 : 0;
  const attestationScore = Math.min(identityAttestations.length * 15, 30);
  const behaviorScore = Math.min(identityLedgerEntries.filter(l => l.eventType === 'transaction_approval').length * 5, 20);
  const registryScore = identityAttestations.some(a => a.attestationType === 'registry_validation') ? 15 : 0;
  const thirdPartyScore = Math.min(identityPermissions.length * 5, 10);

  const totalScore = Math.min(identityScore + attestationScore + behaviorScore + registryScore + thirdPartyScore, 100);

  res.json({
    did: req.params.did,
    trustScore: totalScore,
    breakdown: {
      identityVerification: { score: identityScore, max: 25, description: 'Verified identity credentials' },
      ownershipVerification: { score: attestationScore, max: 30, description: 'Ownership and property attestations' },
      transactionHistory: { score: behaviorScore, max: 20, description: 'Historical transaction behavior' },
      registryValidation: { score: registryScore, max: 15, description: 'Government registry validation' },
      thirdPartyAttestations: { score: thirdPartyScore, max: 10, description: 'Third-party trust attestations' }
    },
    attestations: identityAttestations,
    agents: relatedAgents,
    totalTransactions: identityLedgerEntries.filter(l => l.eventType === 'transaction_init').length,
    totalActions: identityLedgerEntries.length
  });
});

// ─── Due Diligence Routes ───────────────────────────────────────────────────

app.get('/api/documents', (_req, res) => {
  res.json(Array.from(documents.values()));
});

app.post('/api/documents/upload', (req, res) => {
  const { propertyId, transactionId, uploaderDid, documentType, fileName, fileContent } = req.body;

  const id = uuidv4();
  const fileHash = hashData(fileContent || fileName);

  // Simulate AI document processing
  const extractedData = simulateDocumentExtraction(documentType, fileName);
  const anomalies = simulateAnomalyDetection(documentType);
  const ocrConfidence = 0.85 + Math.random() * 0.14;

  const doc: Document = {
    id,
    propertyId,
    transactionId: transactionId || null,
    uploaderDid,
    documentType,
    fileName,
    fileHash,
    extractedData,
    verificationStatus: anomalies.length > 0 ? 'flagged' : 'verified',
    anomalies,
    ocrConfidence,
    uploadedAt: new Date().toISOString()
  };

  documents.set(id, doc);

  const ledgerEntry = addToLedger('agent_action', uploaderDid, {
    action: 'document_uploaded',
    documentType,
    fileName,
    verificationStatus: doc.verificationStatus,
    anomaliesCount: anomalies.length
  });

  io.emit('document_processed', doc);
  res.json({ document: doc, ledgerEntry });
});

function simulateDocumentExtraction(docType: string, _fileName: string): Record<string, unknown> {
  const extractors: Record<string, Record<string, unknown>> = {
    'title_deed': { owner: 'Extracted Owner Name', registrationNumber: 'TD-EXTRACTED-' + Date.now(), issueDate: new Date().toISOString(), landArea: 'Auto-detected area', zoning: 'Auto-detected zoning' },
    'survey_map': { surveyor: 'Auto-detected Surveyor', surveyDate: new Date().toISOString(), boundaries: 'Auto-verified', encroachments: 'None detected', area: 'Auto-calculated' },
    'sale_agreement': { parties: ['Buyer', 'Seller'], amount: 'Auto-extracted', terms: 'Auto-parsed', contingencies: 'Auto-identified' },
    'valuation_report': { valuer: 'Auto-detected Valuer', valuationDate: new Date().toISOString(), marketValue: 'Auto-extracted', method: 'Auto-detected', confidence: 'High' },
    'identity_proof': { name: 'Auto-extracted Name', documentType: 'passport', expiryDate: 'Auto-detected', country: 'Auto-detected' },
    'bank_statement': { accountHolder: 'Auto-detected', balance: 'Auto-extracted', period: 'Auto-detected', institution: 'Auto-detected' }
  };
  return extractors[docType] || { extracted: true, type: docType, timestamp: new Date().toISOString() };
}

function simulateAnomalyDetection(docType: string): string[] {
  // 10% chance of detecting an anomaly
  if (Math.random() < 0.1) {
    const anomalies: Record<string, string[]> = {
      'title_deed': ['Owner name mismatch detected', 'Registration number format irregularity'],
      'survey_map': ['Boundary discrepancy found', 'Area calculation variance > 5%'],
      'valuation_report': ['Valuation significantly above market range'],
      'identity_proof': ['Document expiry warning'],
      'bank_statement': ['Unusual transaction pattern detected']
    };
    return anomalies[docType]?.slice(0, 1) || ['Minor inconsistency detected'];
  }
  return [];
}

// Get risk reports
app.get('/api/risk-reports', (_req, res) => {
  res.json(Array.from(riskReports.values()));
});

app.get('/api/risk-reports/property/:propertyId', (req, res) => {
  const reports = Array.from(riskReports.values()).filter(r => r.propertyId === req.params.propertyId);
  res.json(reports);
});

// ─── Agent Message Routes ───────────────────────────────────────────────────

app.get('/api/messages', (req, res) => {
  const did = req.query.did as string;
  if (did) {
    const filtered = agentMessages.filter(m => m.senderDid === did || m.receiverDid === did);
    res.json(filtered);
  } else {
    res.json(agentMessages);
  }
});

app.post('/api/messages', (req, res) => {
  const { senderDid, receiverDid, messageType, subject, content, relatedTransactionId, priority } = req.body;
  const sender = Array.from(identities.values()).find(i => i.did === senderDid);
  if (!sender) { res.status(400).json({ error: 'Sender identity not found' }); return; }

  const msg: AgentMessage = {
    id: uuidv4(),
    senderDid,
    receiverDid,
    messageType,
    subject,
    content,
    relatedTransactionId: relatedTransactionId || null,
    priority: priority || 'normal',
    signature: signData(`${senderDid}:${receiverDid}:${subject}`, sender.privateKey),
    createdAt: new Date().toISOString()
  };

  agentMessages.push(msg);

  const ledgerEntry = addToLedger('agent_action', senderDid, {
    action: 'message_sent',
    messageType,
    subject,
    receiverDid
  }, receiverDid, relatedTransactionId);

  io.emit('agent_message', msg);
  res.json({ message: msg, ledgerEntry });
});

// ─── Attestation Routes ─────────────────────────────────────────────────────

app.get('/api/attestations', (_req, res) => {
  res.json(Array.from(attestations.values()));
});

app.post('/api/attestations', (req, res) => {
  const { attesterDid, subjectDid, attestationType, claim, confidence, evidence } = req.body;
  const attester = Array.from(identities.values()).find(i => i.did === attesterDid);
  if (!attester) { res.status(400).json({ error: 'Attester identity not found' }); return; }

  const att: TrustAttestation = {
    id: uuidv4(),
    attesterDid,
    subjectDid,
    attestationType,
    claim,
    confidence,
    evidence: evidence || {},
    signature: signData(`${attesterDid}:${subjectDid}:${attestationType}`, attester.privateKey),
    validFrom: new Date().toISOString(),
    status: 'active',
    createdAt: new Date().toISOString()
  };

  attestations.set(att.id, att);

  const ledgerEntry = addToLedger('attestation', attesterDid, {
    attestationType,
    subjectDid,
    confidence
  }, subjectDid);

  io.emit('attestation_created', att);
  res.json({ attestation: att, ledgerEntry });
});

// ─── Dashboard Stats ────────────────────────────────────────────────────────

app.get('/api/dashboard/stats', (_req, res) => {
  const activeAgents = Array.from(agents.values()).filter(a => a.status === 'active' || a.status === 'busy').length;
  const activeTransactions = Array.from(transactions.values()).filter(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled').length;
  const verifiedProperties = Array.from(properties.values()).filter(p => p.verificationStatus === 'verified').length;
  const avgTrustScore = Array.from(agents.values()).reduce((sum, a) => sum + a.trustScore, 0) / agents.size;

  res.json({
    identities: identities.size,
    activeAgents,
    totalAgents: agents.size,
    properties: properties.size,
    verifiedProperties,
    activeTransactions,
    totalTransactions: transactions.size,
    trustLedgerEntries: trustLedger.length,
    blockHeight: ledgerBlockNumber,
    averageTrustScore: Math.round(avgTrustScore * 10) / 10,
    verifiableCredentials: credentials.size,
    activePermissions: Array.from(permissions.values()).filter(p => p.status === 'active').length,
    attestations: attestations.size,
    documents: documents.size,
    riskReports: riskReports.size,
    messages: agentMessages.length,
    auditLogs: auditLogs.length
  });
});

// ─── Audit Log Routes ───────────────────────────────────────────────────────

app.get('/api/audit-logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const entries = auditLogs.slice(-limit - offset, auditLogs.length - offset).reverse();
  res.json({ entries, total: auditLogs.length });
});

// ─── Agent Orchestration: Simulate AI Reasoning ─────────────────────────────

app.post('/api/agents/:id/reason', (req, res) => {
  const agent = agents.get(req.params.id);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }

  const { task, context } = req.body;

  // Simulate LangGraph-style agent reasoning
  const reasoningSteps = simulateAgentReasoning(agent, task, context);

  // Update agent status
  agent.status = 'busy';
  agent.lastActiveAt = new Date().toISOString();

  const ledgerEntry = addToLedger('agent_action', agent.identityDid, {
    agentId: agent.id,
    agentType: agent.agentType,
    action: 'reasoning_initiated',
    task
  });

  // Simulate async completion after delay
  setTimeout(() => {
    agent.status = 'idle';
    io.emit('agent_reasoning_complete', { agentId: agent.id, task, result: reasoningSteps[reasoningSteps.length - 1] });
  }, 2000);

  res.json({ agentId: agent.id, reasoningSteps, ledgerEntry });
});

function simulateAgentReasoning(agent: Agent, task: string, context: Record<string, unknown>): Array<{ step: string; thought: string; action: string; output: Record<string, unknown> }> {
  const reasoningTemplates: Record<string, Array<{ step: string; thought: string; action: string; output: Record<string, unknown> }>> = {
    'buyer': [
      { step: 'plan', thought: 'I need to search for properties matching the buyer criteria and evaluate options.', action: 'search_properties', output: { criteria: context, status: 'searching' } },
      { step: 'evaluate', thought: 'Based on search results, I should rank properties by trust score and value.', action: 'rank_properties', output: { ranked: true, topMatch: 'property_id_1' } },
      { step: 'decide', thought: 'The top-ranked property meets all criteria. I will initiate contact with the seller agent.', action: 'initiate_negotiation', output: { decision: 'proceed', confidence: 0.92 } }
    ],
    'seller': [
      { step: 'verify', thought: 'I must verify my authority to list this property and confirm ownership credentials.', action: 'verify_ownership', output: { verified: true, credentialId: 'vc_ownership_001' } },
      { step: 'evaluate', thought: 'Market analysis suggests the asking price is competitive. I will list at the current price.', action: 'set_price', output: { priceSet: true, marketAlignment: 'competitive' } },
      { step: 'respond', thought: 'An inquiry has been received. I will respond with property details and schedule a viewing.', action: 'respond_inquiry', output: { responded: true, viewingScheduled: true } }
    ],
    'lawyer': [
      { step: 'analyze', thought: 'I need to review the transaction documents for legal compliance and potential issues.', action: 'review_documents', output: { documentsReviewed: 5, issuesFound: 0 } },
      { step: 'validate', thought: 'All contracts appear to comply with local and federal regulations.', action: 'validate_compliance', output: { compliant: true, regulations: ['FIRPTA', 'RESPA', 'State Transfer Tax'] } },
      { step: 'advise', thought: 'Transaction is legally sound. I recommend proceeding with the signing phase.', action: 'issue_approval', output: { approved: true, conditions: [] } }
    ],
    'surveyor': [
      { step: 'inspect', thought: 'I will perform a comprehensive property inspection based on the survey map and physical boundaries.', action: 'inspect_property', output: { inspectionComplete: true, areasInspected: ['structure', 'boundaries', 'utilities'] } },
      { step: 'compare', thought: 'Comparing physical boundaries with registered survey map data.', action: 'verify_boundaries', output: { boundariesMatch: true, discrepancy: '0%' } },
      { step: 'report', thought: 'All inspections passed. I will generate the survey verification report.', action: 'generate_report', output: { reportGenerated: true, condition: 'excellent', riskLevel: 'low' } }
    ],
    'valuer': [
      { step: 'research', thought: 'I need to analyze comparable sales data in the area for the past 12 months.', action: 'market_analysis', output: { comparablesFound: 12, priceRange: 'within_market' } },
      { step: 'calculate', thought: 'Using the comparative sales approach and income approach to determine fair market value.', action: 'calculate_value', output: { marketValue: 1260000, confidence: 0.94, method: 'comparative_sales' } },
      { step: 'certify', thought: 'Valuation complete. The asking price is within 2% of fair market value.', action: 'certify_valuation', output: { certified: true, varianceFromMarket: '-2.4%', recommendation: 'fair_price' } }
    ],
    'financing': [
      { step: 'assess', thought: 'I need to evaluate the buyer financial profile and determine affordability.', action: 'assess_affordability', output: { debtToIncome: 0.28, creditScore: 780, maxLoan: 1500000 } },
      { step: 'calculate', thought: 'Based on the financial assessment, I can offer favorable mortgage terms.', action: 'calculate_mortgage', output: { rate: 6.25, term: 30, monthlyPayment: 7612, downPayment: 250000 } },
      { step: 'approve', thought: 'Buyer qualifies for financing. I will issue a pre-approval letter.', action: 'approve_financing', output: { approved: true, amount: 1000000, conditions: ['appraisal_required', 'employment_verification'] } }
    ],
    'registry': [
      { step: 'search', thought: 'I need to verify the title history and check for any encumbrances or liens.', action: 'title_search', output: { titleClear: true, liens: 0, encumbrances: 0, chainOfTitle: 'verified' } },
      { step: 'validate', thought: 'The title is clean. I will verify the identity of both parties against registry records.', action: 'validate_parties', output: { buyerVerified: true, sellerVerified: true, matchConfidence: 0.99 } },
      { step: 'register', thought: 'All verifications passed. I am ready to register the transfer upon signing.', action: 'prepare_registration', output: { registrationReady: true, transferId: 'TR-' + Date.now() } }
    ],
    'verification': [
      { step: 'cross_reference', thought: 'I will cross-reference all submitted documents and verify consistency across sources.', action: 'cross_reference', output: { documentsVerified: 7, inconsistencies: 0 } },
      { step: 'risk_assess', thought: 'Performing risk assessment based on all available data and verification results.', action: 'assess_risk', output: { riskScore: 15, riskLevel: 'low', factors: { identity: 'verified', ownership: 'verified', compliance: 'passed' } } },
      { step: 'attest', thought: 'All verifications passed. I will generate a comprehensive verification attestation.', action: 'generate_attestation', output: { attestationGenerated: true, confidence: 0.97, recommendation: 'proceed' } }
    ]
  };

  return reasoningTemplates[agent.agentType] || [
    { step: 'analyze', thought: `Analyzing task: ${task}`, action: 'analyze', output: { status: 'analyzing' } },
    { step: 'plan', thought: 'Developing execution plan based on capabilities and permissions.', action: 'plan', output: { plan: 'created' } },
    { step: 'execute', thought: 'Executing the planned action with verified credentials.', action: 'execute', output: { result: 'success' } }
  ];
}

// ─── Socket.IO Real-Time Events ─────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('subscribe_transaction', (txId: string) => {
    socket.join(`tx:${txId}`);
    console.log(`📋 Client ${socket.id} subscribed to transaction ${txId}`);
  });

  socket.on('subscribe_agent', (agentId: string) => {
    socket.join(`agent:${agentId}`);
    console.log(`🤖 Client ${socket.id} subscribed to agent ${agentId}`);
  });

  socket.on('agent_action', (data: { agentId: string; action: string; payload: Record<string, unknown> }) => {
    const agent = agents.get(data.agentId);
    if (agent) {
      agent.lastActiveAt = new Date().toISOString();
      io.emit('agent_activity', data);
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ─── Start Server ───────────────────────────────────────────────────────────

seedData();

server.listen(PORT, () => {
  console.log(`🚀 TrustLand AI Network API running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`🔐 Terminal 3 Agent Auth SDK simulation active`);
  console.log(`📊 Trust Ledger initialized`);
});

export { app, io };
