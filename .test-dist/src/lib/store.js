// TrustLand AI Network - Global State Store (Zustand)
// Updated with Terminal 3 Agent Auth SDK integration
import { create } from 'zustand';
import { canAccessView, deriveDashboardRole } from './trustland-access.js';
const AUTH_SESSION_STORAGE_KEY = 'trustland-auth-session';
const AUTH_VIEW_TYPES = new Set([
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
function isViewType(value) {
    return typeof value === 'string' && AUTH_VIEW_TYPES.has(value);
}
function readAuthSession() {
    if (typeof window === 'undefined')
        return null;
    try {
        const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.isAuthenticated !== 'boolean')
            return null;
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
    }
    catch {
        return null;
    }
}
function writeAuthSession(session) {
    if (typeof window === 'undefined')
        return;
    try {
        window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    catch {
        // Ignore storage failures and keep the in-memory session state.
    }
}
// ─── API Helper ─────────────────────────────────────────────────────────────
const API_BASE = '/api';
function buildAuthHeaders() {
    if (typeof window === 'undefined')
        return {};
    const session = useTrustLandStore.getState();
    if (!session.isAuthenticated)
        return {};
    const headers = {
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
async function apiFetch(path, options, retries = 2) {
    const url = `${API_BASE}${path}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const headers = new Headers(options?.headers || {});
            const authHeaders = buildAuthHeaders();
            Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, value));
            const response = await fetch(url, { ...options, headers });
            if (!response.ok)
                throw new Error(`API Error: ${response.status}`);
            return response.json();
        }
        catch (err) {
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
            else {
                throw err;
            }
        }
    }
    throw new Error('Unreachable');
}
function upsertPaymentRecord(payments, payment) {
    const nextPayments = [...payments.filter((item) => item.id !== payment.id), payment];
    nextPayments.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return nextPayments;
}
// ─── Store ──────────────────────────────────────────────────────────────────
export const useTrustLandStore = create((set, get) => ({
    currentView: 'auth',
    dashboardRole: 'admin',
    sessionIdentityDid: null,
    sessionDisplayName: null,
    sessionKycStatus: 'unverified',
    setCurrentView: (view) => set(state => {
        const requestedView = state.isAuthenticated && view === 'auth' ? 'dashboard' : view;
        const currentView = !state.isAuthenticated
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
        const requestedView = session.currentView && session.currentView !== 'auth'
            ? session.currentView
            : 'dashboard';
        const currentView = authenticated
            ? canAccessView(dashboardRole, requestedView)
                ? requestedView
                : 'dashboard'
            : 'auth';
        const nextState = {
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
        const requestedView = state.currentView === 'auth' ? 'dashboard' : state.currentView;
        const currentView = authenticated
            ? canAccessView(state.dashboardRole, requestedView)
                ? requestedView
                : 'dashboard'
            : 'auth';
        const nextState = {
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
        if (!session)
            return;
        const dashboardRole = deriveDashboardRole(session.dashboardRole);
        const requestedView = session.currentView === 'auth' ? 'dashboard' : session.currentView;
        const currentView = session.isAuthenticated && canAccessView(dashboardRole, requestedView)
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
        }
        catch (e) {
            console.error('Failed to fetch dashboard stats:', e);
        }
    },
    fetchIdentities: async () => {
        try {
            const data = await apiFetch('/identities');
            set({ identities: data });
        }
        catch (e) {
            console.error('Failed to fetch identities:', e);
        }
    },
    fetchAgents: async () => {
        try {
            const data = await apiFetch('/agents');
            set({ agents: data });
        }
        catch (e) {
            console.error('Failed to fetch agents:', e);
        }
    },
    fetchProperties: async () => {
        try {
            const data = await apiFetch('/properties');
            set({ properties: data });
        }
        catch (e) {
            console.error('Failed to fetch properties:', e);
        }
    },
    fetchTransactions: async () => {
        try {
            const data = await apiFetch('/transactions');
            set({ transactions: data });
        }
        catch (e) {
            console.error('Failed to fetch transactions:', e);
        }
    },
    fetchTrustLedger: async () => {
        try {
            const data = await apiFetch('/ledger?limit=100');
            set({ trustLedger: data.entries });
        }
        catch (e) {
            console.error('Failed to fetch trust ledger:', e);
        }
    },
    fetchDocuments: async () => {
        try {
            const data = await apiFetch('/documents');
            set({ documents: data });
        }
        catch (e) {
            console.error('Failed to fetch documents:', e);
        }
    },
    fetchRiskReports: async () => {
        try {
            const data = await apiFetch('/risk-reports');
            set({ riskReports: data });
        }
        catch (e) {
            console.error('Failed to fetch risk reports:', e);
        }
    },
    fetchMessages: async () => {
        try {
            const data = await apiFetch('/messages');
            set({ messages: data });
        }
        catch (e) {
            console.error('Failed to fetch messages:', e);
        }
    },
    fetchAttestations: async () => {
        try {
            const data = await apiFetch('/attestations');
            set({ attestations: data });
        }
        catch (e) {
            console.error('Failed to fetch attestations:', e);
        }
    },
    fetchPayments: async (filters) => {
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
        }
        catch (e) {
            console.error('Failed to fetch payments:', e);
        }
    },
    fetchPaymentStatus: async (paymentId) => {
        try {
            const data = await apiFetch(`/payments/${encodeURIComponent(paymentId)}`);
            set((state) => ({
                payments: data?.payment ? upsertPaymentRecord(state.payments, data.payment) : state.payments,
                selectedPaymentId: paymentId,
                selectedPaymentStatus: data || null,
            }));
            return data || null;
        }
        catch (e) {
            console.error('Failed to fetch payment status:', e);
            return null;
        }
    },
    fetchTransactionDetail: async (id) => {
        try {
            const data = await apiFetch(`/transactions/${id}`);
            if (data.workflow) {
                set(state => ({ workflows: [...state.workflows.filter(w => w.id !== data.workflow.id), data.workflow] }));
            }
            set({ selectedTransactionId: id });
        }
        catch (e) {
            console.error('Failed to fetch transaction detail:', e);
        }
    },
    fetchTrustScore: async (did) => {
        try {
            return await apiFetch(`/trust-score/${encodeURIComponent(did)}`);
        }
        catch (e) {
            console.error('Failed to fetch trust score:', e);
            return null;
        }
    },
    advanceWorkflow: async (workflowId, stepIndex) => {
        try {
            set({ isLoading: true });
            const data = await apiFetch(`/workflows/${workflowId}/advance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stepIndex, outputData: { completed: true, timestamp: new Date().toISOString() } })
            });
            const state = get();
            if (state.selectedTransactionId)
                await state.fetchTransactionDetail(state.selectedTransactionId);
            await state.fetchTransactions();
            await state.fetchTrustLedger();
            set({ isLoading: false });
        }
        catch (e) {
            console.error('Failed to advance workflow:', e);
            set({ isLoading: false });
        }
    },
    uploadDocument: async (data) => {
        try {
            await apiFetch('/documents/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            await get().fetchDocuments();
            await get().fetchTrustLedger();
        }
        catch (e) {
            console.error('Failed to upload document:', e);
        }
    },
    sendMessage: async (data) => {
        try {
            await apiFetch('/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            await get().fetchMessages();
            await get().fetchTrustLedger();
        }
        catch (e) {
            console.error('Failed to send message:', e);
        }
    },
    delegateAuthority: async (agentId, granterDid, permissionTypes) => {
        try {
            await apiFetch(`/agents/${agentId}/delegate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ granterDid, permissionTypes })
            });
            await get().fetchTrustLedger();
        }
        catch (e) {
            console.error('Failed to delegate authority:', e);
        }
    },
    // ── Autonomous Purchase Actions ──
    createAutonomousDelegation: async (granterDid, granterName, criteria) => {
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
        }
        catch (e) {
            console.error('Failed to create autonomous delegation:', e);
            set({ isLoading: false });
        }
    },
    executeAutonomousPurchase: async (delegationId) => {
        try {
            set({ isLoading: true });
            const result = await apiFetch('/t3/autonomous/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delegationId })
            });
            set({
                autonomousSteps: result.steps || [],
                autonomousResult: result.recommendation ? {
                    ...result.recommendation,
                    transactionId: result.transactionId || null,
                    workflowTransactionId: result.workflowTransactionId || result.transactionId || null,
                    workflowStatus: result.workflowStatus || null,
                    nextRequiredWorkflowStep: result.nextRequiredWorkflowStep || null,
                    paymentPurpose: result.paymentPurpose || null,
                    paymentRequired: Boolean(result.paymentRequired),
                } : null,
                selectedTransactionId: result.transactionId || null,
                isLoading: false,
            });
            await get().fetchTransactions();
            await get().fetchTrustLedger();
        }
        catch (e) {
            console.error('Failed to execute autonomous purchase:', e);
            set({ isLoading: false });
        }
    },
    fetchAutonomousDelegations: async () => {
        try {
            const data = await apiFetch('/t3/autonomous/delegations');
            set({ autonomousDelegations: data });
        }
        catch (e) {
            console.error('Failed to fetch autonomous delegations:', e);
        }
    },
    createPaymentIntent: async (request) => {
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
    confirmDemoPayment: async (paymentId) => {
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
        }
        catch (e) {
            console.error('Failed to fetch trust profiles:', e);
        }
    },
    fetchTrustProfile: async (entityId) => {
        try {
            return await apiFetch(`/trust/${encodeURIComponent(entityId)}`);
        }
        catch (e) {
            console.error('Failed to fetch trust profile:', e);
            return null;
        }
    },
    calculateTrustScore: async (entityType, entityId) => {
        try {
            await apiFetch('/trust/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entityType, entityId })
            });
            await get().fetchTrustProfiles();
            await get().fetchTrustLedger();
        }
        catch (e) {
            console.error('Failed to calculate trust score:', e);
        }
    },
    advanceTransactionStage: async (transactionId, actorId, notes) => {
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
        }
        catch (e) {
            console.error('Failed to advance transaction:', e);
            set({ isLoading: false });
        }
    },
    fetchTransactionEvents: async (transactionId) => {
        try {
            const data = await apiFetch(`/transaction-events?transactionId=${transactionId}`);
            set({ transactionEvents: data });
        }
        catch (e) {
            console.error('Failed to fetch transaction events:', e);
        }
    },
    assignAgent: async (agentId, transactionId, role) => {
        try {
            await apiFetch('/agents/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, transactionId, role })
            });
            await get().fetchAgents();
            await get().fetchTrustLedger();
        }
        catch (e) {
            console.error('Failed to assign agent:', e);
        }
    },
    fetchAgentActivity: async (agentId) => {
        try {
            const data = await apiFetch(`/agents/${agentId}/activity`);
            set({ transactionEvents: data });
        }
        catch (e) {
            console.error('Failed to fetch agent activity:', e);
        }
    },
    fetchAuditLedger: async (filters) => {
        try {
            const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
            const data = await apiFetch(`/audit-ledger${params}`);
            set({ auditLedger: data.entries || data, auditLedgerBlockHeight: data.blockHeight || 0 });
        }
        catch (e) {
            console.error('Failed to fetch audit ledger:', e);
        }
    },
    verifyAuditLedger: async () => {
        try {
            const result = await apiFetch('/audit-ledger/verify');
            return result;
        }
        catch (e) {
            console.error('Failed to verify audit ledger:', e);
        }
    },
    fetchAnalytics: async (filters) => {
        try {
            const params = filters ? '?' + new URLSearchParams(filters).toString() : '';
            const data = await apiFetch(`/analytics${params}`);
            set({ analyticsMetrics: data });
        }
        catch (e) {
            console.error('Failed to fetch analytics:', e);
        }
    },
    fetchTransactionStages: async () => {
        try {
            const data = await apiFetch('/transaction-stages');
            set({ transactionStages: data });
        }
        catch (e) {
            console.error('Failed to fetch transaction stages:', e);
        }
    },
}));
