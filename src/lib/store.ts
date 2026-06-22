// TrustLand AI Network - Global State Store (Zustand)
// Updated with Terminal 3 Agent Auth SDK integration
import { create } from 'zustand';
import { canAccessView, deriveDashboardRole, type DashboardRole, type KycStatus } from './trustland-access';
import type {
  PaymentCreateIntentRequest,
  PaymentCreateIntentResponse,
  PaymentDashboardStats,
  PaymentRecord,
  PaymentStatusResponse,
} from './payment-types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ViewType =
  | 'overview'
  | 'auth'              // NEW — login / verification
  | 'dashboard'
  | 'agents'
  | 'ledger'
  | 'transactions'
  | 'finance'
  | 'withdrawals'
  | 'diligence'
  | 'trust-score'
  | 'messages'
  | 'identities'
  | 'verification'
  | 'autonomous-purchase'
  | 'trust-engine'       // NEW
  | 'audit-ledger'       // NEW
  | 'analytics';         // NEW

const AUTH_SESSION_STORAGE_KEY = 'trustland-auth-session';
const AUTH_VIEW_TYPES = new Set<ViewType>([
  'overview',
  'auth',
  'dashboard',
  'agents',
  'ledger',
  'transactions',
  'finance',
  'withdrawals',
  'diligence',
  'trust-score',
  'messages',
  'identities',
  'verification',
  'autonomous-purchase',
  'trust-engine',
  'audit-ledger',
  'analytics',
]);

type AuthSessionState = {
  currentView: ViewType;
  isAuthenticated: boolean;
  dashboardRole: DashboardRole;
  identityDid: string | null;
  displayName: string | null;
  kycStatus: KycStatus;
};

function isViewType(value: unknown): value is ViewType {
  return typeof value === 'string' && AUTH_VIEW_TYPES.has(value as ViewType);
}

function readAuthSession(): AuthSessionState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuthSessionState>;
    if (typeof parsed.isAuthenticated !== 'boolean') return null;

    return {
      currentView: isViewType(parsed.currentView) ? parsed.currentView : 'auth',
      isAuthenticated: parsed.isAuthenticated,
      dashboardRole: parsed.dashboardRole === 'buyer' || parsed.dashboardRole === 'seller' ? parsed.dashboardRole : 'admin',
      identityDid: typeof parsed.identityDid === 'string' ? parsed.identityDid : null,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
      kycStatus: parsed.kycStatus === 'pending' || parsed.kycStatus === 'verified' || parsed.kycStatus === 'rejected'
        ? parsed.kycStatus
        : 'unverified',
    };
  } catch {
    return null;
  }
}

function writeAuthSession(session: AuthSessionState) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage failures and keep the in-memory session state.
  }
}

