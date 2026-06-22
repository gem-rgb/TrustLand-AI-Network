// TrustLand AI Network - Layout Shell with Sidebar Navigation
'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTrustLandStore, ViewType, type TrustScoreBreakdown } from '@/lib/store';
import { canAccessView, getDashboardRoleLabel, type DashboardRole } from '@/lib/trustland-access';
import {
  Shield, LayoutDashboard, Bot, BookOpen, ArrowRightLeft,
  FileSearch, Star, MessageSquare, Users, Activity,
  ChevronRight, Lock, LogOut, Zap, CheckCircle2, Key, Fingerprint, Loader2,
  ClipboardCheck, AlertTriangle, Clock, Eye, Plus, FileText, Home, Building2, ShoppingCart, Sparkles, Banknote, HandCoins
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import PropertySearchView from './PropertySearchView';
import AuthView from './AuthView';
import AiParcelUpload from './AiParcelUpload';
import FinanceDashboardView from './FinanceDashboardView';
import SellerWithdrawalView from './SellerWithdrawalView';
import TransactionPaymentView from './TransactionPaymentView';

type NavItem = { view: ViewType; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string; roles: DashboardRole[] };

const NAV_ITEMS: Array<NavItem> = [
  { view: 'overview', label: 'Explore Properties', icon: Shield, roles: ['admin', 'buyer', 'seller'] },
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'buyer', 'seller'] },
  { view: 'analytics', label: 'Analytics', icon: Activity, roles: ['admin'] },
  { view: 'agents', label: 'Agent Marketplace', icon: Bot, roles: ['admin'] },
  { view: 'ledger', label: 'Trust Ledger', icon: BookOpen, roles: ['admin'] },
  { view: 'audit-ledger', label: 'Audit Ledger', icon: FileText, roles: ['admin'] },
  { view: 'finance', label: 'Finance', icon: Banknote, roles: ['admin'] },
  { view: 'withdrawals', label: 'Withdrawals', icon: HandCoins, roles: ['seller'] },
  { view: 'diligence', label: 'Due Diligence', icon: FileSearch, roles: ['admin', 'buyer', 'seller'] },
  { view: 'trust-score', label: 'Trust Scores', icon: Star, roles: ['admin', 'buyer', 'seller'] },
  { view: 'trust-engine', label: 'Trust Engine', icon: Zap, badge: 'NEW', roles: ['admin'] },
  { view: 'messages', label: 'Messages', icon: MessageSquare, roles: ['admin', 'buyer', 'seller'] },
  { view: 'identities', label: 'Identities', icon: Users, roles: ['admin'] },
  { view: 'verification', label: 'Verification', icon: ClipboardCheck, roles: ['admin'] },
  { view: 'autonomous-purchase', label: 'Autonomous Purchase', icon: Zap, badge: 'T3', roles: ['buyer'] },
];

