// TrustLand AI Network - Global State Store (Zustand)
// Updated with Terminal 3 Agent Auth SDK integration
import { create } from 'zustand';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ViewType =
  | 'overview'
  | 'dashboard'
  | 'agents'
  | 'ledger'
  | 'transactions'
  | 'diligence'
  | 'trust-score'
  | 'messages'
  | 'identities'
  | 'autonomous-purchase'; // NEW: The "Wow" feature view

export interface T3Identity {
  did: string;
  publicKey: string;
  publicKeyBase64?: string;
  credentialType: string;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
  profile: { name: string; email: string; organization?: string; role?: string };
  t3ApiKey?: string;
  verifiableCredentialId?: string;
  t3Integrated?: boolean;
}

export interface Agent {
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
  t3AgentRegistered?: boolean;
  t3Scopes?: string[];
}

export interface Property {
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

export interface Transaction {
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

export interface WorkflowStep {
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
  signatureType?: string;
  t3AccessTokenJti?: string;
  outputData: Record<string, unknown> | null;
}

export interface Workflow {
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

export interface TrustLedgerEntry {
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
  signatureType: string;
  blockNumber: number;
  timestamp: string;
  t3Attestation?: {
    accessTokenJti: string;
    authenticatedAgentDid: string;
    authorizedScopes: string[];
    agentAuthVerified: boolean;
    authenticatedAt: string;
  };
}

export interface Document {
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

export interface RiskReport {
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

export interface AgentMessage {
  id: string;
  senderDid: string;
  receiverDid: string;
  messageType: string;
  subject: string;
  content: Record<string, unknown>;
  relatedTransactionId: string | null;
  priority: string;
  signature: string;
  signatureType?: string;
  t3Authenticated?: boolean;
  createdAt: string;
}

export interface TrustAttestation {
  id: string;
  attesterDid: string;
  subjectDid: string;
  attestationType: string;
  claim: Record<string, unknown>;
  confidence: number;
  evidence: Record<string, unknown>;
  signature: string;
  signatureType?: string;
  validFrom: string;
  status: string;
  createdAt: string;
}

export interface DashboardStats {
  identities: number;
  activeAgents: number;
  totalAgents: number;
  properties: number;
  verifiedProperties: number;
  activeTransactions: number;
  totalTransactions: number;
  trustLedgerEntries: number;
  blockHeight: number;
  averageTrustScore: number;
  verifiableCredentials: number;
  activePermissions: number;
  attestations: number;
  documents: number;
  riskReports: number;
  messages: number;
  auditLogs: number;
  // T3 Integration Stats
  t3RegisteredAgents?: number;
  t3ApiKeysIssued?: number;
  t3VerifiableCredentials?: number;
  t3PermissionGrants?: number;
  ledgerWithT3Attestation?: number;
  ledgerWithRealSignatures?: number;
  signatureAlgorithm?: string;
}

export interface TrustScoreBreakdown {
  did: string;
  trustScore: number;
  breakdown: {
    identityVerification: { score: number; max: number; description: string };
    ownershipVerification: { score: number; max: number; description: string };
    transactionHistory: { score: number; max: number; description: string };
    registryValidation: { score: number; max: number; description: string };
    thirdPartyAttestations: { score: number; max: number; description: string };
  };
  attestations: TrustAttestation[];
  agents: Agent[];
  totalTransactions: number;
  totalActions: number;
  t3VerifiableCredentials?: unknown[];
  t3PermissionGrants?: unknown[];
  t3LedgerEntries?: number;
}

// ── Autonomous Purchase Types ──

export interface AutonomousDelegation {
  id: string;
  granterDid: string;
  granterName: string;
  agentId: string;
  agentDid: string;
  criteria: {
    propertyType: string;
    maxPrice: number;
    location: string;
    maxDistanceKm?: number;
    minArea?: number;
    features?: string[];
  };
  permissions: string[];
  status: 'pending' | 'active' | 'executing' | 'completed' | 'revoked';
  apiKey: string;
  accessToken: string | null;
  signature: string;
  createdAt: string;
  expiresAt: string;
}

export interface AutonomousStep {
  id: string;
  delegationId: string;
  stepType: string;
  stepName: string;
  agentDid: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  t3AccessTokenJti: string;
  signature: string | null;
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface TrustLandStore {
  // Navigation
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;

  // Data
  identities: T3Identity[];
  agents: Agent[];
  properties: Property[];
  transactions: Transaction[];
  workflows: Workflow[];
  trustLedger: TrustLedgerEntry[];
  documents: Document[];
  riskReports: RiskReport[];
  messages: AgentMessage[];
  attestations: TrustAttestation[];
  dashboardStats: DashboardStats | null;

  // Autonomous Purchase State
  autonomousDelegations: AutonomousDelegation[];
  currentDelegationId: string | null;
  autonomousSteps: AutonomousStep[];
  autonomousResult: {
    propertyId: string;
    propertyTitle: string;
    matchScore: number;
    riskLevel: string;
    trustScore: number;
    priceVsMarket: string;
    recommended: boolean;
    reasoning: string[];
    totalStepsCompleted: number;
    allActionsSigned: boolean;
  } | null;

  // Selected items
  selectedPropertyId: string | null;
  selectedTransactionId: string | null;
  selectedAgentId: string | null;

  // Loading states
  isLoading: boolean;

  // Real-time
  lastLedgerEntry: TrustLedgerEntry | null;
  liveAgentActivities: Array<{ agentId: string; action: string; timestamp: string }>;

  // Actions
  fetchDashboardStats: () => Promise<void>;
  fetchIdentities: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  fetchProperties: () => Promise<void>;
  fetchTransactions: () => Promise<void>;
  fetchTrustLedger: () => Promise<void>;
  fetchDocuments: () => Promise<void>;
  fetchMessages: () => Promise<void>;
  fetchAttestations: () => Promise<void>;
  fetchTransactionDetail: (id: string) => Promise<void>;
  fetchTrustScore: (did: string) => Promise<TrustScoreBreakdown | null>;
  advanceWorkflow: (workflowId: string, stepIndex: number) => Promise<void>;
  uploadDocument: (data: Record<string, unknown>) => Promise<void>;
  sendMessage: (data: Record<string, unknown>) => Promise<void>;
  delegateAuthority: (agentId: string, granterDid: string, permissions: string[]) => Promise<void>;
  setLastLedgerEntry: (entry: TrustLedgerEntry) => void;
  addLiveActivity: (activity: { agentId: string; action: string; timestamp: string }) => void;

  // Autonomous Purchase Actions
  createAutonomousDelegation: (granterDid: string, granterName: string, criteria: Record<string, unknown>) => Promise<void>;
  executeAutonomousPurchase: (delegationId: string) => Promise<void>;
  fetchAutonomousDelegations: () => Promise<void>;
}

// ─── API Helper ─────────────────────────────────────────────────────────────

const API_BASE = '/api';

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  return response.json();
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useTrustLandStore = create<TrustLandStore>((set, get) => ({
  currentView: 'overview',
  setCurrentView: (view) => set({ currentView: view }),

  identities: [],
  agents: [],
  properties: [],
  transactions: [],
  workflows: [],
  trustLedger: [],
  documents: [],
  riskReports: [],
  messages: [],
  attestations: [],
  dashboardStats: null,

  autonomousDelegations: [],
  currentDelegationId: null,
  autonomousSteps: [],
  autonomousResult: null,

  selectedPropertyId: null,
  selectedTransactionId: null,
  selectedAgentId: null,

  isLoading: false,
  lastLedgerEntry: null,
  liveAgentActivities: [],

  fetchDashboardStats: async () => {
    try {
      const stats = await apiFetch('/dashboard/stats');
      set({ dashboardStats: stats });
    } catch (e) { console.error('Failed to fetch dashboard stats:', e); }
  },

  fetchIdentities: async () => {
    try {
      const data = await apiFetch('/identities');
      set({ identities: data });
    } catch (e) { console.error('Failed to fetch identities:', e); }
  },

  fetchAgents: async () => {
    try {
      const data = await apiFetch('/agents');
      set({ agents: data });
    } catch (e) { console.error('Failed to fetch agents:', e); }
  },

  fetchProperties: async () => {
    try {
      const data = await apiFetch('/properties');
      set({ properties: data });
    } catch (e) { console.error('Failed to fetch properties:', e); }
  },

  fetchTransactions: async () => {
    try {
      const data = await apiFetch('/transactions');
      set({ transactions: data });
    } catch (e) { console.error('Failed to fetch transactions:', e); }
  },

  fetchTrustLedger: async () => {
    try {
      const data = await apiFetch('/ledger?limit=100');
      set({ trustLedger: data.entries });
    } catch (e) { console.error('Failed to fetch trust ledger:', e); }
  },

  fetchDocuments: async () => {
    try {
      const data = await apiFetch('/documents');
      set({ documents: data });
    } catch (e) { console.error('Failed to fetch documents:', e); }
  },

  fetchMessages: async () => {
    try {
      const data = await apiFetch('/messages');
      set({ messages: data });
    } catch (e) { console.error('Failed to fetch messages:', e); }
  },

  fetchAttestations: async () => {
    try {
      const data = await apiFetch('/attestations');
      set({ attestations: data });
    } catch (e) { console.error('Failed to fetch attestations:', e); }
  },

  fetchTransactionDetail: async (id: string) => {
    try {
      const data = await apiFetch(`/transactions/${id}`);
      if (data.workflow) {
        set(state => ({ workflows: [...state.workflows.filter(w => w.id !== data.workflow.id), data.workflow] }));
      }
      set({ selectedTransactionId: id });
    } catch (e) { console.error('Failed to fetch transaction detail:', e); }
  },

  fetchTrustScore: async (did: string) => {
    try {
      return await apiFetch(`/trust-score/${encodeURIComponent(did)}`);
    } catch (e) { console.error('Failed to fetch trust score:', e); return null; }
  },

  advanceWorkflow: async (workflowId: string, stepIndex: number) => {
    try {
      set({ isLoading: true });
      const data = await apiFetch(`/workflows/${workflowId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex, outputData: { completed: true, timestamp: new Date().toISOString() } })
      });
      const state = get();
      if (state.selectedTransactionId) await state.fetchTransactionDetail(state.selectedTransactionId);
      await state.fetchTransactions();
      await state.fetchTrustLedger();
      set({ isLoading: false });
    } catch (e) { console.error('Failed to advance workflow:', e); set({ isLoading: false }); }
  },

  uploadDocument: async (data: Record<string, unknown>) => {
    try {
      await apiFetch('/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      await get().fetchDocuments();
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to upload document:', e); }
  },

  sendMessage: async (data: Record<string, unknown>) => {
    try {
      await apiFetch('/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      await get().fetchMessages();
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to send message:', e); }
  },

  delegateAuthority: async (agentId: string, granterDid: string, permissionTypes: string[]) => {
    try {
      await apiFetch(`/agents/${agentId}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granterDid, permissionTypes })
      });
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to delegate authority:', e); }
  },

  // ── Autonomous Purchase Actions ──

  createAutonomousDelegation: async (granterDid: string, granterName: string, criteria: Record<string, unknown>) => {
    try {
      set({ isLoading: true });
      const result = await apiFetch('/t3/autonomous/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granterDid, granterName, criteria })
      });
      set({ currentDelegationId: result.delegation.id, isLoading: false });
      await get().fetchAutonomousDelegations();
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to create autonomous delegation:', e); set({ isLoading: false }); }
  },

  executeAutonomousPurchase: async (delegationId: string) => {
    try {
      set({ isLoading: true });
      const result = await apiFetch('/t3/autonomous/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegationId })
      });
      set({
        autonomousSteps: result.steps || [],
        autonomousResult: result.recommendation || null,
        isLoading: false,
      });
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to execute autonomous purchase:', e); set({ isLoading: false }); }
  },

  fetchAutonomousDelegations: async () => {
    try {
      const data = await apiFetch('/t3/autonomous/delegations');
      set({ autonomousDelegations: data });
    } catch (e) { console.error('Failed to fetch autonomous delegations:', e); }
  },

  setLastLedgerEntry: (entry) => set({ lastLedgerEntry: entry }),
  addLiveActivity: (activity) => set(state => ({
    liveAgentActivities: [activity, ...state.liveAgentActivities].slice(0, 50)
  })),
}));