export interface T3Identity {
  did: string;
  publicKey: string;
  publicKeyBase64?: string;
  credentialType: string;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
  profile: {
    name: string;
    email: string;
    organization?: string;
    role?: string;
    phone?: string;
    country?: string;
    address?: string;
    dateOfBirth?: string;
    nationalId?: string;
    kycStatus?: KycStatus;
    kycVerifiedAt?: string;
  };
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

// ── Trust Score Engine Types ──

export interface TrustProfile {
  id: string;
  entityType: 'user' | 'seller' | 'agent' | 'property';
  entityId: string;
  trustScore: number;
  verificationCount: number;
  successfulTransactions: number;
  disputes: number;
  fraudReports: number;
  lastUpdated: string;
  createdAt: string;
  scoringFactors: {
    identityVerified: boolean;
    ownershipVerified: boolean;
    completedTransactions: number;
    positiveReviews: number;
    accountAgeDays: number;
    historicalDisputes: number;
    successfulWorkflows: number;
    verificationAccuracy: number;
    userRating: number;
  };
}

export interface TransactionEvent {
  id: string;
  transactionId: string;
  eventType: string;
  actorId: string;
  actorType: 'user' | 'agent' | 'system';
  metadata: Record<string, unknown>;
  timestamp: string;
  signature: string;
  signatureType: string;
  t3AccessTokenJti?: string;
}

export interface AuditLedgerEntry {
  id: string;
  actorId: string;
  actorType: 'user' | 'agent' | 'system';
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  hash: string;
  previousHash: string | null;
  timestamp: string;
  signature: string;
  signatureType: string;
  t3Attestation?: {
    accessTokenJti: string;
    agentAuthVerified: boolean;
    authenticatedAt: string;
  };
}

export interface AnalyticsMetrics {
  totalProperties: number;
  verifiedProperties: number;
  verificationSuccessRate: number;
  averageTrustScore: number;
  activeAgents: number;
  totalAgents: number;
  transactionVolume: number;
  totalTransactions: number;
  riskDistribution: { low: number; medium: number; high: number; critical: number };
  transactionPipeline: Record<string, number>;
  trustScoreTrends: Array<{ date: string; avgScore: number; identities: number; transactions: number }>;
  verificationActivity: Array<{ date: string; verifications: number; reports: number }>;
  agentActivity: Array<{ agentId: string; name: string; type: string; trustScore: number; actions: number; status: string }>;
  auditLedgerEntries: number;
  trustProfilesCount: number;
}

export interface TransactionStageInfo {
  key: string;
  label: string;
  order: number;
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface TrustLandStore {
  // Navigation
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  isAuthenticated: boolean;
  dashboardRole: DashboardRole;
  sessionIdentityDid: string | null;
  sessionDisplayName: string | null;
  sessionKycStatus: KycStatus;
  setAuthSession: (session: {
    authenticated: boolean;
    currentView?: ViewType;
    dashboardRole?: DashboardRole;
    identityDid?: string | null;
    displayName?: string | null;
    kycStatus?: KycStatus;
  }) => void;
  setIsAuthenticated: (authenticated: boolean) => void;
  restoreAuthSession: () => void;
  logout: () => void;

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
  payments: PaymentRecord[];
  paymentDashboardStats: PaymentDashboardStats | null;

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

  // New data
  trustProfiles: TrustProfile[];
  transactionEvents: TransactionEvent[];
  auditLedger: AuditLedgerEntry[];
  auditLedgerBlockHeight: number;
  analyticsMetrics: AnalyticsMetrics | null;
  transactionStages: TransactionStageInfo[];

  // Selected items
  selectedPropertyId: string | null;
  selectedTransactionId: string | null;
  selectedAgentId: string | null;
  selectedPaymentId: string | null;
  selectedPaymentStatus: PaymentStatusResponse | null;

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
  fetchRiskReports: () => Promise<void>;
  fetchMessages: () => Promise<void>;
  fetchAttestations: () => Promise<void>;
  fetchPayments: (filters?: Record<string, string>) => Promise<void>;
  fetchPaymentStatus: (paymentId: string) => Promise<PaymentStatusResponse | null>;
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
  createPaymentIntent: (request: PaymentCreateIntentRequest) => Promise<PaymentCreateIntentResponse>;
  confirmDemoPayment: (paymentId: string) => Promise<PaymentRecord>;

  // New actions
  fetchTrustProfiles: () => Promise<void>;
  fetchTrustProfile: (entityId: string) => Promise<TrustProfile | null>;
  calculateTrustScore: (entityType: string, entityId: string) => Promise<void>;
  advanceTransactionStage: (transactionId: string, actorId: string, notes?: string) => Promise<void>;
  fetchTransactionEvents: (transactionId: string) => Promise<void>;
  assignAgent: (agentId: string, transactionId: string, role: string) => Promise<void>;
  fetchAgentActivity: (agentId: string) => Promise<void>;
  fetchAuditLedger: (filters?: Record<string, string>) => Promise<void>;
  verifyAuditLedger: () => Promise<void>;
  fetchAnalytics: (filters?: Record<string, string>) => Promise<void>;
  fetchTransactionStages: () => Promise<void>;
}

// ─── API Helper ─────────────────────────────────────────────────────────────

const API_BASE = '/api';

function buildAuthHeaders() {
  if (typeof window === 'undefined') return {};

  const session = useTrustLandStore.getState();
  if (!session.isAuthenticated) return {};

  const headers: Record<string, string> = {
    'x-trustland-user-role': session.dashboardRole,
    'x-trustland-kyc-status': session.sessionKycStatus,
  };

  if (session.sessionIdentityDid) {
    headers['x-trustland-user-did'] = session.sessionIdentityDid;
  }

  if (session.sessionDisplayName) {
    headers['x-trustland-user-name'] = session.sessionDisplayName;
  }

  return headers;
}

async function apiFetch(path: string, options?: RequestInit, retries = 2): Promise<any> {
  const url = `${API_BASE}${path}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = new Headers(options?.headers || {});
      const authHeaders = buildAuthHeaders();
      Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      return response.json();
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Unreachable');
}

function upsertPaymentRecord(payments: PaymentRecord[], payment: PaymentRecord) {
  const nextPayments = [...payments.filter((item) => item.id !== payment.id), payment];
  nextPayments.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return nextPayments;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useTrustLandStore = create<TrustLandStore>((set, get) => ({
  currentView: 'auth',
  dashboardRole: 'admin',
  sessionIdentityDid: null,
  sessionDisplayName: null,
  sessionKycStatus: 'unverified',
  setCurrentView: (view) => set(state => {
    const requestedView: ViewType = state.isAuthenticated && view === 'auth' ? 'dashboard' : view;
    const currentView: ViewType = !state.isAuthenticated
      ? 'auth'
      : canAccessView(state.dashboardRole, requestedView)
        ? requestedView
        : 'dashboard';
    writeAuthSession({
      currentView,
      isAuthenticated: state.isAuthenticated,
      dashboardRole: state.dashboardRole,
      identityDid: state.sessionIdentityDid,
      displayName: state.sessionDisplayName,
      kycStatus: state.sessionKycStatus,
    });
    return { currentView };
  }),
  isAuthenticated: false,
  setAuthSession: (session) => set(state => {
    const authenticated = session.authenticated;
    const dashboardRole = session.dashboardRole || state.dashboardRole;
    const requestedView: ViewType = session.currentView && session.currentView !== 'auth'
      ? session.currentView
      : 'dashboard';
    const currentView: ViewType = authenticated
      ? canAccessView(dashboardRole, requestedView)
        ? requestedView
        : 'dashboard'
      : 'auth';
    const nextState: {
      isAuthenticated: boolean;
      dashboardRole: DashboardRole;
      sessionIdentityDid: string | null;
      sessionDisplayName: string | null;
      sessionKycStatus: KycStatus;
      currentView: ViewType;
      selectedPaymentId: string | null;
      selectedPaymentStatus: PaymentStatusResponse | null;
      payments: PaymentRecord[];
      paymentDashboardStats: PaymentDashboardStats | null;
    } = {
      isAuthenticated: authenticated,
      dashboardRole,
      sessionIdentityDid: authenticated ? (session.identityDid ?? state.sessionIdentityDid) : null,
      sessionDisplayName: authenticated ? (session.displayName ?? state.sessionDisplayName) : null,
      sessionKycStatus: authenticated ? (session.kycStatus ?? state.sessionKycStatus) : 'unverified',
      currentView,
      selectedPaymentId: authenticated ? state.selectedPaymentId : null,
      selectedPaymentStatus: authenticated ? state.selectedPaymentStatus : null,
      payments: authenticated ? state.payments : [],
      paymentDashboardStats: authenticated ? state.paymentDashboardStats : null,
    };
    writeAuthSession({
      currentView: nextState.currentView,
      isAuthenticated: nextState.isAuthenticated,
      dashboardRole: nextState.dashboardRole,
      identityDid: nextState.sessionIdentityDid,
      displayName: nextState.sessionDisplayName,
      kycStatus: nextState.sessionKycStatus,
    });
    return nextState;
  }),
  setIsAuthenticated: (authenticated) => set(state => {
    const requestedView: ViewType = state.currentView === 'auth' ? 'dashboard' : state.currentView;
    const currentView: ViewType = authenticated
      ? canAccessView(state.dashboardRole, requestedView)
        ? requestedView
        : 'dashboard'
      : 'auth';
    const nextState: {
      isAuthenticated: boolean;
      currentView: ViewType;
      dashboardRole: DashboardRole;
      sessionIdentityDid: string | null;
      sessionDisplayName: string | null;
      sessionKycStatus: KycStatus;
      selectedPaymentId: string | null;
      selectedPaymentStatus: PaymentStatusResponse | null;
      payments: PaymentRecord[];
      paymentDashboardStats: PaymentDashboardStats | null;
    } = {
      isAuthenticated: authenticated,
      currentView,
      dashboardRole: authenticated ? state.dashboardRole : 'admin',
      sessionIdentityDid: authenticated ? state.sessionIdentityDid : null,
      sessionDisplayName: authenticated ? state.sessionDisplayName : null,
      sessionKycStatus: authenticated ? state.sessionKycStatus : 'unverified',
      selectedPaymentId: authenticated ? state.selectedPaymentId : null,
      selectedPaymentStatus: authenticated ? state.selectedPaymentStatus : null,
      payments: authenticated ? state.payments : [],
      paymentDashboardStats: authenticated ? state.paymentDashboardStats : null,
    };
    writeAuthSession({
      currentView,
      isAuthenticated: authenticated,
      dashboardRole: nextState.dashboardRole,
      identityDid: nextState.sessionIdentityDid,
      displayName: nextState.sessionDisplayName,
      kycStatus: nextState.sessionKycStatus,
    });
    return nextState;
  }),
  restoreAuthSession: () => {
    const session = readAuthSession();
    if (!session) return;

    const dashboardRole = deriveDashboardRole(session.dashboardRole);
    const requestedView: ViewType = session.currentView === 'auth' ? 'dashboard' : session.currentView;
    const currentView: ViewType = session.isAuthenticated && canAccessView(dashboardRole, requestedView)
      ? requestedView
      : 'auth';
    set({
      currentView,
      isAuthenticated: session.isAuthenticated,
      dashboardRole,
      sessionIdentityDid: session.identityDid,
      sessionDisplayName: session.displayName,
      sessionKycStatus: session.kycStatus,
    });
  },
  logout: () => {
    writeAuthSession({
      currentView: 'auth',
      isAuthenticated: false,
      dashboardRole: 'admin',
      identityDid: null,
      displayName: null,
      kycStatus: 'unverified',
    });
    set({
      currentView: 'auth',
      isAuthenticated: false,
      dashboardRole: 'admin',
      sessionIdentityDid: null,
      sessionDisplayName: null,
      sessionKycStatus: 'unverified',
      payments: [],
      paymentDashboardStats: null,
      selectedPaymentId: null,
      selectedPaymentStatus: null,
    });
  },

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
  payments: [],
  paymentDashboardStats: null,

  autonomousDelegations: [],
  currentDelegationId: null,
  autonomousSteps: [],
  autonomousResult: null,

  trustProfiles: [],
  transactionEvents: [],
  auditLedger: [],
  auditLedgerBlockHeight: 0,
  analyticsMetrics: null,
  transactionStages: [],

  selectedPropertyId: null,
  selectedTransactionId: null,
  selectedAgentId: null,
  selectedPaymentId: null,
  selectedPaymentStatus: null,

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

  fetchRiskReports: async () => {
    try {
      const data = await apiFetch('/risk-reports');
      set({ riskReports: data });
    } catch (e) { console.error('Failed to fetch risk reports:', e); }
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

  fetchPayments: async (filters?: Record<string, string>) => {
    try {
      const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
      const data = await apiFetch(`/payments${params}`);
      if (Array.isArray(data)) {
        set({ payments: data });
        return;
      }

      if (data?.payments) {
        set({ payments: data.payments, paymentDashboardStats: data.stats || null });
        return;
      }

      set({ payments: [], paymentDashboardStats: null });
    } catch (e) { console.error('Failed to fetch payments:', e); }
  },

  fetchPaymentStatus: async (paymentId: string) => {
    try {
      const data = await apiFetch(`/payments/${encodeURIComponent(paymentId)}`);
      set((state) => ({
        payments: data?.payment ? upsertPaymentRecord(state.payments, data.payment) : state.payments,
        selectedPaymentId: paymentId,
        selectedPaymentStatus: data || null,
      }));
      return data || null;
    } catch (e) {
      console.error('Failed to fetch payment status:', e);
      return null;
    }
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

  createPaymentIntent: async (request: PaymentCreateIntentRequest) => {
    const response = await apiFetch('/payments/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }, 0);
    set((state) => ({
      payments: response?.payment ? upsertPaymentRecord(state.payments, response.payment) : state.payments,
      selectedPaymentId: response?.payment?.id ?? state.selectedPaymentId,
    }));
    return response;
  },

  confirmDemoPayment: async (paymentId: string) => {
    const response = await apiFetch(`/payments/${encodeURIComponent(paymentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm-demo' }),
    }, 0);
    set((state) => ({
      payments: response?.payment ? upsertPaymentRecord(state.payments, response.payment) : state.payments,
      selectedPaymentId: response?.payment?.id ?? state.selectedPaymentId,
      selectedPaymentStatus: response || null,
    }));
    return response?.payment;
  },