// â”€â”€â”€ Error Boundary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class ViewErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">View Error</h2>
          <p className="text-muted-foreground mb-4">{this.state.error?.message || 'An unexpected error occurred'}</p>
          <Button onClick={() => this.setState({ hasError: false, error: null })}>Retry</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TrustLandLayout() {
  const { currentView, setCurrentView, isAuthenticated, dashboardRole, restoreAuthSession, logout, fetchDashboardStats, fetchIdentities, fetchAgents, fetchProperties, fetchTransactions, fetchTrustLedger, fetchDocuments, fetchMessages, fetchAttestations, fetchAuditLedger, fetchAnalytics, fetchTransactionStages, fetchTrustProfiles, fetchPayments, dashboardStats, addLiveActivity } = useTrustLandStore();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const socketRef = useRef<Socket | null>(null);

  // Initial data load â€” staggered to avoid overwhelming the dev server
  const loadAllData = useCallback(async () => {
    const fetchers = [
      fetchDashboardStats, fetchIdentities, fetchAgents, fetchProperties,
      fetchTransactions, fetchTrustLedger, fetchDocuments, fetchMessages,
      fetchAttestations, fetchAuditLedger, fetchAnalytics, fetchTransactionStages, fetchPayments,
      fetchTrustProfiles,
    ];
    // Stagger in batches of 3 to avoid overloading the server
    for (let i = 0; i < fetchers.length; i += 3) {
      const batch = fetchers.slice(i, i + 3);
      await Promise.all(batch.map(fn => fn()));
    }
  }, [fetchDashboardStats, fetchIdentities, fetchAgents, fetchProperties, fetchTransactions, fetchTrustLedger, fetchDocuments, fetchMessages, fetchAttestations, fetchAuditLedger, fetchAnalytics, fetchTransactionStages, fetchTrustProfiles, fetchPayments]);

  useEffect(() => {
    restoreAuthSession();
  }, [restoreAuthSession]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    loadAllData();

    // Connect to WebSocket (with error handling to prevent crashes)
    try {
      const newSocket = io('/?XTransformPort=3000', {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        timeout: 5000,
      });
      socketRef.current = newSocket;

      newSocket.on('connect_error', () => {
        // WebSocket server not available â€” non-critical, app works without it
      });

      newSocket.on('ledger_update', () => {
        fetchTrustLedger();
      });

      newSocket.on('agent_activity', (data: { agentId: string; action: string }) => {
        addLiveActivity({ agentId: data.agentId, action: data.action, timestamp: new Date().toISOString() });
      });

      newSocket.on('document_processed', (data: { fileName: string; verificationStatus: string }) => {
        toast.success(`Document processed: ${data.fileName}`, { description: `Status: ${data.verificationStatus}` });
        fetchDocuments();
      });

      newSocket.on('workflow_step_completed', () => {
        fetchTransactions();
      });

      newSocket.on('agent_message', () => {
        fetchMessages();
      });
    } catch {
      // WebSocket initialization failed â€” non-critical
      socketRef.current = null;
    }

    // Auto-refresh every 30s
    const interval = setInterval(loadAllData, 30000);
    return () => {
      clearInterval(interval);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [isAuthenticated, loadAllData, fetchTrustLedger, fetchDocuments, fetchTransactions, fetchMessages, addLiveActivity]);

  const renderView = () => {
    switch (currentView) {
      case 'overview': return <PropertySearchView />;
      case 'auth': return <AuthView />;
      case 'dashboard': return <DashboardView />;
      case 'agents': return <AgentMarketplace />;
      case 'ledger': return <TrustLedgerView />;
      case 'transactions':
        return dashboardRole === 'buyer'
          ? <AutonomousPurchaseView />
          : dashboardRole === 'seller'
            ? <SellerWithdrawalView />
            : <FinanceDashboardView />;
      case 'finance': return <FinanceDashboardView />;
      case 'withdrawals': return <SellerWithdrawalView />;
      case 'diligence': return <DueDiligenceView />;
      case 'trust-score': return <TrustScoreView />;
      case 'messages': return <MessagesView />;
      case 'identities': return <IdentitiesView />;
      case 'verification': return <VerificationDashboardView />;
      case 'trust-engine': return <TrustEngineView />;
      case 'audit-ledger': return <AuditLedgerDashboard />;
      case 'analytics': return <AnalyticsDashboard />;
      case 'autonomous-purchase': return <AutonomousPurchaseView />;
      default: return <PropertySearchView />;
    }
  };

  if (!isAuthenticated) {
    return (
      <ViewErrorBoundary>
        <AuthView />
      </ViewErrorBoundary>
    );
  }

  if (currentView === 'auth') {
    return (
      <ViewErrorBoundary>
        <AuthView />
      </ViewErrorBoundary>
    );
  }

  // The property search landing view is a full-screen map experience
  // (no left sidebar, dark blue hero) â€” render it standalone, outside
  // the sidebar shell, so it matches the TrustLand product demo layout.
  if (currentView === 'overview') {
    return (
      <ViewErrorBoundary>
        <PropertySearchView />
      </ViewErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#0a1f44] text-white">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} border-r border-white/10 bg-[#0c2350] transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-white/10">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 via-red-500 to-rose-600 flex items-center justify-center flex-shrink-0 shadow-lg">
            <Shield className="h-5 w-5 text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold tracking-tight text-white">TrustLand AI</h1>
              <p className="text-[10px] text-orange-300 tracking-wider uppercase">Terminal 3 Auth Network</p>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-1 px-2">
            {NAV_ITEMS.filter(item => item.roles.includes(dashboardRole) && canAccessView(dashboardRole, item.view)).map(item => (
              <Button
                key={item.view}
                variant={currentView === item.view ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start gap-3 h-9 text-sm border-0',
                  !sidebarOpen && 'px-2',
                  currentView === item.view
                    ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 hover:text-orange-200'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
                onClick={() => setCurrentView(item.view)}
              >
                <item.icon className="h-4 w-4" />
                {sidebarOpen && <span>{item.view === 'dashboard' ? getDashboardRoleLabel(dashboardRole) : item.label}</span>}
                {sidebarOpen && item.badge && <Badge variant="secondary" className="ml-auto text-[10px] bg-orange-500 text-white border-0">{item.badge}</Badge>}
              </Button>
            ))}
          </nav>
        </ScrollArea>

        {/* Status Footer */}
        <div className="p-3 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full mt-2 text-white/60 hover:bg-white/10 hover:text-white',
              !sidebarOpen && 'justify-center px-0'
            )}
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Sign Out</span>}
          </Button>
          {sidebarOpen && dashboardStats && (
            <div className="mt-2 text-[10px] text-white/50 space-y-1">
              <div className="flex items-center gap-1">
                <Lock className="h-3 w-3 text-orange-400" />
                <span>{getDashboardRoleLabel(dashboardRole)} Active</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-orange-400" />
                <span>Ledger Height: {dashboardStats.blockHeight}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-[#0a1f44]">
        <ViewErrorBoundary>
          {renderView()}
        </ViewErrorBoundary>
      </main>

    </div>
  );
}

// â”€â”€â”€ Overview / Hero View (legacy â€” kept for reference, replaced by PropertySearchView) â”€â”€â”€
// @deprecated Use PropertySearchView as the default landing experience.
function OverviewView() {
  const { setCurrentView, dashboardStats } = useTrustLandStore();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTR2MkgyNHYtMmgxMnptMC00djJIMjR2LTJoMTJ6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
        <div className="relative max-w-6xl mx-auto px-6 py-20">
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <Badge variant="outline" className="border-emerald-400 text-emerald-300 text-xs">
              <Lock className="h-3 w-3 mr-1" /> Terminal 3 Agent Auth SDK
            </Badge>
            <Badge variant="outline" className="border-emerald-400 text-emerald-300 text-xs">
              @agent-auth/sdk Integrated
            </Badge>
            <Badge variant="outline" className="border-amber-400 text-amber-300 text-xs">
              <Fingerprint className="h-3 w-3 mr-1" /> Ed25519 Signatures
            </Badge>
            <Badge variant="outline" className="border-emerald-400 text-emerald-300 text-xs">
              Zero-Trust Architecture
            </Badge>
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            TrustLand AI Network
          </h1>
          <p className="text-xl text-emerald-100 max-w-3xl mb-8 leading-relaxed">
            The future of trusted autonomous property transactions. A coordinated network of authenticated AI agents
            that securely act on behalf of verified users while preserving privacy and maintaining cryptographic accountability.
          </p>
          <div className="flex gap-4">
            <Button size="lg" className="bg-gradient-to-r from-orange-500 to-amber-400 text-white hover:from-orange-400 hover:to-amber-300" onClick={() => setCurrentView('dashboard')}>
              <LayoutDashboard className="mr-2 h-5 w-5" /> Open Dashboard
            </Button>
            <Button size="lg" variant="outline" className="border-emerald-400 text-emerald-100 hover:bg-emerald-800" onClick={() => setCurrentView('autonomous-purchase')}>
              <ShoppingCart className="mr-2 h-5 w-5" /> Open Purchase Flow
            </Button>
          </div>
        </div>
      </div>

      {/* Core Features Grid */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold mb-2">Platform Capabilities</h2>
        <p className="text-muted-foreground mb-8">What makes TrustLand different from ordinary AI chatbots</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: <Shield className="h-6 w-6" />, title: 'Terminal 3 Agent Auth', desc: 'Verifiable credentials, agent identities, delegated permissions, and agent-to-agent authentication with cryptographic signatures on every action.', color: 'text-emerald-600' },
            { icon: <Bot className="h-6 w-6" />, title: 'Multi-Agent Orchestration', desc: 'Buyer, Seller, Surveyor, Lawyer, Valuer, Financing, and Registry agents coordinate autonomously through LangGraph-style workflows.', color: 'text-teal-600' },
            { icon: <Star className="h-6 w-6" />, title: 'Dynamic Trust Scores', desc: 'Composite trust scores generated from identity verification, ownership records, transaction behavior, registry validation, and third-party attestations.', color: 'text-amber-600' },
            { icon: <FileSearch className="h-6 w-6" />, title: 'Autonomous Due Diligence', desc: 'AI agents extract data from title deeds, survey maps, and valuation reports, verify consistency, detect anomalies, and generate risk reports automatically.', color: 'text-rose-600' },
            { icon: <BookOpen className="h-6 w-6" />, title: 'Append-Only Trust Ledger', desc: 'Immutable, cryptographically chained ledger storing every agent action, identity proof, permission grant, and transaction approval.', color: 'text-violet-600' },
            { icon: <Lock className="h-6 w-6" />, title: 'Zero-Trust Security', desc: 'RBAC and ABAC authorization, end-to-end encryption, secure audit logs, and signed agent actions ensuring complete accountability.', color: 'text-sky-600' },
          ].map((feature, i) => (
            <div key={i} className="border border-border rounded-xl p-6 hover:shadow-lg transition-shadow">
              <div className={`${feature.color} mb-4`}>{feature.icon}</div>
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Flow Visualization */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <h2 className="text-2xl font-bold mb-2">Autonomous Transaction Flow</h2>
        <p className="text-muted-foreground mb-8">12-step authenticated property transaction workflow</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { step: 1, name: 'Identity Auth', agent: 'Buyer', type: 'authenticate' },
            { step: 2, name: 'Authority Delegation', agent: 'Buyer', type: 'delegate' },
            { step: 3, name: 'Property Search', agent: 'Buyer Agent', type: 'search' },
            { step: 4, name: 'Agent Negotiation', agent: 'Buyer â†” Seller', type: 'negotiate' },
            { step: 5, name: 'Ownership Verification', agent: 'Verification', type: 'verify' },
            { step: 6, name: 'Property Survey', agent: 'Surveyor', type: 'survey' },
            { step: 7, name: 'Market Valuation', agent: 'Valuer', type: 'value' },
            { step: 8, name: 'Legal Review', agent: 'Lawyer', type: 'legal' },
            { step: 9, name: 'Financing Assessment', agent: 'Financing', type: 'finance' },
            { step: 10, name: 'Registry Verification', agent: 'Registry', type: 'register' },
            { step: 11, name: 'Contract Signing', agent: 'Both Parties', type: 'sign' },
            { step: 12, name: 'Transfer Registration', agent: 'Registry', type: 'complete' },
          ].map(s => (
            <div key={s.step} className="border border-border rounded-lg p-3 bg-card">
              <div className="flex items-center gap-2 mb-1">
                <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">{s.step}</span>
                <span className="text-xs font-medium">{s.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{s.agent} Agent</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      {dashboardStats && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border-t border-border">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {[
                { label: 'Trusted Agents', value: dashboardStats.totalAgents },
                { label: 'Properties', value: dashboardStats.properties },
                { label: 'Trust Score Avg', value: `${dashboardStats.averageTrustScore}%` },
                { label: 'Ledger Entries', value: dashboardStats.trustLedgerEntries },
              ].map((s, i) => (
                <div key={i}>
                  <p className="text-3xl font-bold text-emerald-700">{s.value}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Dashboard View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AdminDashboardView() {
  const { dashboardStats, agents, transactions, trustLedger } = useTrustLandStore();

  if (!dashboardStats) return (
    <div className="p-8 text-center text-white">
      <Activity className="h-12 w-12 mx-auto text-orange-400 mb-4 animate-pulse" />
      <h2 className="text-xl font-bold">Loading Dashboard</h2>
      <p className="text-white/60">Connecting to TrustLand AI Network...</p>
    </div>
  );

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Dashboard</h1>
          <p className="text-white/60 text-sm">Real-time monitoring of agents, transactions, and trust infrastructure</p>
        </div>
        <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30">
          <Activity className="h-3 w-3 mr-1" /> Live
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Agents', value: dashboardStats.activeAgents, total: dashboardStats.totalAgents, accent: 'from-orange-500 to-red-500', icon: <Bot className="h-4 w-4" /> },
          { label: 'Active Transactions', value: dashboardStats.activeTransactions, total: dashboardStats.totalTransactions, accent: 'from-blue-500 to-indigo-500', icon: <Activity className="h-4 w-4" /> },
          { label: 'Avg Trust Score', value: `${dashboardStats.averageTrustScore}%`, total: null, accent: 'from-amber-500 to-orange-500', icon: <Shield className="h-4 w-4" /> },
          { label: 'Ledger Block Height', value: dashboardStats.blockHeight, total: null, accent: 'from-emerald-500 to-teal-500', icon: <BookOpen className="h-4 w-4" /> },
        ].map((kpi, i) => (
          <div key={i} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className={cn('absolute -top-8 -right-8 h-20 w-20 rounded-full bg-gradient-to-br opacity-20 blur-xl', kpi.accent)} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/60">{kpi.label}</p>
                <div className={cn('h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-white', kpi.accent)}>
                  {kpi.icon}
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.value}</p>
              {kpi.total !== null && <p className="text-xs text-white/50">of {kpi.total} total</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <div className="border border-white/10 rounded-xl p-5 bg-white/5 backdrop-blur-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-orange-400" /> Agent Status Monitor
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {agents.map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${agent.status === 'active' || agent.status === 'busy' ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/50' : 'bg-white/30'}`} />
                  <div>
                    <p className="text-sm font-medium text-white">{agent.name}</p>
                    <p className="text-xs text-white/50">{agent.agentType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">{agent.status}</Badge>
                  <span className="text-xs font-semibold text-orange-400">{agent.trustScore}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Ledger */}
        <div className="border border-white/10 rounded-xl p-5 bg-white/5 backdrop-blur-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-orange-400" /> Recent Trust Ledger
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {trustLedger.slice(0, 10).map(entry => (
              <div key={entry.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/5 transition">
                <span className="text-[10px] font-mono text-orange-300/80 mt-1 bg-orange-500/10 px-1.5 py-0.5 rounded">#{entry.blockNumber}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate text-white">{entry.eventType.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-white/50 truncate">
                    {entry.actorDid.slice(0, 20)}... â†’ {String(entry.eventData.action ?? entry.eventData.credentialType ?? '')}
                  </p>
                </div>
                <span className="text-[10px] text-white/40 whitespace-nowrap">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Infrastructure Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Verifiable Credentials', value: dashboardStats.verifiableCredentials, icon: <Shield className="h-4 w-4" />, accent: 'text-orange-400' },
          { label: 'Active Permissions', value: dashboardStats.activePermissions, icon: <Lock className="h-4 w-4" />, accent: 'text-blue-400' },
          { label: 'Attestations', value: dashboardStats.attestations, icon: <Star className="h-4 w-4" />, accent: 'text-amber-400' },
          { label: 'Documents', value: dashboardStats.documents, icon: <FileSearch className="h-4 w-4" />, accent: 'text-emerald-400' },
          { label: 'Audit Logs', value: dashboardStats.auditLogs, icon: <BookOpen className="h-4 w-4" />, accent: 'text-violet-400' },
        ].map((s, i) => (
          <div key={i} className="border border-white/10 rounded-lg p-3 text-center bg-white/5 backdrop-blur-sm hover:bg-white/10 transition">
            <div className={`${s.accent} mb-1 flex justify-center`}>{s.icon}</div>
            <p className="text-lg font-bold text-white">{s.value}</p>
            <p className="text-[10px] text-white/50">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€â”€ Agent Marketplace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DashboardView() {
  const { dashboardRole } = useTrustLandStore();

  if (dashboardRole === 'buyer') return <BuyerDashboardView />;
  if (dashboardRole === 'seller') return <SellerDashboardView />;
  return <AdminDashboardView />;
}

function BuyerDashboardView() {
  const { dashboardStats, properties, transactions, messages, setCurrentView, sessionDisplayName, sessionIdentityDid, sessionKycStatus } = useTrustLandStore();

  if (!dashboardStats) {
    return (
      <div className="p-8 text-center text-white">
        <Activity className="h-12 w-12 mx-auto text-orange-400 mb-4 animate-pulse" />
        <h2 className="text-xl font-bold">Loading Buyer Dashboard</h2>
        <p className="text-white/60">Preparing personalized property discovery...</p>
      </div>
    );
  }

  const availableProperties = properties
    .filter(property => property.status !== 'sold' && property.status !== 'off-market')
    .sort((a, b) => b.trustScore - a.trustScore);
  const featuredProperties = availableProperties.slice(0, 6);
  const highTrustMatches = availableProperties.filter(property => property.trustScore >= 90).length;
  const activeTransactions = transactions.filter(tx => tx.status !== 'completed' && tx.status !== 'failed' && tx.status !== 'cancelled').length;
  const buyerMessages = sessionIdentityDid
    ? messages.filter(message => message.senderDid === sessionIdentityDid || message.receiverDid === sessionIdentityDid).length
    : messages.length;

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#102e63] via-[#0c2350] to-[#081a38] p-6 shadow-2xl shadow-orange-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge className="bg-orange-500/20 text-orange-200 border border-orange-500/30">
                <Home className="h-3 w-3 mr-1" /> Buyer Dashboard
              </Badge>
              <Badge className={cn(
                'border',
                sessionKycStatus === 'verified'
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-200 border-amber-500/30'
              )}>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {sessionKycStatus === 'verified' ? 'KYC Verified' : 'KYC Pending'}
              </Badge>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
              Welcome back{sessionDisplayName ? `, ${sessionDisplayName}` : ''}
            </h1>
            <p className="mt-3 text-white/70 max-w-xl">
              Browse verified listings, monitor active deals, and move straight into autonomous purchase flows when you are ready to buy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCurrentView('overview')} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10">
              <Eye className="h-4 w-4 mr-2" /> Explore Market
            </Button>
            <Button onClick={() => setCurrentView('autonomous-purchase')} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0">
              <ShoppingCart className="h-4 w-4 mr-2" /> Open Autonomous Purchase
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Available Listings', value: availableProperties.length, icon: <Building2 className="h-4 w-4" />, accent: 'from-blue-500 to-indigo-500' },
          { label: 'High Trust Matches', value: highTrustMatches, icon: <Star className="h-4 w-4" />, accent: 'from-amber-500 to-orange-500' },
          { label: 'Active Transactions', value: activeTransactions, icon: <ArrowRightLeft className="h-4 w-4" />, accent: 'from-emerald-500 to-teal-500' },
          { label: 'Messages', value: buyerMessages, icon: <MessageSquare className="h-4 w-4" />, accent: 'from-rose-500 to-red-500' },
        ].map((card, index) => (
          <div key={index} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className={cn('absolute -top-8 -right-8 h-20 w-20 rounded-full bg-gradient-to-br opacity-20 blur-xl', card.accent)} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/60">{card.label}</p>
                <div className={cn('h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-white', card.accent)}>
                  {card.icon}
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
              <p className="text-xs text-white/50">Network-synced data</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Recommended for You</h3>
                <p className="text-sm text-white/60">Curated by trust score, availability, and current market activity</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCurrentView('overview')} className="bg-white/5 border-white/15 text-white hover:bg-white/10">
                <Sparkles className="h-4 w-4 mr-2" /> Refine Search
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {featuredProperties.slice(0, 4).map(property => (
                <button
                  key={property.id}
                  onClick={() => setCurrentView('overview')}
                  className="text-left rounded-xl border border-white/10 bg-[#0c2350]/80 p-4 hover:border-orange-500/40 hover:bg-[#102e63] transition group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold group-hover:text-orange-200 transition">{property.title}</p>
                      <p className="text-xs text-white/50 mt-1">{property.city}, {property.region}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">{property.propertyType}</Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-orange-300 font-semibold">{property.currency} {(property.askingPrice / 1_000_000).toFixed(2)}M</span>
                    <span className="text-white/60">Trust {property.trustScore}%</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Autonomous Purchase Pipeline</h3>
                <p className="text-sm text-white/60">Buyer-only workflow for delegated search, negotiation, and execution</p>
              </div>
              <Button size="sm" onClick={() => setCurrentView('autonomous-purchase')} className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white">
                <ShoppingCart className="h-4 w-4 mr-2" /> Start Purchase
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { title: 'Search', description: 'Find verified listings that match your budget and property type.', view: 'overview' as const },
                { title: 'Review', description: 'Run due diligence, compare trust score, and shortlist the best fit.', view: 'diligence' as const },
                { title: 'Execute', description: 'Let the buyer agent negotiate and move into purchase automation.', view: 'autonomous-purchase' as const },
              ].map(step => (
                <div key={step.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs text-white/60 mt-2">{step.description}</p>
                  <Button size="sm" variant="ghost" className="mt-3 px-0 text-orange-300 hover:text-orange-200 hover:bg-transparent" onClick={() => setCurrentView(step.view)}>
                    Open {step.title}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('overview')}>
                <Home className="h-4 w-4 mr-2" /> Open Properties
              </Button>
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('autonomous-purchase')}>
                <ShoppingCart className="h-4 w-4 mr-2" /> Open Purchase Flow
              </Button>
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('messages')}>
                <MessageSquare className="h-4 w-4 mr-2" /> Open Messages
              </Button>
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('diligence')}>
                <FileSearch className="h-4 w-4 mr-2" /> Due Diligence
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-3">Live Market Snapshot</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Average Trust Score</span>
                <span className="font-semibold text-white">{dashboardStats.averageTrustScore}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Total Properties</span>
                <span className="font-semibold text-white">{dashboardStats.properties}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Open Deals</span>
                <span className="font-semibold text-white">{activeTransactions}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Identity Status</span>
                <span className="font-semibold text-emerald-300">{sessionKycStatus === 'verified' ? 'Verified' : 'Pending'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SellerDashboardView() {
  const { dashboardStats, properties, transactions, messages, setCurrentView, sessionDisplayName, sessionIdentityDid, sessionKycStatus } = useTrustLandStore();
  const [aiUploadOpen, setAiUploadOpen] = React.useState(false);

  if (!dashboardStats) {
    return (
      <div className="p-8 text-center text-white">
        <Activity className="h-12 w-12 mx-auto text-orange-400 mb-4 animate-pulse" />
        <h2 className="text-xl font-bold">Loading Seller Dashboard</h2>
        <p className="text-white/60">Preparing your listing workspace...</p>
      </div>
    );
  }

  const ownedProperties = sessionIdentityDid
    ? properties.filter(property => property.ownerDid === sessionIdentityDid)
    : properties.filter(property => property.status !== 'sold' && property.status !== 'off-market');
  const activeOffers = sessionIdentityDid
    ? transactions.filter(tx => tx.sellerDid === sessionIdentityDid && tx.status !== 'completed' && tx.status !== 'failed' && tx.status !== 'cancelled')
    : transactions.filter(tx => tx.status !== 'completed' && tx.status !== 'failed' && tx.status !== 'cancelled');
  const sellerMessages = sessionIdentityDid
    ? messages.filter(message => message.senderDid === sessionIdentityDid || message.receiverDid === sessionIdentityDid)
    : messages;

  return (
    <div className="p-6 space-y-6 text-white">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#112c4d] via-[#0c2350] to-[#081a38] p-6 shadow-2xl shadow-slate-950/20">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge className="bg-teal-500/20 text-teal-200 border border-teal-500/30">
                <Building2 className="h-3 w-3 mr-1" /> Seller Dashboard
              </Badge>
              <Badge className={cn(
                'border',
                sessionKycStatus === 'verified'
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-200 border-amber-500/30'
              )}>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {sessionKycStatus === 'verified' ? 'KYC Verified' : 'KYC Pending'}
              </Badge>
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
              Manage listings{sessionDisplayName ? `, ${sessionDisplayName}` : ''}
            </h1>
            <p className="mt-3 text-white/70 max-w-xl">
              Publish properties with AI assistance, monitor buyer interest, and keep the sales workflow separate from buyer-facing tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCurrentView('overview')} variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10">
              <Eye className="h-4 w-4 mr-2" /> Review Market
            </Button>
            <Button onClick={() => setAiUploadOpen(true)} className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0">
              <Sparkles className="h-4 w-4 mr-2" /> List Property via AI
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'My Listings', value: ownedProperties.length, icon: <Home className="h-4 w-4" />, accent: 'from-teal-500 to-emerald-500' },
          { label: 'Active Offers', value: activeOffers.length, icon: <ArrowRightLeft className="h-4 w-4" />, accent: 'from-blue-500 to-indigo-500' },
          { label: 'Messages', value: sellerMessages.length, icon: <MessageSquare className="h-4 w-4" />, accent: 'from-rose-500 to-red-500' },
          { label: 'Trust Avg', value: `${dashboardStats.averageTrustScore}%`, icon: <Star className="h-4 w-4" />, accent: 'from-amber-500 to-orange-500' },
        ].map((card, index) => (
          <div key={index} className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className={cn('absolute -top-8 -right-8 h-20 w-20 rounded-full bg-gradient-to-br opacity-20 blur-xl', card.accent)} />
            <div className="relative">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/60">{card.label}</p>
                <div className={cn('h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-white', card.accent)}>
                  {card.icon}
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
              <p className="text-xs text-white/50">Sales workspace</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold">My Listings</h3>
                <p className="text-sm text-white/60">Properties tied to your verified seller identity</p>
              </div>
              <Button size="sm" onClick={() => setAiUploadOpen(true)} className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 border-0 text-white">
                <Sparkles className="h-4 w-4 mr-2" /> New AI Listing
              </Button>
            </div>
            {ownedProperties.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {ownedProperties.slice(0, 4).map(property => (
                  <div key={property.id} className="rounded-xl border border-white/10 bg-[#0c2350]/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{property.title}</p>
                        <p className="text-xs text-white/50 mt-1">{property.city}, {property.region}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">{property.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-teal-200 font-semibold">{property.currency} {(property.askingPrice / 1_000_000).toFixed(2)}M</span>
                      <span className="text-white/60">Trust {property.trustScore}%</span>
                    </div>
                    <p className="mt-2 text-xs text-white/55">{property.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-8 text-center">
                <Building2 className="h-10 w-10 mx-auto text-white/30 mb-3" />
                <p className="font-medium">No listings are linked to this seller yet.</p>
                <p className="text-sm text-white/60 mt-1">Use AI parcel upload to publish a new property listing.</p>
                <Button className="mt-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 border-0 text-white" onClick={() => setAiUploadOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-2" /> Launch AI Listing
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Sales Workflow</h3>
                <p className="text-sm text-white/60">Restricted to seller-facing actions and deal management</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCurrentView('withdrawals')} className="bg-white/5 border-white/15 text-white hover:bg-white/10">
                <Banknote className="h-4 w-4 mr-2" /> Open Withdrawals
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { title: 'Publish', description: 'Create or update a property listing with AI-assisted extraction.', view: 'dashboard' as const },
                { title: 'Negotiate', description: 'Review offers, buyer messages, and transaction status.', view: 'messages' as const },
                { title: 'Withdraw', description: 'Track verified payouts and settlement progress.', view: 'withdrawals' as const },
              ].map(step => (
                <div key={step.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs text-white/60 mt-2">{step.description}</p>
                  <Button size="sm" variant="ghost" className="mt-3 px-0 text-teal-200 hover:text-teal-100 hover:bg-transparent" onClick={() => setCurrentView(step.view)}>
                    Open {step.title}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-3">Seller Actions</h3>
            <div className="space-y-2">
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setAiUploadOpen(true)}>
                <Sparkles className="h-4 w-4 mr-2" /> AI Parcel Upload
              </Button>
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('overview')}>
                <Home className="h-4 w-4 mr-2" /> Open Market
              </Button>
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('messages')}>
                <MessageSquare className="h-4 w-4 mr-2" /> Buyer Messages
              </Button>
              <Button className="w-full justify-start bg-white/5 border border-white/10 text-white hover:bg-white/10" variant="outline" onClick={() => setCurrentView('withdrawals')}>
                <Banknote className="h-4 w-4 mr-2" /> Withdrawal Tracker
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <h3 className="text-lg font-semibold mb-3">Seller Snapshot</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Average Trust Score</span>
                <span className="font-semibold text-white">{dashboardStats.averageTrustScore}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Active Offers</span>
                <span className="font-semibold text-white">{activeOffers.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">My Listings</span>
                <span className="font-semibold text-white">{ownedProperties.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Identity Status</span>
                <span className="font-semibold text-emerald-300">{sessionKycStatus === 'verified' ? 'Verified' : 'Pending'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AiParcelUpload open={aiUploadOpen} onClose={() => setAiUploadOpen(false)} />
    </div>
  );
}

function AgentMarketplace() {
  const { agents, identities, delegateAuthority, assignAgent, transactions, fetchAgentActivity, transactionEvents } = useTrustLandStore();
  const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);
  const [delegating, setDelegating] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [selectedTxId, setSelectedTxId] = React.useState<string>('');
  const [assignRole, setAssignRole] = React.useState<string>('');
  const [aiUploadOpen, setAiUploadOpen] = React.useState(false);

  const buyerIdentity = identities.find(i => i.profile.role === 'buyer');

  const handleDelegate = async (agentId: string) => {
    if (!buyerIdentity) return;
    setDelegating(true);
    await delegateAuthority(agentId, buyerIdentity.did, ['search', 'negotiate', 'sign']);
    setDelegating(false);
    toast.success('Authority delegated successfully');
  };

  const handleAssign = async () => {
    if (!selectedAgent || !selectedTxId) return;
    const result = await assignAgent(selectedAgent, selectedTxId, assignRole || 'reviewer');
    setAssignDialogOpen(false);
    toast.success(`Agent assigned to transaction`);
  };

  const agentTypeColors: Record<string, string> = {
    buyer: 'bg-emerald-100 text-emerald-700',
    seller: 'bg-teal-100 text-teal-700',
    surveyor: 'bg-sky-100 text-sky-700',
    lawyer: 'bg-violet-100 text-violet-700',
    valuer: 'bg-amber-100 text-amber-700',
    financing: 'bg-rose-100 text-rose-700',
    registry: 'bg-indigo-100 text-indigo-700',
    verification: 'bg-orange-100 text-orange-700',
  };

  const agentTypes = ['all', ...new Set(agents.map(a => a.agentType))];
  const filteredAgents = typeFilter === 'all' ? agents : agents.filter(a => a.agentType === typeFilter);
  const selectedAgentData = agents.find(a => a.id === selectedAgent);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Marketplace</h1>
          <p className="text-muted-foreground text-sm">Specialized AI agents with verified identities, delegated permissions, and activity tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setAiUploadOpen(true)}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white"
          >
            <Zap className="h-4 w-4 mr-1" /> List Parcel via AI
          </Button>
          <Badge variant="outline" className="border-emerald-500 text-emerald-600"><Bot className="h-3 w-3 mr-1" /> {agents.length} Agents</Badge>
        </div>
      </div>

      <AiParcelUpload open={aiUploadOpen} onClose={() => setAiUploadOpen(false)} />

      {/* Type Filters */}
      <div className="flex gap-2 flex-wrap">
        {agentTypes.map(type => (
          <Button key={type} size="sm" variant={typeFilter === type ? 'default' : 'outline'} className="text-xs h-7 capitalize" onClick={() => setTypeFilter(type)}>
            {type === 'all' ? 'All Types' : type}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Catalog */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAgents.map(agent => (
              <div key={agent.id} className={`border rounded-xl p-5 bg-card transition-shadow hover:shadow-md cursor-pointer ${selectedAgent === agent.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border'}`} onClick={() => setSelectedAgent(agent.id)}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{agent.name}</h3>
                    <Badge className={`text-[10px] mt-1 ${agentTypeColors[agent.agentType] || 'bg-gray-100'}`}>{agent.agentType}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-emerald-600">{agent.trustScore}%</p>
                    <p className="text-[10px] text-muted-foreground">Trust Score</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{agent.description}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {agent.capabilities.map(cap => (
                    <span key={cap} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{cap.replace(/_/g, ' ')}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className={`h-2 w-2 rounded-full ${agent.status === 'active' || agent.status === 'busy' ? 'bg-emerald-500' : agent.status === 'idle' ? 'bg-gray-400' : 'bg-red-500'}`} />
                    <span className="text-[10px] text-muted-foreground">{agent.status}</span>
                    {agent.t3AgentRegistered && (
                      <Badge variant="outline" className="text-[8px] border-emerald-500 text-emerald-600 ml-1"><Lock className="h-2 w-2 mr-0.5" />T3</Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="text-xs h-7" disabled={delegating} onClick={(e) => { e.stopPropagation(); handleDelegate(agent.id); }}>
                      <Lock className="h-3 w-3 mr-1" /> Delegate
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={(e) => { e.stopPropagation(); setSelectedAgent(agent.id); setAssignDialogOpen(true); }}>
                      <Plus className="h-3 w-3 mr-1" /> Assign
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Profile & Activity */}
        <div className="space-y-4">
          {selectedAgentData ? (
            <>
              {/* Profile Card */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <h3 className="font-semibold mb-3">Agent Profile</h3>
                <div className="text-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                    <Bot className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h4 className="font-medium">{selectedAgentData.name}</h4>
                  <Badge className={`text-[10px] mt-1 ${agentTypeColors[selectedAgentData.agentType] || 'bg-gray-100'}`}>{selectedAgentData.agentType}</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Trust Score</span><span className="font-medium text-emerald-600">{selectedAgentData.trustScore}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium">{selectedAgentData.status}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">T3 Registered</span><span className="font-medium">{selectedAgentData.t3AgentRegistered ? 'Yes' : 'No'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last Active</span><span className="font-medium text-xs">{selectedAgentData.lastActiveAt ? new Date(selectedAgentData.lastActiveAt).toLocaleString() : 'Never'}</span></div>
                </div>
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1">T3 Scopes</p>
                  <div className="flex flex-wrap gap-1">
                    {(selectedAgentData.t3Scopes || []).map(scope => (
                      <span key={scope} className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{scope}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Capability Discovery */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <h3 className="font-semibold mb-3">Capabilities</h3>
                <div className="space-y-2">
                  {selectedAgentData.capabilities.map(cap => (
                    <div key={cap} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      <span className="text-xs">{cap.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="border border-border rounded-xl p-10 bg-card text-center text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Select an agent to view profile</p>
            </div>
          )}
        </div>
      </div>

      {/* Assign Agent Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Agent to Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Agent</Label>
              <p className="text-sm font-medium">{selectedAgentData?.name || 'None selected'}</p>
            </div>
            <div>
              <Label>Transaction</Label>
              <Select value={selectedTxId} onValueChange={setSelectedTxId}>
                <SelectTrigger><SelectValue placeholder="Select transaction" /></SelectTrigger>
                <SelectContent>
                  {transactions.map(tx => (
                    <SelectItem key={tx.id} value={tx.id}>Transaction {tx.id.slice(0, 8)}... ({tx.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={assignRole} onValueChange={setAssignRole}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reviewer">Reviewer</SelectItem>
                  <SelectItem value="verifier">Verifier</SelectItem>
                  <SelectItem value="approver">Approver</SelectItem>
                  <SelectItem value="negotiator">Negotiator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleAssign} disabled={!selectedTxId}>Assign Agent</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// â”€â”€â”€ Trust Ledger â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TrustLedgerView() {
  const { trustLedger, fetchTrustLedger } = useTrustLandStore();
  const [filter, setFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [verifying, setVerifying] = React.useState(false);
  const [verifyResult, setVerifyResult] = React.useState<string | null>(null);
  const PAGE_SIZE = 25;

  // Re-fetch on mount in case the user lands here before the initial load finishes
  React.useEffect(() => { fetchTrustLedger(); }, [fetchTrustLedger]);

  const filtered = trustLedger.filter(e => {
    if (filter !== 'all' && e.eventType !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${e.eventType} ${e.actorDid} ${JSON.stringify(e.eventData)} ${e.eventHash}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const eventTypes = ['all', ...new Set(trustLedger.map(e => e.eventType))];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/ledger/verify');
      const data = await res.json();
      if (data.verified) {
        setVerifyResult(`âœ“ Hash-chain verified â€” ${data.blocks ?? filtered.length} blocks intact`);
      } else {
        setVerifyResult(`âœ— Verification failed: ${data.error || 'chain broken'}`);
      }
    } catch (e: any) {
      setVerifyResult(`âœ— Error: ${e.message}`);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trust Ledger</h1>
          <p className="text-muted-foreground text-sm">Append-only, cryptographically chained record of all trust events</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleVerify} disabled={verifying}>
            <Lock className="h-3 w-3 mr-1" /> {verifying ? 'Verifyingâ€¦' : 'Verify Chain'}
          </Button>
          <Badge variant="outline" className="border-emerald-500 text-emerald-600">
            <BookOpen className="h-3 w-3 mr-1" /> {trustLedger.length} Blocks
          </Badge>
        </div>
      </div>

      {verifyResult && (
        <div className={`rounded-lg px-3 py-2 text-sm border ${verifyResult.startsWith('âœ“') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {verifyResult}
        </div>
      )}

      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="relative">
          <FileSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by event type, actor DID, hash, or event dataâ€¦"
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {eventTypes.map(type => (
            <Button key={type} size="sm" variant={filter === type ? 'default' : 'outline'} className="text-xs h-7 capitalize" onClick={() => { setFilter(type); setPage(0); }}>
              {type === 'all' ? 'All Events' : type.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Block</th>
                <th className="text-left p-3 font-medium">Event Type</th>
                <th className="text-left p-3 font-medium">Actor DID</th>
                <th className="text-left p-3 font-medium">Event Data</th>
                <th className="text-left p-3 font-medium">Hash</th>
                <th className="text-left p-3 font-medium">T3 Auth</th>
                <th className="text-left p-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{search ? 'No entries match your search' : 'No ledger entries yet'}</p>
                  </td>
                </tr>
              )}
              {pageItems.map((entry, i) => (
                <tr key={entry.id} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                  <td className="p-3 font-mono">#{entry.blockNumber}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{entry.eventType.replace(/_/g, ' ')}</Badge></td>
                  <td className="p-3 font-mono truncate max-w-[150px]">{entry.actorDid?.slice(0, 24) ?? 'â€”'}â€¦</td>
                  <td className="p-3 truncate max-w-[200px]">{JSON.stringify(entry.eventData).slice(0, 60)}â€¦</td>
                  <td className="p-3 font-mono text-muted-foreground truncate max-w-[120px]">{entry.eventHash?.slice(0, 16) ?? 'â€”'}â€¦</td>
                  <td className="p-3">
                    {entry.t3Attestation?.agentAuthVerified ? (
                      <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-600"><Lock className="h-2.5 w-2.5 mr-0.5" />T3</Badge>
                    ) : (
                      <span className="text-[9px] text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border bg-muted/30 text-xs">
            <span className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}â€“{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span>Page {page + 1} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Transaction Workflow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DueDiligenceView() {
  const { documents, riskReports, uploadDocument, properties, identities, fetchDocuments, fetchRiskReports } = useTrustLandStore();
  const [uploading, setUploading] = React.useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = React.useState<string>('');
  const [selectedDocType, setSelectedDocType] = React.useState<string>('title_deed');
  const [generatingReport, setGeneratingReport] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Pick the first property by default once properties are loaded
  React.useEffect(() => {
    if (properties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties, selectedPropertyId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!selectedPropertyId) {
      toast.error('Please select a property first');
      return;
    }
    setUploading(true);
    try {
      // Read file as data URL (base64) â€” works for any file type
      const reader = new FileReader();
      reader.onload = async () => {
        const fileContent = reader.result as string; // data URL
        const buyerDid = identities.find(i => i.profile.role === 'buyer')?.did
                       || identities[0]?.did
                       || 'did:t3:trustland-anonymous';
        try {
          await uploadDocument({
            propertyId: selectedPropertyId,
            uploaderDid: buyerDid,
            documentType: selectedDocType,
            fileName: file.name,
            fileContent,
            fileSize: file.size,
            mimeType: file.type,
          });
          await fetchDocuments();
          toast.success(`"${file.name}" uploaded & analyzed as ${selectedDocType.replace(/_/g, ' ')}`);
        } catch (err: any) {
          toast.error(err.message || 'Upload failed');
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.onerror = () => {
        toast.error('Failed to read file');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedPropertyId) {
      toast.error('Select a property first');
      return;
    }
    setGeneratingReport(true);
    try {
      // Find a verification-type agent to generate the report
      const verifyAgent = useTrustLandStore.getState().agents.find(a => a.agentType === 'verification')
                       || useTrustLandStore.getState().agents[0];
      const res = await fetch('/api/due-diligence/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          generatedBy: verifyAgent?.identityDid || 'did:t3:trustland-network',
          reportType: 'full',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }
      await fetchRiskReports();
      await fetchDocuments();
      toast.success('Risk assessment report generated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const statusIcons: Record<string, string> = {
    verified: 'âœ“ Verified',
    pending: 'â³ Pending',
    flagged: 'âš  Flagged',
    rejected: 'âœ• Rejected'
  };

  const docTypes = ['title_deed', 'survey_map', 'sale_agreement', 'valuation_report', 'identity_proof', 'bank_statement', 'tax_record'];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autonomous Due Diligence</h1>
          <p className="text-muted-foreground text-sm">AI-powered document analysis, verification, and risk assessment</p>
        </div>
        <Badge variant="outline" className="border-emerald-500 text-emerald-600">
          <FileSearch className="h-3 w-3 mr-1" /> {documents.length} docs Â· {riskReports.length} reports
        </Badge>
      </div>

      {/* Upload Section */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><FileSearch className="h-4 w-4" /> Upload Documents for Analysis</h3>

        {/* Property picker */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs mb-1 block">Property *</Label>
            <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
              <SelectTrigger><SelectValue placeholder="Select a propertyâ€¦" /></SelectTrigger>
              <SelectContent>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} â€” {p.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Document Type</Label>
            <Select value={selectedDocType} onValueChange={setSelectedDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {docTypes.map(t => (
                  <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* File picker + quick upload buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !selectedPropertyId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {uploading ? (
              <><Activity className="h-4 w-4 mr-1 animate-pulse" /> Uploadingâ€¦</>
            ) : (
              <><FileSearch className="h-4 w-4 mr-1" /> Choose File to Upload</>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateReport}
            disabled={generatingReport || !selectedPropertyId}
          >
            {generatingReport ? (
              <><Activity className="h-4 w-4 mr-1 animate-pulse" /> Generatingâ€¦</>
            ) : (
              <><Star className="h-4 w-4 mr-1" /> Generate Risk Report</>
            )}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Accepts PDF, JPG, PNG, DOC, TXT â€” analyzed with OCR + anomaly detection
          </span>
        </div>
      </div>

      {/* Selected property info banner */}
      {selectedPropertyId && (
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
          {(() => {
            const p = properties.find(p => p.id === selectedPropertyId);
            return p ? (
              <>Analyzing documents for <strong>{p.title}</strong> at {p.address}, {p.city} Â· Trust Score {p.trustScore}%</>
            ) : null;
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4">Processed Documents</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet. Upload a file above to start analysis.</p>
            )}
            {documents.map(doc => (
              <div key={doc.id} className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{doc.fileName}</span>
                  <Badge variant={doc.verificationStatus === 'verified' ? 'secondary' : doc.verificationStatus === 'flagged' ? 'destructive' : 'outline'} className="text-[10px]">
                    {statusIcons[doc.verificationStatus]}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px]">{doc.documentType.replace(/_/g, ' ')}</Badge>
                  {doc.ocrConfidence && <span className="text-[10px] text-muted-foreground">OCR: {(doc.ocrConfidence * 100).toFixed(0)}%</span>}
                </div>
                {doc.extractedData && (
                  <div className="p-2 bg-background rounded text-[10px] font-mono overflow-x-auto max-h-32">
                    {JSON.stringify(doc.extractedData, null, 2).slice(0, 300)}
                  </div>
                )}
                {doc.anomalies.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {doc.anomalies.map((a, i) => (
                      <div key={i} className="text-[10px] text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded">âš  {a}</div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2 font-mono">Hash: {doc.fileHash?.slice(0, 32) ?? 'â€”'}â€¦</p>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Reports */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4">Risk Assessment Reports</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {riskReports.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No risk reports yet. Click "Generate Risk Report" above.</p>
            )}
            {riskReports.map(report => (
              <div key={report.id} className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={report.riskLevel === 'low' ? 'secondary' : report.riskLevel === 'medium' ? 'outline' : 'destructive'} className="text-xs">
                    Risk: {report.riskLevel} ({report.riskScore.toFixed(1)}/100)
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{report.reportType}</span>
                </div>

                {/* Risk Score Bar */}
                <div className="w-full bg-muted rounded-full h-2 mb-3">
                  <div className={`h-2 rounded-full ${report.riskLevel === 'low' ? 'bg-emerald-500' : report.riskLevel === 'medium' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${report.riskScore}%` }} />
                </div>

                {/* Findings */}
                <div className="space-y-2">
                  {report.findings.map((finding, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-background">
                      <div className="flex items-center gap-1 mb-1">
                        <Badge variant={finding.severity === 'low' || finding.severity === 'info' ? 'secondary' : 'destructive'} className="text-[9px] h-4">{finding.severity}</Badge>
                        <span className="font-medium">{finding.category}</span>
                      </div>
                      <p className="text-muted-foreground">{finding.description}</p>
                      <p className="text-emerald-600 mt-1">â†’ {finding.recommendation}</p>
                    </div>
                  ))}
                </div>

                {/* Data Sources */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {report.dataSources.map((src, i) => (
                    <span key={i} className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-2 py-0.5 rounded-full">{src}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Trust Score View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TrustScoreView() {
  const { identities, fetchTrustScore } = useTrustLandStore();
  const [selectedDid, setSelectedDid] = React.useState<string | null>(null);
  const [trustData, setTrustData] = React.useState<TrustScoreBreakdown | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleSelect = async (did: string) => {
    setSelectedDid(did);
    setLoading(true);
    const data = await fetchTrustScore(did);
    setTrustData(data);
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Property Trust Scores</h1>
        <p className="text-muted-foreground text-sm">Dynamic trust scores from verified identity, ownership, behavior, and attestations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Identity List */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Select Identity</h3>
          {identities.map(identity => (
            <div key={identity.did} className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedDid === identity.did ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-border hover:bg-muted/50'}`} onClick={() => handleSelect(identity.did)}>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                  {identity.profile.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{identity.profile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{identity.credentialType}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Score Detail */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex items-center justify-center h-64">Calculating trust score...</div>
          ) : trustData ? (
            <div className="space-y-4">
              {/* Main Score */}
              <div className="border border-border rounded-xl p-6 bg-card text-center">
                <div className="inline-flex items-center justify-center h-24 w-24 rounded-full border-4 border-emerald-500 mb-3">
                  <span className="text-3xl font-bold text-emerald-600">{trustData.trustScore}</span>
                </div>
                <h3 className="font-semibold text-lg">Composite Trust Score</h3>
                <p className="text-xs text-muted-foreground font-mono">{selectedDid}</p>
              </div>

              {/* Breakdown */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <h3 className="font-semibold mb-4">Score Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(trustData.breakdown || {}).map(([key, val]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{val.description}</span>
                        <span className="text-sm font-medium">{val.score}/{val.max}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(val.score / val.max) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border rounded-lg p-4 bg-card text-center">
                  <p className="text-2xl font-bold">{trustData.totalTransactions}</p>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </div>
                <div className="border border-border rounded-lg p-4 bg-card text-center">
                  <p className="text-2xl font-bold">{trustData.totalActions}</p>
                  <p className="text-xs text-muted-foreground">Total Actions</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <Star className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Select an identity to view trust score</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Messages View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MessagesView() {
  const { messages, identities, sendMessage, fetchMessages } = useTrustLandStore();
  const [sending, setSending] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [recipient, setRecipient] = React.useState('');
  const [messageType, setMessageType] = React.useState('inquiry');
  const [subject, setSubject] = React.useState('');
  const [content, setContent] = React.useState('');
  const [priority, setPriority] = React.useState('normal');

  const senderIdentity = identities[0]; // Use first identity as sender for now

  const getIdentityName = (did: string) => {
    const id = identities.find(i => i.did === did);
    return id?.profile.name || did.slice(0, 20) + '...';
  };

  const messageTypeColors: Record<string, string> = {
    inquiry: 'bg-sky-100 text-sky-700',
    offer: 'bg-emerald-100 text-emerald-700',
    counter_offer: 'bg-amber-100 text-amber-700',
    verification_request: 'bg-violet-100 text-violet-700',
    approval: 'bg-emerald-100 text-emerald-700',
    rejection: 'bg-red-100 text-red-700',
    notification: 'bg-gray-100 text-gray-700',
  };

  const handleSend = async () => {
    if (!senderIdentity || !recipient || !subject || !content) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSending(true);
    try {
      await sendMessage({
        senderDid: senderIdentity.did,
        receiverDid: recipient,
        messageType,
        subject,
        content: { text: content },
        priority,
      });
      await fetchMessages();
      toast.success('Message sent and signed with Ed25519');
      setComposeOpen(false);
      setRecipient(''); setSubject(''); setContent(''); setMessageType('inquiry'); setPriority('normal');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agent Messages</h1>
          <p className="text-muted-foreground text-sm">Authenticated agent-to-agent communication with cryptographic signatures</p>
        </div>
        <Button
          size="sm"
          onClick={() => setComposeOpen(true)}
          disabled={!senderIdentity}
          className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white"
        >
          <MessageSquare className="h-4 w-4 mr-1" /> New Message
        </Button>
      </div>

      {!senderIdentity && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          No identity available to send messages from. Verify your identity first in the Auth page.
        </div>
      )}

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Signed Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">From (Sender)</Label>
              <Input value={senderIdentity ? `${senderIdentity.profile.name} (${senderIdentity.did.slice(0, 24)}â€¦)` : 'â€”'} disabled />
            </div>
            <div>
              <Label className="text-xs mb-1 block">To (Recipient) *</Label>
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger><SelectValue placeholder="Select recipient identity" /></SelectTrigger>
                <SelectContent>
                  {identities.filter(i => i.did !== senderIdentity?.did).map(i => (
                    <SelectItem key={i.did} value={i.did}>
                      {i.profile.name} â€” {i.credentialType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Message Type</Label>
                <Select value={messageType} onValueChange={setMessageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inquiry">Inquiry</SelectItem>
                    <SelectItem value="offer">Offer</SelectItem>
                    <SelectItem value="counter_offer">Counter Offer</SelectItem>
                    <SelectItem value="verification_request">Verification Request</SelectItem>
                    <SelectItem value="approval">Approval</SelectItem>
                    <SelectItem value="rejection">Rejection</SelectItem>
                    <SelectItem value="notification">Notification</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Subject *</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Offer on 3BR Apartment in Westlands" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Message *</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Write your messageâ€¦" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-muted-foreground">
                <Lock className="h-3 w-3 inline mr-1" />Will be signed with your Ed25519 key
              </p>
              <Button onClick={handleSend} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700">
                {sending ? 'Sendingâ€¦' : 'Send Signed Message'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3 max-h-[700px] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No messages yet. Click "New Message" to start a signed conversation.</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge className={`text-[10px] ${messageTypeColors[msg.messageType] || 'bg-gray-100'}`}>{msg.messageType.replace(/_/g, ' ')}</Badge>
                <span className="text-xs font-medium">{msg.subject}</span>
                {msg.priority === 'high' || msg.priority === 'urgent' ? <Badge variant="destructive" className="text-[10px]">{msg.priority}</Badge> : null}
              </div>
              <span className="text-[10px] text-muted-foreground">{new Date(msg.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-emerald-600">{getIdentityName(msg.senderDid)}</span>
              <span className="text-xs text-muted-foreground">â†’</span>
              <span className="text-xs font-medium text-teal-600">{getIdentityName(msg.receiverDid)}</span>
            </div>
            <div className="p-2 bg-muted rounded text-xs">
              {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2).slice(0, 300)}
            </div>
            <p className="text-[10px] font-mono text-emerald-600 mt-2 truncate">Signed: {msg.signature.slice(0, 40)}...</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€â”€ Identities View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function IdentitiesView() {
  const { identities } = useTrustLandStore();
  const [creating, setCreating] = React.useState(false);

  const credentialTypeColors: Record<string, string> = {
    verified_user: 'bg-emerald-100 text-emerald-700',
    agent: 'bg-sky-100 text-sky-700',
    institution: 'bg-violet-100 text-violet-700',
    government: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Terminal 3 Identities</h1>
          <p className="text-muted-foreground text-sm">Verifiable decentralized identities with cryptographic credentials</p>
        </div>
        <Badge variant="outline" className="border-emerald-500 text-emerald-600"><Shield className="h-3 w-3 mr-1" /> T3 Agent Auth</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {identities.map(identity => (
          <div key={identity.did} className="border border-border rounded-xl p-5 bg-card">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                {identity.profile.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{identity.profile.name}</h3>
                <p className="text-xs text-muted-foreground">{identity.profile.email}</p>
                {identity.profile.organization && <p className="text-xs text-muted-foreground">{identity.profile.organization}</p>}
              </div>
            </div>

            <div className="space-y-2 mb-3">
              <div>
                <p className="text-[10px] text-muted-foreground">Decentralized Identifier (DID)</p>
                <p className="text-[10px] font-mono truncate">{identity.did}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Public Key</p>
                <p className="text-[10px] font-mono truncate">{identity.publicKey.slice(0, 32)}...</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge className={`text-[10px] ${credentialTypeColors[identity.credentialType] || 'bg-gray-100'}`}>{identity.credentialType.replace(/_/g, ' ')}</Badge>
              <Badge variant={identity.status === 'active' ? 'secondary' : 'destructive'} className="text-[10px]">{identity.status}</Badge>
              {identity.verifiedAt && <span className="text-[10px] text-emerald-600">âœ“ Verified</span>}
              {identity.t3Integrated && <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-600"><Lock className="h-2.5 w-2.5 mr-0.5" />T3</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// â”€â”€â”€ Property Verification Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PropertyVerification {
  id: string;
  propertyId: string;
  verifierId: string;
  verificationStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'flagged';
  verificationType: 'ownership' | 'title_deed' | 'land_survey' | 'compliance' | 'full';
  verificationNotes: string;
  createdAt: string;
  updatedAt: string;
  t3AccessTokenJti: string;
  t3AgentAuthVerified: boolean;
  teeAttestationId: string | null;
  signature: string;
  signatureType: string;
  findings: Array<{
    category: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    description: string;
    evidence: string;
    verified: boolean;
  }>;
  documentsReviewed: string[];
  riskScore: number;
}

interface DueDiligenceReport {
  id: string;
  propertyId: string;
  generatedBy: string;
  riskScore: number;
  summary: string;
  findings: Array<{
    id: string;
    category: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    recommendation: string;
    evidence: string[];
    verifiedBy: string;
    t3Attested: boolean;
  }>;
  recommendations: string[];
  createdAt: string;
  verificationIds: string[];
  t3AccessTokenJti: string;
  teeAttestationId: string | null;
  signature: string;
  signatureType: string;
  dataSources: string[];
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
}

function getRiskColor(score: number): string {
  if (score <= 20) return 'text-emerald-600';
  if (score <= 40) return 'text-amber-600';
  if (score <= 70) return 'text-orange-600';
  return 'text-red-600';
}

function getRiskBg(score: number): string {
  if (score <= 20) return 'bg-emerald-500';
  if (score <= 40) return 'bg-amber-500';
  if (score <= 70) return 'bg-orange-500';
  return 'bg-red-500';
}

function getRiskLabel(score: number): string {
  if (score <= 20) return 'Low';
  if (score <= 40) return 'Medium';
  if (score <= 70) return 'High';
  return 'Critical';
}

function VerificationDashboardView() {
  const { properties, agents } = useTrustLandStore();
  const [verifications, setVerifications] = React.useState<PropertyVerification[]>([]);
  const [ddReports, setDdReports] = React.useState<DueDiligenceReport[]>([]);
  const [selectedVerification, setSelectedVerification] = React.useState<PropertyVerification | null>(null);
  const [selectedReport, setSelectedReport] = React.useState<DueDiligenceReport | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'verifications' | 'reports' | 'timeline'>('verifications');

  // Form state
  const [formPropertyId, setFormPropertyId] = React.useState('');
  const [formVerificationType, setFormVerificationType] = React.useState<PropertyVerification['verificationType']>('full');
  const [formNotes, setFormNotes] = React.useState('');
  const [formReportPropertyId, setFormReportPropertyId] = React.useState('');

  const verificationAgent = agents.find(a => a.agentType === 'verification');

  // Fetch verifications and reports
  const fetchVerifications = React.useCallback(async () => {
    try {
      const res = await fetch('/api/verifications');
      if (res.ok) {
        const data = await res.json();
        setVerifications(data);
      }
    } catch (e) { console.error('Failed to fetch verifications:', e); }
  }, []);

  const fetchDdReports = React.useCallback(async () => {
    try {
      const res = await fetch('/api/due-diligence');
      if (res.ok) {
        const data = await res.json();
        setDdReports(data);
      }
    } catch (e) { console.error('Failed to fetch due diligence reports:', e); }
  }, []);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchVerifications(), fetchDdReports()]);
      setLoading(false);
    };
    load();
    const interval = setInterval(() => { fetchVerifications(); fetchDdReports(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchVerifications, fetchDdReports]);

  const handleCreateVerification = async () => {
    if (!formPropertyId) { toast.error('Please select a property'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/verifications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: formPropertyId,
          verifierId: verificationAgent?.id || '',
          verificationType: formVerificationType,
          verificationNotes: formNotes,
        }),
      });
      if (res.ok) {
        toast.success('Verification created successfully');
        setShowCreateDialog(false);
        setFormPropertyId('');
        setFormVerificationType('full');
        setFormNotes('');
        await fetchVerifications();
      } else {
        toast.error('Failed to create verification');
      }
    } catch (e) {
      toast.error('Error creating verification');
    }
    setSubmitting(false);
  };

  const handleGenerateReport = async () => {
    if (!formReportPropertyId) { toast.error('Please select a property'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/due-diligence/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: formReportPropertyId,
          generatedBy: verificationAgent?.identityDid || 'system',
        }),
      });
      if (res.ok) {
        toast.success('Due diligence report generated');
        setShowGenerateDialog(false);
        setFormReportPropertyId('');
        await fetchDdReports();
        await fetchVerifications();
      } else {
        toast.error('Failed to generate report');
      }
    } catch (e) {
      toast.error('Error generating report');
    }
    setSubmitting(false);
  };

  const getPropertyName = (propertyId: string) => {
    const prop = properties.find(p => p.id === propertyId);
    return prop?.title || propertyId.slice(0, 12) + '...';
  };

  const statusColors: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    in_progress: 'bg-amber-100 text-amber-700',
    pending: 'bg-gray-100 text-gray-700',
    failed: 'bg-red-100 text-red-700',
    flagged: 'bg-orange-100 text-orange-700',
  };

  const severityColors: Record<string, string> = {
    info: 'bg-sky-100 text-sky-700',
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  const typeLabels: Record<string, string> = {
    ownership: 'Ownership',
    title_deed: 'Title Deed',
    land_survey: 'Land Survey',
    compliance: 'Compliance',
    full: 'Full Verification',
  };

  // Timeline: merge verifications and reports sorted by date
  const timelineEvents = [
    ...verifications.map(v => ({
      id: v.id,
      type: 'verification' as const,
      status: v.verificationStatus,
      title: `${typeLabels[v.verificationType] || v.verificationType} Verification`,
      propertyId: v.propertyId,
      propertyName: getPropertyName(v.propertyId),
      riskScore: v.riskScore,
      timestamp: v.createdAt,
      t3Verified: v.t3AgentAuthVerified,
    })),
    ...ddReports.map(r => ({
      id: r.id,
      type: 'report' as const,
      status: r.overallRiskLevel === 'low' ? 'completed' : r.overallRiskLevel === 'medium' ? 'in_progress' : 'flagged',
      title: 'Due Diligence Report',
      propertyId: r.propertyId,
      propertyName: getPropertyName(r.propertyId),
      riskScore: r.riskScore,
      timestamp: r.createdAt,
      t3Verified: !!r.t3AccessTokenJti,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Summary stats
  const totalVerifications = verifications.length;
  const completedVerifications = verifications.filter(v => v.verificationStatus === 'completed').length;
  const flaggedVerifications = verifications.filter(v => v.verificationStatus === 'flagged').length;
  const avgRiskScore = verifications.length > 0 ? Math.round(verifications.reduce((s, v) => s + v.riskScore, 0) / verifications.length) : 0;
  const totalReports = ddReports.length;

  if (loading) return <div className="p-8">Loading verification dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Property Verification & Due Diligence</h1>
          <p className="text-muted-foreground text-sm">Verify property ownership, generate due diligence reports, and track risk assessments</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-1" /> New Verification
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Property Verification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select value={formPropertyId} onValueChange={setFormPropertyId}>
                    <SelectTrigger><SelectValue placeholder="Select a property" /></SelectTrigger>
                    <SelectContent>
                      {properties.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.title} â€” {p.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Verification Type</Label>
                  <Select value={formVerificationType} onValueChange={(v) => setFormVerificationType(v as PropertyVerification['verificationType'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Verification</SelectItem>
                      <SelectItem value="ownership">Ownership</SelectItem>
                      <SelectItem value="title_deed">Title Deed</SelectItem>
                      <SelectItem value="land_survey">Land Survey</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Additional notes for this verification..." />
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 text-xs text-emerald-800 dark:text-emerald-200">
                  <Lock className="h-3 w-3 inline mr-1" /> Verification will be authenticated via T3 Agent Auth and signed with Ed25519.
                </div>
                <Button className="w-full" onClick={handleCreateVerification} disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Verification'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4 mr-1" /> Generate Report
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Due Diligence Report</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Property</Label>
                  <Select value={formReportPropertyId} onValueChange={setFormReportPropertyId}>
                    <SelectTrigger><SelectValue placeholder="Select a property" /></SelectTrigger>
                    <SelectContent>
                      {properties.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.title} â€” {p.city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 text-xs text-emerald-800 dark:text-emerald-200">
                  <Lock className="h-3 w-3 inline mr-1" /> Report will include all existing verifications and be signed with Ed25519.
                </div>
                <Button className="w-full" onClick={handleGenerateReport} disabled={submitting}>
                  {submitting ? 'Generating...' : 'Generate Due Diligence Report'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Verifications', value: totalVerifications, color: 'text-emerald-600', icon: <ClipboardCheck className="h-4 w-4" /> },
          { label: 'Completed', value: completedVerifications, color: 'text-teal-600', icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: 'Flagged', value: flaggedVerifications, color: 'text-red-600', icon: <AlertTriangle className="h-4 w-4" /> },
          { label: 'Avg Risk Score', value: avgRiskScore, color: getRiskColor(avgRiskScore), icon: <Activity className="h-4 w-4" /> },
          { label: 'DD Reports', value: totalReports, color: 'text-violet-600', icon: <FileText className="h-4 w-4" /> },
        ].map((kpi, i) => (
          <div key={i} className="border border-border rounded-xl p-4 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-muted-foreground">{kpi.icon}</div>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b border-border pb-2">
        {[
          { key: 'verifications' as const, label: 'Verifications', icon: <ClipboardCheck className="h-4 w-4" /> },
          { key: 'reports' as const, label: 'Due Diligence Reports', icon: <FileText className="h-4 w-4" /> },
          { key: 'timeline' as const, label: 'Timeline', icon: <Clock className="h-4 w-4" /> },
        ].map(tab => (
          <Button key={tab.key} size="sm" variant={activeTab === tab.key ? 'default' : 'ghost'} className="text-xs gap-1" onClick={() => setActiveTab(tab.key)}>
            {tab.icon} {tab.label}
          </Button>
        ))}
      </div>

      {/* Verifications Tab */}
      {activeTab === 'verifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {verifications.length === 0 ? (
              <div className="border border-border rounded-xl p-12 text-center text-muted-foreground">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No verifications yet. Create one to get started.</p>
              </div>
            ) : (
              verifications.map(v => (
                <div
                  key={v.id}
                  className={`border rounded-xl p-4 bg-card cursor-pointer transition-all hover:shadow-md ${selectedVerification?.id === v.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border'}`}
                  onClick={() => setSelectedVerification(v)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold">{getPropertyName(v.propertyId)}</h3>
                      <p className="text-xs text-muted-foreground">{typeLabels[v.verificationType]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${statusColors[v.verificationStatus] || ''}`}>
                        {v.verificationStatus.replace(/_/g, ' ')}
                      </Badge>
                      {v.t3AgentAuthVerified && (
                        <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-600">
                          <Lock className="h-2.5 w-2.5 mr-0.5" />T3
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    {/* Risk Score Indicator */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Risk:</span>
                      <div className="w-20 bg-muted rounded-full h-2">
                        <div className={`h-2 rounded-full ${getRiskBg(v.riskScore)}`} style={{ width: `${v.riskScore}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${getRiskColor(v.riskScore)}`}>{v.riskScore}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {v.findings.length} finding{v.findings.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Verification Detail Panel */}
          <div className="border border-border rounded-xl p-5 bg-card">
            {selectedVerification ? (
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Verification Detail
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Property</p>
                    <p className="text-sm font-medium">{getPropertyName(selectedVerification.propertyId)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Type</p>
                    <p className="text-sm">{typeLabels[selectedVerification.verificationType]}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Status</p>
                    <Badge className={`text-[10px] ${statusColors[selectedVerification.verificationStatus]}`}>
                      {selectedVerification.verificationStatus.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Risk Score</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${getRiskColor(selectedVerification.riskScore)}`}>{selectedVerification.riskScore}</span>
                      <span className="text-xs text-muted-foreground">({getRiskLabel(selectedVerification.riskScore)})</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-1">
                      <div className={`h-2 rounded-full ${getRiskBg(selectedVerification.riskScore)}`} style={{ width: `${selectedVerification.riskScore}%` }} />
                    </div>
                  </div>
                  {selectedVerification.verificationNotes && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Notes</p>
                      <p className="text-xs">{selectedVerification.verificationNotes}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-muted-foreground">T3 Auth</p>
                    <p className="text-[10px] font-mono">{selectedVerification.t3AgentAuthVerified ? 'âœ“ Verified' : 'âœ• Not verified'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Signature</p>
                    <p className="text-[10px] font-mono text-emerald-600 truncate">{selectedVerification.signature.slice(0, 40)}...</p>
                  </div>
                </div>

                {/* Findings */}
                {selectedVerification.findings.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2">Findings</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedVerification.findings.map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-muted/50 text-xs">
                          <div className="flex items-center gap-1 mb-1">
                            <Badge className={`text-[9px] h-4 ${severityColors[f.severity] || ''}`}>{f.severity}</Badge>
                            <span className="font-medium">{f.category}</span>
                          </div>
                          <p className="text-muted-foreground">{f.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground">
                  Created: {new Date(selectedVerification.createdAt).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                <div className="text-center">
                  <Eye className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>Select a verification to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Due Diligence Reports Tab */}
      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {ddReports.length === 0 ? (
              <div className="border border-border rounded-xl p-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No due diligence reports yet. Generate one to get started.</p>
              </div>
            ) : (
              ddReports.map(r => (
                <div
                  key={r.id}
                  className={`border rounded-xl p-4 bg-card cursor-pointer transition-all hover:shadow-md ${selectedReport?.id === r.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-border'}`}
                  onClick={() => setSelectedReport(r)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold">{getPropertyName(r.propertyId)}</h3>
                      <p className="text-xs text-muted-foreground">Due Diligence Report</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.overallRiskLevel === 'low' ? 'secondary' : r.overallRiskLevel === 'medium' ? 'outline' : 'destructive'} className="text-[10px]">
                        {r.overallRiskLevel.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Risk:</span>
                      <div className="w-20 bg-muted rounded-full h-2">
                        <div className={`h-2 rounded-full ${getRiskBg(r.riskScore)}`} style={{ width: `${r.riskScore}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${getRiskColor(r.riskScore)}`}>{r.riskScore}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round(r.confidenceScore * 100)}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {r.findings.length} finding{r.findings.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {r.summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{r.summary}</p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Report Detail Panel */}
          <div className="border border-border rounded-xl p-5 bg-card">
            {selectedReport ? (
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Report Detail
                </h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Property</p>
                    <p className="text-sm font-medium">{getPropertyName(selectedReport.propertyId)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Overall Risk Level</p>
                    <div className="flex items-center gap-2">
                      <Badge variant={selectedReport.overallRiskLevel === 'low' ? 'secondary' : selectedReport.overallRiskLevel === 'medium' ? 'outline' : 'destructive'} className="text-xs">
                        {selectedReport.overallRiskLevel.toUpperCase()}
                      </Badge>
                      <span className={`text-lg font-bold ${getRiskColor(selectedReport.riskScore)}`}>{selectedReport.riskScore}/100</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Confidence Score</p>
                    <div className="w-full bg-muted rounded-full h-2 mt-1">
                      <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${selectedReport.confidenceScore * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{Math.round(selectedReport.confidenceScore * 100)}%</span>
                  </div>
                  {selectedReport.summary && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Summary</p>
                      <p className="text-xs">{selectedReport.summary}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-muted-foreground">Data Sources</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedReport.dataSources.map((src, i) => (
                        <span key={i} className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-2 py-0.5 rounded-full">{src}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Signature</p>
                    <p className="text-[10px] font-mono text-emerald-600 truncate">{selectedReport.signature.slice(0, 40)}...</p>
                  </div>
                </div>

                {/* Findings */}
                {selectedReport.findings.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2">Findings ({selectedReport.findings.length})</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedReport.findings.map((f, i) => (
                        <div key={f.id || i} className="p-2 rounded-lg bg-muted/50 text-xs">
                          <div className="flex items-center gap-1 mb-1">
                            <Badge className={`text-[9px] h-4 ${severityColors[f.severity] || ''}`}>{f.severity}</Badge>
                            <span className="font-medium">{f.title || f.category}</span>
                            {f.t3Attested && (
                              <Badge variant="outline" className="text-[8px] border-emerald-500 text-emerald-600 ml-auto">
                                <Lock className="h-2 w-2 mr-0.5" />T3
                              </Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground">{f.description}</p>
                          {f.recommendation && (
                            <p className="text-emerald-600 mt-1">â†’ {f.recommendation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {selectedReport.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold mb-2">Recommendations</h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {selectedReport.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground">
                  Generated: {new Date(selectedReport.createdAt).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>Select a report to view details</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Verification & Report Timeline
          </h3>
          {timelineEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>No events yet. Create a verification or generate a report.</p>
            </div>
          ) : (
            <div className="space-y-0 max-h-[600px] overflow-y-auto">
              {timelineEvents.map((event, i) => (
                <div key={event.id} className="flex gap-3 pb-4">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0 ${
                      event.status === 'completed' ? 'bg-emerald-500' :
                      event.status === 'in_progress' ? 'bg-amber-500' :
                      event.status === 'flagged' ? 'bg-orange-500' :
                      event.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                    }`}>
                      {event.type === 'verification' ? <ClipboardCheck className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                    {i < timelineEvents.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                  </div>
                  {/* Event content */}
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{event.title}</span>
                        <Badge className={`text-[9px] ${statusColors[event.status] || 'bg-gray-100 text-gray-700'}`}>
                          {event.status.replace(/_/g, ' ')}
                        </Badge>
                        {event.t3Verified && (
                          <Badge variant="outline" className="text-[8px] border-emerald-500 text-emerald-600">
                            <Lock className="h-2 w-2 mr-0.5" />T3
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{event.propertyName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">Risk:</span>
                      <div className="w-16 bg-muted rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${getRiskBg(event.riskScore)}`} style={{ width: `${event.riskScore}%` }} />
                      </div>
                      <span className={`text-[10px] font-medium ${getRiskColor(event.riskScore)}`}>{event.riskScore}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Autonomous Purchase View (The "Wow" Feature) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AutonomousPurchaseView() {
  const {
    identities, properties, createAutonomousDelegation, executeAutonomousPurchase,
    autonomousDelegations, autonomousSteps, autonomousResult, isLoading, fetchAutonomousDelegations
  } = useTrustLandStore();

  const [criteria, setCriteria] = React.useState({
    propertyType: 'agricultural',
    maxPrice: 50000,
    location: 'Nakuru',
  });
  const [step, setStep] = React.useState<'setup' | 'created' | 'executing' | 'result'>('setup');
  const [delegationId, setDelegationId] = React.useState<string | null>(null);

  const buyerIdentity = identities.find(i => i.profile.role === 'buyer');

  React.useEffect(() => {
    fetchAutonomousDelegations();
  }, [fetchAutonomousDelegations]);

  const handleCreate = async () => {
    if (!buyerIdentity) return;
    await createAutonomousDelegation(buyerIdentity.did, buyerIdentity.profile.name, criteria);
    const createdDelegationId = useTrustLandStore.getState().currentDelegationId;
    if (createdDelegationId) {
      setDelegationId(createdDelegationId);
      setStep('created');
    }
  };

  const handleExecute = async () => {
    if (!delegationId) return;
    setStep('executing');
    await executeAutonomousPurchase(delegationId);
    setStep('result');
  };

  // Find matching properties
  const matchingProperties = properties.filter(p =>
    p.propertyType === criteria.propertyType &&
    p.askingPrice <= criteria.maxPrice &&
    p.city.toLowerCase().includes(criteria.location.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500" /> Autonomous Purchase Approval
          </h1>
          <p className="text-muted-foreground text-sm">
            The signature Terminal 3 feature: Delegate authority to an AI agent to autonomously find, verify, and recommend property purchases.
            Every action is signed with Ed25519 and authenticated via T3 Agent Auth.
          </p>
        </div>
        <Badge variant="outline" className="border-amber-500 text-amber-600">
          <Key className="h-3 w-3 mr-1" /> T3 Delegated Authority
        </Badge>
      </div>

      {/* T3 Auth Flow Diagram */}
      <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-5 bg-amber-50 dark:bg-amber-950/20">
        <h3 className="font-semibold mb-3 text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <Fingerprint className="h-4 w-4" /> Terminal 3 Agent Auth Flow
        </h3>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <div className="flex items-center gap-1 bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-800/50">
            <Users className="h-3 w-3" /> <span className="font-medium">User Grants Authority</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-800/50">
            <Key className="h-3 w-3" /> <span className="font-medium">T3 API Key Issued</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-800/50">
            <Lock className="h-3 w-3" /> <span className="font-medium">JWT Access Token</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-emerald-950/30 px-3 py-2 rounded-lg border border-emerald-800/50">
            <Bot className="h-3 w-3" /> <span className="font-medium">Agent Acts Autonomously</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-emerald-950/30 px-3 py-2 rounded-lg border border-emerald-800/50">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" /> <span className="font-medium">Every Step Signed (Ed25519)</span>
          </div>
        </div>
      </div>

      {step === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Criteria Form */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" /> Purchase Criteria
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Define what you want the agent to find. Example: &quot;Buy any verified agricultural land under $50,000 within 10 km of Nakuru&quot;
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Property Type</label>
                <select
                  className="w-full mt-1 p-2 border border-border rounded-lg bg-background text-sm"
                  value={criteria.propertyType}
                  onChange={e => setCriteria(c => ({ ...c, propertyType: e.target.value }))}
                >
                  <option value="agricultural">Agricultural</option>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="industrial">Industrial</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Maximum Price (USD)</label>
                <input
                  type="number"
                  className="w-full mt-1 p-2 border border-border rounded-lg bg-background text-sm"
                  value={criteria.maxPrice}
                  onChange={e => setCriteria(c => ({ ...c, maxPrice: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Location</label>
                <input
                  type="text"
                  className="w-full mt-1 p-2 border border-border rounded-lg bg-background text-sm"
                  value={criteria.location}
                  onChange={e => setCriteria(c => ({ ...c, location: e.target.value }))}
                  placeholder="e.g. Nakuru, Austin, Miami"
                />
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>T3 Delegation:</strong> By creating this, you grant the Buyer Agent a T3 API key and scoped permissions
                  to search, verify, and recommend properties. Every action will be authenticated via Terminal 3 Agent Auth and
                  signed with Ed25519.
                </p>
              </div>

              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                onClick={handleCreate}
                disabled={!buyerIdentity}
              >
                <Key className="h-4 w-4 mr-2" /> Create T3 Delegated Authority
              </Button>
            </div>
          </div>

          {/* Matching Properties Preview */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h3 className="font-semibold mb-4">Matching Properties</h3>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {matchingProperties.length > 0 ? matchingProperties.map(prop => (
                <div key={prop.id} className="p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{prop.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{prop.propertyType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{prop.address}, {prop.city}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-emerald-600">${prop.askingPrice.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">Trust: {prop.trustScore}%</span>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No properties match the current criteria. Try adjusting your search.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'created' && delegationId && (
        <div className="space-y-6">
          {/* Delegation Created */}
          <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 bg-emerald-50 dark:bg-emerald-950/20">
            <h3 className="font-semibold mb-2 text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> T3 Delegation Created Successfully
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-3">
              The Buyer Agent has been issued a Terminal 3 API key and scoped permissions.
              All actions will be authenticated via the @agent-auth/sdk.
            </p>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="bg-emerald-950/30 p-2 rounded border border-emerald-800/50">
                <p className="text-muted-foreground">Delegation ID</p>
                <p className="font-mono truncate">{delegationId.slice(0, 20)}...</p>
              </div>
              <div className="bg-emerald-950/30 p-2 rounded border border-emerald-800/50">
                <p className="text-muted-foreground">T3 API Key</p>
                <p className="font-mono text-emerald-600">Issued âœ“</p>
              </div>
              <div className="bg-emerald-950/30 p-2 rounded border border-emerald-800/50">
                <p className="text-muted-foreground">Signature</p>
                <p className="font-mono text-emerald-600">Ed25519 âœ“</p>
              </div>
            </div>
          </div>

          <Button className="w-full bg-amber-600 hover:bg-amber-700 text-lg py-6" onClick={handleExecute} disabled={isLoading}>
            <Zap className="h-5 w-5 mr-2" />
            {isLoading ? 'Executing Autonomous Purchase...' : 'Execute Autonomous Purchase (7 Steps)'}
          </Button>
        </div>
      )}

      {(step === 'executing' || step === 'result') && (
        <div className="space-y-6">
          {/* Execution Steps */}
          <div className="border border-border rounded-xl p-5 bg-card">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Autonomous Execution Progress
            </h3>
            <div className="space-y-3">
              {autonomousSteps.map((aStep, i) => (
                <div key={aStep.id} className={`border rounded-lg p-4 ${aStep.status === 'active' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : aStep.status === 'completed' ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/10' : 'border-border'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${aStep.status === 'completed' ? 'bg-emerald-500' : aStep.status === 'active' ? 'bg-amber-500' : aStep.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'}`}>
                      {aStep.status === 'completed' ? 'âœ“' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">{aStep.stepName}</h4>
                        <div className="flex items-center gap-2">
                          {aStep.t3AccessTokenJti && (
                            <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-600">
                              <Lock className="h-2.5 w-2.5 mr-0.5" />T3 Auth
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">{aStep.status}</Badge>
                        </div>
                      </div>
                      {aStep.signature && (
                        <p className="text-[10px] font-mono text-emerald-600 mt-1 truncate">
                          Ed25519 Signature: {aStep.signature.slice(0, 40)}...
                        </p>
                      )}
                      {aStep.output && (
                        <div className="mt-2 p-2 bg-muted rounded text-[10px] font-mono overflow-x-auto">
                          {JSON.stringify(aStep.output, null, 2).slice(0, 250)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendation */}
          {autonomousResult && (
            <div className={`border rounded-xl p-6 ${autonomousResult.recommended ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/20'}`}>
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-lg">
                {autonomousResult.recommended ? (
                  <><CheckCircle2 className="h-6 w-6 text-emerald-600" /> Purchase Recommended</>
                ) : (
                  <><Star className="h-6 w-6 text-amber-600" /> Review Required</>
                )}
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-emerald-600">{autonomousResult.matchScore}%</p>
                  <p className="text-xs text-muted-foreground">Match Score</p>
                </div>
                <div className="bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-amber-600">{autonomousResult.trustScore}%</p>
                  <p className="text-xs text-muted-foreground">Trust Score</p>
                </div>
                <div className="bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-lg font-bold">{autonomousResult.riskLevel}</p>
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                </div>
                <div className="bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-emerald-600">{autonomousResult.totalStepsCompleted}/7</p>
                  <p className="text-xs text-muted-foreground">Steps Done</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <h4 className="text-sm font-medium">Agent Reasoning (T3 Authenticated):</h4>
                {autonomousResult.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 p-3 bg-background rounded-lg border border-emerald-800/50">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  All actions signed with Ed25519Signature2020 and authenticated via Terminal 3 Agent Auth SDK
                  {autonomousResult.allActionsSigned && ' âœ“ All signatures verified'}
                </span>
              </div>
              {autonomousResult.transactionId && (
                <div className="mt-4 rounded-lg border border-white/10 bg-[#06122e] p-4 text-sm text-white/80">
                  <p className="font-medium text-white">Backend purchase execution</p>
                  <p className="mt-1">
                    Transaction <span className="font-mono text-orange-300">{autonomousResult.transactionId}</span> moved to{' '}
                    <span className="font-medium text-emerald-300">{autonomousResult.workflowStatus || 'financing'}</span> and is
                    waiting on <span className="font-medium text-amber-300">{autonomousResult.nextRequiredWorkflowStep || 'payment verification'}</span>.
                  </p>
                </div>
              )}
            </div>
          )}

          {autonomousResult?.recommended && autonomousResult.paymentRequired && (autonomousResult.transactionId || delegationId) && (
            <div className="space-y-4">
              <TransactionPaymentView
                parcelId={autonomousResult.propertyId}
                transactionId={autonomousResult.transactionId || delegationId}
                workflowTransactionId={autonomousResult.workflowTransactionId || autonomousResult.transactionId || delegationId}
                defaultPaymentPurpose={autonomousResult.paymentPurpose || 'reservation_deposit'}
                onVerified={() => {
                  toast.success('Payment verified by TrustLand', {
                    description: 'The autonomous purchase workflow can continue once the server verification completes.',
                  });
                }}
              />
            </div>
          )}

          {/* Reset Button */}
          {step === 'result' && (
            <Button variant="outline" className="w-full" onClick={() => { setStep('setup'); setDelegationId(null); }}>
              Start New Autonomous Purchase
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Trust Score Engine View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TrustEngineView() {
  const { trustProfiles, identities, agents, properties, calculateTrustScore, fetchTrustProfiles } = useTrustLandStore();
  const [selectedEntity, setSelectedEntity] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchTrustProfiles();
  }, [fetchTrustProfiles]);

  const getTrustBadgeColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500 text-white';
    if (score >= 60) return 'bg-amber-500 text-white';
    if (score >= 40) return 'bg-orange-500 text-white';
    return 'bg-red-500 text-white';
  };

  const getTrustLabel = (score: number) => {
    if (score >= 80) return 'Highly Trusted';
    if (score >= 60) return 'Trusted';
    if (score >= 40) return 'Moderate';
    return 'Low Trust';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-amber-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const selectedProfile = trustProfiles.find(p => p.entityId === selectedEntity);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trust Score Engine</h1>
          <p className="text-muted-foreground text-sm">Dynamic trust scoring for users, agents, and properties with automatic updates</p>
        </div>
        <Badge variant="outline" className="border-emerald-500 text-emerald-600">
          <Star className="h-3 w-3 mr-1" /> Auto-Updating
        </Badge>
      </div>

      {/* Trust Score Formula */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><Zap className="h-4 w-4" /> Trust Score Formula</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-emerald-600 mb-2">Base Score: 50</p>
            <div className="space-y-1 text-xs">
              <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> +10 Verified Identity</p>
              <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> +10 Verified Ownership</p>
              <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> +15 Successful Transactions</p>
              <p className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> +5 Positive Reviews</p>
            </div>
          </div>
          <div>
            <p className="font-medium text-red-600 mb-2">Penalties</p>
            <div className="space-y-1 text-xs">
              <p className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> -15 Per Dispute</p>
              <p className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> -20 Per Fraud Report</p>
            </div>
          </div>
          <div>
            <p className="font-medium text-violet-600 mb-2">Auto-Updates On</p>
            <div className="space-y-1 text-xs">
              <p>Every verification event</p>
              <p>Every transaction completion</p>
              <p>Every attestation change</p>
              <p>Every dispute resolution</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entity List */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4">Entities</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {/* Users */}
            {identities.map(identity => {
              const profile = trustProfiles.find(p => p.entityId === identity.did);
              const score = profile?.trustScore || 0;
              return (
                <div key={identity.did} className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedEntity === identity.did ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300' : 'bg-muted/50 hover:bg-muted'}`} onClick={() => setSelectedEntity(identity.did)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getTrustBadgeColor(score)}`}>{score}</Badge>
                      <div>
                        <p className="text-sm font-medium">{identity.profile.name}</p>
                        <p className="text-[10px] text-muted-foreground">{identity.credentialType}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">User</span>
                  </div>
                </div>
              );
            })}
            {/* Agents */}
            {agents.map(agent => {
              const profile = trustProfiles.find(p => p.entityId === agent.id);
              const score = profile?.trustScore || agent.trustScore;
              return (
                <div key={agent.id} className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedEntity === agent.id ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300' : 'bg-muted/50 hover:bg-muted'}`} onClick={() => setSelectedEntity(agent.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getTrustBadgeColor(score)}`}>{Math.round(score)}</Badge>
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-[10px] text-muted-foreground">{agent.agentType}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Agent</span>
                  </div>
                </div>
              );
            })}
            {/* Properties */}
            {properties.map(prop => {
              const profile = trustProfiles.find(p => p.entityId === prop.id);
              const score = profile?.trustScore || prop.trustScore;
              return (
                <div key={prop.id} className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedEntity === prop.id ? 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300' : 'bg-muted/50 hover:bg-muted'}`} onClick={() => setSelectedEntity(prop.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getTrustBadgeColor(score)}`}>{Math.round(score)}</Badge>
                      <div>
                        <p className="text-sm font-medium">{prop.title}</p>
                        <p className="text-[10px] text-muted-foreground">{prop.city}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Property</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trust Score Meter & Breakdown */}
        <div className="lg:col-span-2 space-y-6">
          {selectedProfile ? (
            <>
              {/* Trust Score Meter */}
              <div className="border border-border rounded-xl p-6 bg-card text-center">
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Trust Score</h3>
                  <div className="relative inline-flex items-center justify-center">
                    <div className="w-40 h-40 rounded-full border-8 flex items-center justify-center" style={{ borderColor: selectedProfile.trustScore >= 80 ? '#10b981' : selectedProfile.trustScore >= 60 ? '#f59e0b' : selectedProfile.trustScore >= 40 ? '#f97316' : '#ef4444' }}>
                      <div>
                        <p className={`text-4xl font-bold ${getScoreColor(selectedProfile.trustScore)}`}>{Math.round(selectedProfile.trustScore)}</p>
                        <p className="text-xs text-muted-foreground">of 100</p>
                      </div>
                    </div>
                  </div>
                  <Badge className={`mt-3 ${getTrustBadgeColor(selectedProfile.trustScore)}`}>{getTrustLabel(selectedProfile.trustScore)}</Badge>
                  <p className="text-xs text-muted-foreground mt-2">
                    {selectedProfile.entityType === 'user' ? 'User' : selectedProfile.entityType === 'agent' ? 'Agent' : 'Property'} â€¢ Updated {new Date(selectedProfile.lastUpdated).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Trust Breakdown */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <h3 className="font-semibold mb-4">Trust Breakdown</h3>
                <div className="space-y-4">
                  {[
                    { label: 'Identity Verified', value: selectedProfile.scoringFactors.identityVerified, points: 10, type: 'boolean' },
                    { label: 'Ownership Verified', value: selectedProfile.scoringFactors.ownershipVerified, points: 10, type: 'boolean' },
                    { label: 'Completed Transactions', value: selectedProfile.scoringFactors.completedTransactions, points: 15, type: 'count' },
                    { label: 'Positive Reviews', value: selectedProfile.scoringFactors.positiveReviews, points: 5, type: 'count' },
                    { label: 'Account Age', value: selectedProfile.scoringFactors.accountAgeDays, points: 5, type: 'days' },
                    { label: 'Successful Workflows', value: selectedProfile.scoringFactors.successfulWorkflows, points: 15, type: 'count' },
                    { label: 'Verification Accuracy', value: selectedProfile.scoringFactors.verificationAccuracy, points: 10, type: 'percentage' },
                    { label: 'User Rating', value: selectedProfile.scoringFactors.userRating, points: 5, type: 'percentage' },
                    { label: 'Disputes', value: selectedProfile.disputes, points: -15, type: 'penalty' },
                    { label: 'Fraud Reports', value: selectedProfile.fraudReports, points: -20, type: 'penalty' },
                  ].map((factor, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{factor.label}</span>
                        <span className={`text-sm font-medium ${factor.type === 'penalty' ? 'text-red-600' : 'text-emerald-600'}`}>
                          {factor.type === 'boolean' ? (factor.value ? `+${factor.points}` : '+0') :
                           factor.type === 'penalty' ? `${factor.points} Ã— ${factor.value}` :
                           factor.type === 'percentage' ? `+${Math.round(Number(factor.value) * factor.points / 100)}` :
                           factor.type === 'days' ? `+${Math.min(Math.floor(Number(factor.value) / 30), factor.points)}` :
                           `+${Math.min(Number(factor.value) * 5, factor.points)}`}
                        </span>
                      </div>
                      {factor.type === 'boolean' ? (
                        <div className="flex items-center gap-2">
                          {factor.value ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-gray-400" />}
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className={`h-2 rounded-full ${factor.value ? 'bg-emerald-500' : 'bg-gray-300'}`} style={{ width: factor.value ? '100%' : '0%' }} />
                          </div>
                        </div>
                      ) : factor.type === 'penalty' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600">{Number(factor.value)} incident{Number(factor.value) !== 1 ? 's' : ''}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.min(Number(factor.value) * 30, 100)}%` }} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{String(factor.value)}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className={`h-2 rounded-full ${getBarColor(selectedProfile.trustScore)}`} style={{ width: `${Math.min(Number(factor.value) * 20, 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="border border-border rounded-xl p-10 bg-card text-center text-muted-foreground">
              <Star className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Select an entity to view trust score details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Audit Ledger Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AuditLedgerDashboard() {
  const { auditLedger, auditLedgerBlockHeight, fetchAuditLedger, verifyAuditLedger } = useTrustLandStore();
  const [filterAction, setFilterAction] = React.useState<string>('all');
  const [filterResourceType, setFilterResourceType] = React.useState<string>('all');
  const [verificationResult, setVerificationResult] = React.useState<{ valid: boolean; totalEntries: number; invalidBlock: number | null; tamperedEntries: string[] } | null>(null);

  const actions = ['all', ...new Set(auditLedger.map(e => e.action))];
  const resourceTypes = ['all', ...new Set(auditLedger.map(e => e.resourceType))];

  const filtered = auditLedger.filter(e => {
    if (filterAction !== 'all' && e.action !== filterAction) return false;
    if (filterResourceType !== 'all' && e.resourceType !== filterResourceType) return false;
    return true;
  });

  const handleVerify = async () => {
    const result = (await verifyAuditLedger()) as { valid: boolean; totalEntries: number; invalidBlock: number | null; tamperedEntries: string[] } | undefined;
    if (result) setVerificationResult(result);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`/api/audit-ledger/export?format=${format}`);
      const data = await response.json();
      const blob = new Blob([data.data], { type: format === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-ledger-${Date.now()}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Audit ledger exported as ${format.toUpperCase()}`);
    } catch (e) { console.error('Export failed:', e); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Immutable Audit Ledger</h1>
          <p className="text-muted-foreground text-sm">Hash-chain linked, tamper-detectable audit trail with T3 attestation</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500 text-emerald-600">
            <Lock className="h-3 w-3 mr-1" /> Block Height: {auditLedgerBlockHeight}
          </Badge>
          <Button size="sm" variant="outline" className="text-xs" onClick={handleVerify}>
            <Shield className="h-3 w-3 mr-1" /> Verify Chain
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => handleExport('json')}>Export JSON</Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => handleExport('csv')}>Export CSV</Button>
        </div>
      </div>

      {/* Verification Result */}
      {verificationResult && (
        <div className={`border rounded-xl p-4 ${verificationResult.valid ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-red-500 bg-red-50 dark:bg-red-950/20'}`}>
          <div className="flex items-center gap-2">
            {verificationResult.valid ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
            <span className="font-semibold">{verificationResult.valid ? 'Audit Ledger Integrity: VALID' : 'Audit Ledger TAMPERED!'}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{verificationResult.totalEntries} entries verified</p>
          {verificationResult.invalidBlock !== null && <p className="text-sm text-red-600">Invalid block at index: {verificationResult.invalidBlock}</p>}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Filter Action" /></SelectTrigger>
          <SelectContent>
            {actions.map(a => <SelectItem key={a} value={a}>{a === 'all' ? 'All Actions' : a.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterResourceType} onValueChange={setFilterResourceType}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Filter Resource" /></SelectTrigger>
          <SelectContent>
            {resourceTypes.map(r => <SelectItem key={r} value={r}>{r === 'all' ? 'All Resources' : r.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Audit Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">#</th>
                <th className="text-left p-3 font-medium">Action</th>
                <th className="text-left p-3 font-medium">Actor</th>
                <th className="text-left p-3 font-medium">Resource</th>
                <th className="text-left p-3 font-medium">Hash</th>
                <th className="text-left p-3 font-medium">Prev Hash</th>
                <th className="text-left p-3 font-medium">T3</th>
                <th className="text-left p-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((entry, i) => (
                <tr key={entry.id} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                  <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{entry.action.replace(/_/g, ' ')}</Badge></td>
                  <td className="p-3 font-mono truncate max-w-[120px]">{entry.actorId.slice(0, 16)}...</td>
                  <td className="p-3"><span className="text-[10px]">{entry.resourceType}</span> <span className="text-muted-foreground">{entry.resourceId.slice(0, 8)}...</span></td>
                  <td className="p-3 font-mono text-muted-foreground truncate max-w-[100px]">{entry.hash.slice(0, 12)}...</td>
                  <td className="p-3 font-mono text-muted-foreground truncate max-w-[100px]">{entry.previousHash ? entry.previousHash.slice(0, 12) + '...' : 'GENESIS'}</td>
                  <td className="p-3">
                    {entry.t3Attestation?.agentAuthVerified ? (
                      <Badge variant="outline" className="text-[8px] border-emerald-500 text-emerald-600"><Lock className="h-2 w-2 mr-0.5" />T3</Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-muted-foreground">{new Date(entry.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p>No audit entries found</p>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Enterprise Analytics Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AnalyticsDashboard() {
  const { analyticsMetrics, fetchAnalytics, properties } = useTrustLandStore();
  const [regionFilter, setRegionFilter] = React.useState<string>('all');
  const [roleView, setRoleView] = React.useState<string>('admin');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const filters: Record<string, string> = {};
    if (regionFilter !== 'all') filters.region = regionFilter;
    if (roleView !== 'admin') filters.role = roleView;
    setError(null);
    fetchAnalytics(filters).catch((e) => setError(e?.message || 'Failed to load analytics'));
  }, [regionFilter, roleView, fetchAnalytics]);

  const regions = ['all', ...new Set(properties.map(p => p.region))];

  if (error) return (
    <div className="p-8 text-center">
      <AlertTriangle className="h-10 w-10 mx-auto text-amber-500 mb-2" />
      <p className="text-sm text-muted-foreground mb-3">{error}</p>
      <Button size="sm" variant="outline" onClick={() => fetchAnalytics()}>Retry</Button>
    </div>
  );
  if (!analyticsMetrics) return <div className="p-8 text-center text-muted-foreground">
    <Activity className="h-8 w-8 mx-auto mb-2 animate-pulse" /> Loading analyticsâ€¦
  </div>;

  // Role-scoped insights â€” what each role sees in the metrics
  const roleInsights: Record<string, string> = {
    admin: 'Full platform visibility â€” all properties, agents, transactions, and ledger events.',
    government: 'Registry & compliance focus â€” verification rates, flagged properties, and audit ledger integrity.',
    institution: 'Financing focus â€” transaction volume, average prices, and active mortgages in your portfolio.',
    bank: 'Risk & escrow focus â€” trust score distribution, due-diligence reports, and active escrow transactions.',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Analytics Dashboard</h1>
          <p className="text-muted-foreground text-sm">Live metrics, trends, and insights from the TrustLand platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              {regions.map(r => <SelectItem key={r} value={r}>{r === 'all' ? 'All Regions' : r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roleView} onValueChange={setRoleView}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="government">Government</SelectItem>
              <SelectItem value="institution">Institution</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="border-emerald-500 text-emerald-600"><Activity className="h-3 w-3 mr-1" /> Live</Badge>
        </div>
      </div>

      {/* Role insight banner â€” explains what the role filter does */}
      <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-200">
        <strong className="font-medium capitalize">{roleView} View:</strong> {roleInsights[roleView]}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: 'Total Properties', value: analyticsMetrics.totalProperties, color: 'text-emerald-600' },
          { label: 'Verified', value: analyticsMetrics.verifiedProperties, color: 'text-teal-600' },
          { label: 'Verification Rate', value: `${analyticsMetrics.verificationSuccessRate}%`, color: 'text-sky-600' },
          { label: 'Avg Trust Score', value: analyticsMetrics.averageTrustScore, color: 'text-amber-600' },
          { label: 'Active Agents', value: `${analyticsMetrics.activeAgents}/${analyticsMetrics.totalAgents}`, color: 'text-violet-600' },
          { label: 'Transaction Vol.', value: `$${(analyticsMetrics.transactionVolume / 1000000).toFixed(1)}M`, color: 'text-rose-600' },
          { label: 'Audit Entries', value: analyticsMetrics.auditLedgerEntries, color: 'text-indigo-600' },
        ].map((kpi, i) => (
          <div key={i} className="border border-border rounded-xl p-4 bg-card">
            <p className="text-[10px] text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trust Score Trends */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Star className="h-4 w-4" /> Trust Score Trends (7 Days)</h3>
          <div className="space-y-3">
            {analyticsMetrics.trustScoreTrends.map((trend, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{trend.date}</span>
                <div className="flex-1 bg-muted rounded-full h-4 relative">
                  <div className="bg-emerald-500 h-4 rounded-full transition-all flex items-center justify-end pr-2" style={{ width: `${trend.avgScore}%` }}>
                    <span className="text-[9px] text-white font-medium">{trend.avgScore}</span>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground w-16">{trend.transactions} tx</span>
              </div>
            ))}
          </div>
        </div>

        {/* Verification Activity */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Verification Activity (7 Days)</h3>
          <div className="space-y-3">
            {analyticsMetrics.verificationActivity.map((day, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{day.date}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-1 mb-1">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${Math.min(day.verifications * 20, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6">{day.verifications}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${Math.min(day.reports * 25, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-6">{day.reports}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-teal-500" /> Verifications</span>
            <span className="flex items-center gap-1"><div className="w-3 h-2 rounded bg-amber-500" /> Reports</span>
          </div>
        </div>

        {/* Transaction Pipeline */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> Transaction Pipeline</h3>
          <div className="space-y-2">
            {Object.entries(analyticsMetrics.transactionPipeline).map(([stage, count]) => (
              <div key={stage} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 flex-shrink-0 capitalize">{stage.replace(/_/g, ' ')}</span>
                <div className="flex-1 bg-muted rounded-full h-4 relative">
                  <div className="bg-indigo-500 h-4 rounded-full transition-all flex items-center justify-end pr-2" style={{ width: `${Math.max(count * 25, count > 0 ? 8 : 0)}%` }}>
                    {count > 0 && <span className="text-[9px] text-white font-medium">{count}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Risk Distribution</h3>
          <div className="space-y-4">
            {[
              { label: 'Low Risk', count: analyticsMetrics.riskDistribution.low, color: 'bg-emerald-500', pct: analyticsMetrics.riskDistribution.low ? Math.round(analyticsMetrics.riskDistribution.low / Math.max(Object.values(analyticsMetrics.riskDistribution).reduce((a, b) => a + b, 0), 1) * 100) : 0 },
              { label: 'Medium Risk', count: analyticsMetrics.riskDistribution.medium, color: 'bg-amber-500', pct: analyticsMetrics.riskDistribution.medium ? Math.round(analyticsMetrics.riskDistribution.medium / Math.max(Object.values(analyticsMetrics.riskDistribution).reduce((a, b) => a + b, 0), 1) * 100) : 0 },
              { label: 'High Risk', count: analyticsMetrics.riskDistribution.high, color: 'bg-orange-500', pct: analyticsMetrics.riskDistribution.high ? Math.round(analyticsMetrics.riskDistribution.high / Math.max(Object.values(analyticsMetrics.riskDistribution).reduce((a, b) => a + b, 0), 1) * 100) : 0 },
              { label: 'Critical Risk', count: analyticsMetrics.riskDistribution.critical, color: 'bg-red-500', pct: analyticsMetrics.riskDistribution.critical ? Math.round(analyticsMetrics.riskDistribution.critical / Math.max(Object.values(analyticsMetrics.riskDistribution).reduce((a, b) => a + b, 0), 1) * 100) : 0 },
            ].map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm">{item.label}</span>
                  <span className="text-sm font-medium">{item.count} ({item.pct}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div className={`h-3 rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Activity Table */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Bot className="h-4 w-4" /> Agent Activity</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Agent</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Trust Score</th>
                <th className="text-left p-3 font-medium">Actions</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {analyticsMetrics.agentActivity.map((agent, i) => (
                <tr key={agent.agentId} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                  <td className="p-3 font-medium">{agent.name}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{agent.type}</Badge></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-muted rounded-full h-2">
                        <div className={`h-2 rounded-full ${agent.trustScore >= 80 ? 'bg-emerald-500' : agent.trustScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${agent.trustScore}%` }} />
                      </div>
                      <span className="font-medium">{agent.trustScore}%</span>
                    </div>
                  </td>
                  <td className="p-3">{agent.actions}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={`text-[10px] ${agent.status === 'busy' || agent.status === 'active' ? 'border-emerald-500 text-emerald-600' : 'border-gray-400 text-gray-500'}`}>{agent.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