  setLastLedgerEntry: (entry) => set({ lastLedgerEntry: entry }),
  addLiveActivity: (activity) => set(state => ({
    liveAgentActivities: [activity, ...state.liveAgentActivities].slice(0, 50)
  })),

  fetchTrustProfiles: async () => {
    try {
      const data = await apiFetch('/trust/profiles');
      set({ trustProfiles: data });
    } catch (e) { console.error('Failed to fetch trust profiles:', e); }
  },

  fetchTrustProfile: async (entityId: string) => {
    try {
      return await apiFetch(`/trust/${encodeURIComponent(entityId)}`);
    } catch (e) { console.error('Failed to fetch trust profile:', e); return null; }
  },

  calculateTrustScore: async (entityType: string, entityId: string) => {
    try {
      await apiFetch('/trust/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId })
      });
      await get().fetchTrustProfiles();
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to calculate trust score:', e); }
  },

  advanceTransactionStage: async (transactionId: string, actorId: string, notes?: string) => {
    try {
      set({ isLoading: true });
      await apiFetch('/transactions/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, actorId, notes })
      });
      await get().fetchTransactions();
      await get().fetchTrustLedger();
      set({ isLoading: false });
    } catch (e) { console.error('Failed to advance transaction:', e); set({ isLoading: false }); }
  },

  fetchTransactionEvents: async (transactionId: string) => {
    try {
      const data = await apiFetch(`/transaction-events?transactionId=${transactionId}`);
      set({ transactionEvents: data });
    } catch (e) { console.error('Failed to fetch transaction events:', e); }
  },

  assignAgent: async (agentId: string, transactionId: string, role: string) => {
    try {
      await apiFetch('/agents/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, transactionId, role })
      });
      await get().fetchAgents();
      await get().fetchTrustLedger();
    } catch (e) { console.error('Failed to assign agent:', e); }
  },

  fetchAgentActivity: async (agentId: string) => {
    try {
      const data = await apiFetch(`/agents/${agentId}/activity`);
      set({ transactionEvents: data });
    } catch (e) { console.error('Failed to fetch agent activity:', e); }
  },

  fetchAuditLedger: async (filters?: Record<string, string>) => {
    try {
      const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
      const data = await apiFetch(`/audit-ledger${params}`);
      set({ auditLedger: data.entries || data, auditLedgerBlockHeight: data.blockHeight || 0 });
    } catch (e) { console.error('Failed to fetch audit ledger:', e); }
  },

  verifyAuditLedger: async () => {
    try {
      const result = await apiFetch('/audit-ledger/verify');
      return result;
    } catch (e) { console.error('Failed to verify audit ledger:', e); }
  },

  fetchAnalytics: async (filters?: Record<string, string>) => {
    try {
      const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
      const data = await apiFetch(`/analytics${params}`);
      set({ analyticsMetrics: data });
    } catch (e) { console.error('Failed to fetch analytics:', e); }
  },

  fetchTransactionStages: async () => {
    try {
      const data = await apiFetch('/transaction-stages');
      set({ transactionStages: data });
    } catch (e) { console.error('Failed to fetch transaction stages:', e); }
  },
}));
