// TrustLand AI Network - Layout Shell with Sidebar Navigation
'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTrustLandStore, ViewType } from '@/lib/store';
import {
  Shield, LayoutDashboard, Bot, BookOpen, ArrowRightLeft,
  FileSearch, Star, MessageSquare, Users, Activity,
  ChevronRight, Lock, Zap, CheckCircle2, Key, Fingerprint
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';

const NAV_ITEMS: Array<{ view: ViewType; label: string; icon: React.ReactNode; badge?: string }> = [
  { view: 'overview', label: 'Overview', icon: <Shield className="h-4 w-4" /> },
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { view: 'agents', label: 'Agent Marketplace', icon: <Bot className="h-4 w-4" /> },
  { view: 'ledger', label: 'Trust Ledger', icon: <BookOpen className="h-4 w-4" /> },
  { view: 'transactions', label: 'Transactions', icon: <ArrowRightLeft className="h-4 w-4" /> },
  { view: 'diligence', label: 'Due Diligence', icon: <FileSearch className="h-4 w-4" /> },
  { view: 'trust-score', label: 'Trust Scores', icon: <Star className="h-4 w-4" /> },
  { view: 'messages', label: 'Messages', icon: <MessageSquare className="h-4 w-4" /> },
  { view: 'identities', label: 'Identities', icon: <Users className="h-4 w-4" /> },
  { view: 'autonomous-purchase', label: 'Autonomous Purchase', icon: <Zap className="h-4 w-4" />, badge: 'T3' },
];

export default function TrustLandLayout() {
  const { currentView, setCurrentView, fetchDashboardStats, fetchIdentities, fetchAgents, fetchProperties, fetchTransactions, fetchTrustLedger, fetchDocuments, fetchMessages, fetchAttestations, dashboardStats, addLiveActivity } = useTrustLandStore();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const socketRef = useRef<Socket | null>(null);

  // Initial data load
  const loadAllData = useCallback(async () => {
    await Promise.all([
      fetchDashboardStats(),
      fetchIdentities(),
      fetchAgents(),
      fetchProperties(),
      fetchTransactions(),
      fetchTrustLedger(),
      fetchDocuments(),
      fetchMessages(),
      fetchAttestations(),
    ]);
  }, [fetchDashboardStats, fetchIdentities, fetchAgents, fetchProperties, fetchTransactions, fetchTrustLedger, fetchDocuments, fetchMessages, fetchAttestations]);

  useEffect(() => {
    loadAllData();

    // Connect to WebSocket
    const newSocket = io('/?XTransformPort=3030', { transports: ['websocket', 'polling'] });
    socketRef.current = newSocket;

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

    // Auto-refresh every 30s
    const interval = setInterval(loadAllData, 30000);
    return () => {
      clearInterval(interval);
      newSocket.disconnect();
    };
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'overview': return <OverviewView />;
      case 'dashboard': return <DashboardView />;
      case 'agents': return <AgentMarketplace />;
      case 'ledger': return <TrustLedgerView />;
      case 'transactions': return <TransactionWorkflow />;
      case 'diligence': return <DueDiligenceView />;
      case 'trust-score': return <TrustScoreView />;
      case 'messages': return <MessagesView />;
      case 'identities': return <IdentitiesView />;
      case 'autonomous-purchase': return <AutonomousPurchaseView />;
      default: return <OverviewView />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} border-r border-border bg-card transition-all duration-300 flex flex-col`}>
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-white" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold tracking-tight">TrustLand AI</h1>
              <p className="text-[10px] text-muted-foreground">Terminal 3 Auth Network</p>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-1 px-2">
            {NAV_ITEMS.map(item => (
              <Button
                key={item.view}
                variant={currentView === item.view ? 'secondary' : 'ghost'}
                className={`w-full justify-start gap-3 h-9 text-sm ${!sidebarOpen ? 'px-2' : ''}`}
                onClick={() => setCurrentView(item.view)}
              >
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && item.badge && <Badge variant="secondary" className="ml-auto text-[10px]">{item.badge}</Badge>}
              </Button>
            ))}
          </nav>
        </ScrollArea>

        {/* Status Footer */}
        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
          </Button>
          {sidebarOpen && dashboardStats && (
            <div className="mt-2 text-[10px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1">
                <Lock className="h-3 w-3 text-emerald-500" />
                <span>Zero-Trust Active</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-emerald-500" />
                <span>Ledger Height: {dashboardStats.blockHeight}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {renderView()}
      </main>

      <Toaster />
    </div>
  );
}

// ─── Overview / Hero View ──────────────────────────────────────────────────

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
            <Button size="lg" className="bg-white text-emerald-900 hover:bg-emerald-50" onClick={() => setCurrentView('dashboard')}>
              <LayoutDashboard className="mr-2 h-5 w-5" /> Open Dashboard
            </Button>
            <Button size="lg" variant="outline" className="border-emerald-400 text-emerald-100 hover:bg-emerald-800" onClick={() => setCurrentView('transactions')}>
              <ArrowRightLeft className="mr-2 h-5 w-5" /> View Transaction
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
            { step: 4, name: 'Agent Negotiation', agent: 'Buyer ↔ Seller', type: 'negotiate' },
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

// ─── Dashboard View ────────────────────────────────────────────────────────

function DashboardView() {
  const { dashboardStats, agents, transactions, trustLedger } = useTrustLandStore();

  if (!dashboardStats) return <div className="p-8">Loading dashboard...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Dashboard</h1>
          <p className="text-muted-foreground text-sm">Real-time monitoring of agents, transactions, and trust infrastructure</p>
        </div>
        <Badge variant="outline" className="border-emerald-500 text-emerald-600"><Activity className="h-3 w-3 mr-1" /> Live</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Agents', value: dashboardStats.activeAgents, total: dashboardStats.totalAgents, color: 'text-emerald-600' },
          { label: 'Active Transactions', value: dashboardStats.activeTransactions, total: dashboardStats.totalTransactions, color: 'text-teal-600' },
          { label: 'Avg Trust Score', value: `${dashboardStats.averageTrustScore}%`, total: null, color: 'text-amber-600' },
          { label: 'Ledger Block Height', value: dashboardStats.blockHeight, total: null, color: 'text-violet-600' },
        ].map((kpi, i) => (
          <div key={i} className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.total !== null && <p className="text-xs text-muted-foreground">of {kpi.total} total</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent Status */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Bot className="h-4 w-4" /> Agent Status Monitor</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {agents.map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${agent.status === 'active' || agent.status === 'busy' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.agentType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{agent.status}</Badge>
                  <span className="text-xs font-medium text-emerald-600">{agent.trustScore}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Ledger */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><BookOpen className="h-4 w-4" /> Recent Trust Ledger</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {trustLedger.slice(0, 10).map(entry => (
              <div key={entry.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                <span className="text-[10px] font-mono text-muted-foreground mt-1">#{entry.blockNumber}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{entry.eventType.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {entry.actorDid.slice(0, 20)}... → {entry.eventData.action || entry.eventData.credentialType || ''}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Infrastructure Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Verifiable Credentials', value: dashboardStats.verifiableCredentials, icon: <Shield className="h-4 w-4" /> },
          { label: 'Active Permissions', value: dashboardStats.activePermissions, icon: <Lock className="h-4 w-4" /> },
          { label: 'Attestations', value: dashboardStats.attestations, icon: <Star className="h-4 w-4" /> },
          { label: 'Documents', value: dashboardStats.documents, icon: <FileSearch className="h-4 w-4" /> },
          { label: 'Audit Logs', value: dashboardStats.auditLogs, icon: <BookOpen className="h-4 w-4" /> },
        ].map((s, i) => (
          <div key={i} className="border border-border rounded-lg p-3 text-center bg-card">
            <div className="text-muted-foreground mb-1 flex justify-center">{s.icon}</div>
            <p className="text-lg font-bold">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Marketplace ─────────────────────────────────────────────────────

function AgentMarketplace() {
  const { agents, identities, delegateAuthority } = useTrustLandStore();
  const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);
  const [delegating, setDelegating] = React.useState(false);

  const buyerIdentity = identities.find(i => i.profile.role === 'buyer');

  const handleDelegate = async (agentId: string) => {
    if (!buyerIdentity) return;
    setDelegating(true);
    await delegateAuthority(agentId, buyerIdentity.did, ['search', 'negotiate', 'sign']);
    setDelegating(false);
    toast.success('Authority delegated successfully');
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Marketplace</h1>
        <p className="text-muted-foreground text-sm">Specialized AI agents with verified identities and delegated permissions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
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
              <Button size="sm" variant="outline" className="text-xs h-7" disabled={delegating} onClick={(e) => { e.stopPropagation(); handleDelegate(agent.id); }}>
                <Lock className="h-3 w-3 mr-1" /> Delegate
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Trust Ledger ──────────────────────────────────────────────────────────

function TrustLedgerView() {
  const { trustLedger } = useTrustLandStore();
  const [filter, setFilter] = React.useState<string>('all');

  const filtered = filter === 'all' ? trustLedger : trustLedger.filter(e => e.eventType === filter);
  const eventTypes = ['all', ...new Set(trustLedger.map(e => e.eventType))];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trust Ledger</h1>
          <p className="text-muted-foreground text-sm">Append-only, cryptographically chained record of all trust events</p>
        </div>
        <Badge variant="outline" className="border-emerald-500 text-emerald-600">
          <Lock className="h-3 w-3 mr-1" /> Immutable
        </Badge>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {eventTypes.map(type => (
          <Button key={type} size="sm" variant={filter === type ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilter(type)}>
            {type.replace(/_/g, ' ')}
          </Button>
        ))}
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
              {filtered.map((entry, i) => (
                <tr key={entry.id} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                  <td className="p-3 font-mono">#{entry.blockNumber}</td>
                  <td className="p-3"><Badge variant="outline" className="text-[10px]">{entry.eventType.replace(/_/g, ' ')}</Badge></td>
                  <td className="p-3 font-mono truncate max-w-[150px]">{entry.actorDid.slice(0, 24)}...</td>
                  <td className="p-3 truncate max-w-[200px]">{JSON.stringify(entry.eventData).slice(0, 60)}...</td>
                  <td className="p-3 font-mono text-muted-foreground truncate max-w-[120px]">{entry.eventHash.slice(0, 16)}...</td>
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
      </div>
    </div>
  );
}

// ─── Transaction Workflow ──────────────────────────────────────────────────

function TransactionWorkflow() {
  const { transactions, properties, agents, identities, workflows, advanceWorkflow, isLoading, fetchTransactionDetail } = useTrustLandStore();
  const [selectedTxId, setSelectedTxId] = React.useState<string | null>(transactions.length > 0 ? transactions[0].id : null);

  // Auto-select first transaction
  React.useEffect(() => {
    if (!selectedTxId && transactions.length > 0) {
      setSelectedTxId(transactions[0].id);
    }
  }, [transactions, selectedTxId]);

  // Fetch transaction detail when selected
  React.useEffect(() => {
    if (selectedTxId) {
      fetchTransactionDetail(selectedTxId);
    }
  }, [selectedTxId, fetchTransactionDetail]);

  const selectedTx = transactions.find(t => t.id === selectedTxId);
  const workflow = selectedTx ? workflows.find(w => w.transactionId === selectedTx.id) : null;
  const property = selectedTx ? properties.find(p => p.id === selectedTx.propertyId) : null;

  const statusColors: Record<string, string> = {
    completed: 'bg-emerald-500',
    active: 'bg-amber-500',
    pending: 'bg-gray-300',
    failed: 'bg-red-500',
    skipped: 'bg-gray-400',
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transaction Workflow</h1>
        <p className="text-muted-foreground text-sm">12-step autonomous property transaction with signed agent actions</p>
      </div>

      {/* Transaction List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Transactions</h3>
          {transactions.map(tx => {
            const prop = properties.find(p => p.id === tx.propertyId);
            return (
              <div key={tx.id} className={`border rounded-lg p-3 cursor-pointer transition-colors ${selectedTxId === tx.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-border hover:bg-muted/50'}`} onClick={() => { setSelectedTxId(tx.id); fetchTransactionDetail(tx.id); }}>
                <p className="text-sm font-medium">{prop?.title || 'Property'}</p>
                <p className="text-xs text-muted-foreground">{tx.status.replace(/_/g, ' ')}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-medium">${(tx.amount / 1000000).toFixed(2)}M</span>
                  <Badge variant={tx.riskLevel === 'low' ? 'secondary' : tx.riskLevel === 'medium' ? 'outline' : 'destructive'} className="text-[10px]">{tx.riskLevel}</Badge>
                </div>
              </div>
            );
          })}
        </div>

        {/* Workflow Steps */}
        <div className="lg:col-span-3">
          {workflow && selectedTx ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{property?.title}</h3>
                  <p className="text-xs text-muted-foreground">Step {selectedTx.currentStep} of {selectedTx.totalSteps}</p>
                </div>
                <Badge variant="outline" className="border-emerald-500 text-emerald-600">{selectedTx.status.replace(/_/g, ' ')}</Badge>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(selectedTx.currentStep / selectedTx.totalSteps) * 100}%` }} />
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {workflow.steps.map((step, i) => {
                  const agent = step.agentId ? agents.find(a => a.id === step.agentId) : null;
                  return (
                    <div key={step.id} className={`border rounded-lg p-4 ${step.status === 'active' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${statusColors[step.status]}`}>
                            {step.status === 'completed' ? '✓' : step.stepOrder}
                          </div>
                          {i < workflow.steps.length - 1 && <div className={`w-0.5 h-4 ${step.status === 'completed' ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium">{step.stepName}</h4>
                            <Badge variant="outline" className="text-[10px]">{step.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                          {agent && <p className="text-[10px] text-muted-foreground mt-1">Agent: {agent.name} ({agent.agentType})</p>}
                          {step.completedAt && <p className="text-[10px] text-muted-foreground mt-1">Completed: {new Date(step.completedAt).toLocaleString()}</p>}
                          {step.signature && <p className="text-[10px] font-mono text-emerald-600 mt-1 truncate">Signed: {step.signature.slice(0, 40)}...</p>}
                          {step.outputData && (
                            <div className="mt-2 p-2 bg-muted rounded text-[10px] font-mono overflow-x-auto">
                              {JSON.stringify(step.outputData, null, 2).slice(0, 200)}
                            </div>
                          )}
                          {step.status === 'active' && (
                            <Button size="sm" className="mt-3 h-7 text-xs" disabled={isLoading} onClick={() => advanceWorkflow(workflow.id, i)}>
                              {isLoading ? 'Processing...' : 'Complete Step'} <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <div className="text-center">
                <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Select a transaction to view workflow</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Due Diligence ─────────────────────────────────────────────────────────

function DueDiligenceView() {
  const { documents, riskReports, uploadDocument } = useTrustLandStore();
  const [uploading, setUploading] = React.useState(false);

  const handleUpload = async (docType: string) => {
    setUploading(true);
    const identities = useTrustLandStore.getState().identities;
    const buyerDid = identities.find(i => i.profile.role === 'buyer')?.did || '';
    await uploadDocument({
      propertyId: Array.from(useTrustLandStore.getState().properties)[0]?.id || '',
      uploaderDid: buyerDid,
      documentType: docType,
      fileName: `${docType}_${Date.now()}.pdf`,
      fileContent: `simulated_${docType}_content_${Date.now()}`
    });
    setUploading(false);
    toast.success(`Document uploaded and processed: ${docType.replace(/_/g, ' ')}`);
  };

  const statusIcons: Record<string, string> = {
    verified: '✓ Verified',
    pending: '⏳ Pending',
    flagged: '⚠ Flagged',
    rejected: '✕ Rejected'
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autonomous Due Diligence</h1>
          <p className="text-muted-foreground text-sm">AI-powered document analysis, verification, and risk assessment</p>
        </div>
      </div>

      {/* Upload Section */}
      <div className="border border-border rounded-xl p-5 bg-card">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><FileSearch className="h-4 w-4" /> Upload Documents for Analysis</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {['title_deed', 'survey_map', 'sale_agreement', 'valuation_report', 'identity_proof', 'bank_statement', 'tax_record'].map(type => (
            <Button key={type} size="sm" variant="outline" className="text-xs h-9" disabled={uploading} onClick={() => handleUpload(type)}>
              {type.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4">Processed Documents</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
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
                      <div key={i} className="text-[10px] text-red-600 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded">⚠ {a}</div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2 font-mono">Hash: {doc.fileHash.slice(0, 32)}...</p>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Reports */}
        <div className="border border-border rounded-xl p-5 bg-card">
          <h3 className="font-semibold mb-4">Risk Assessment Reports</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
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
                      <p className="text-emerald-600 mt-1">→ {finding.recommendation}</p>
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

// ─── Trust Score View ──────────────────────────────────────────────────────

function TrustScoreView() {
  const { identities, fetchTrustScore } = useTrustLandStore();
  const [selectedDid, setSelectedDid] = React.useState<string | null>(null);
  const [trustData, setTrustData] = React.useState<Record<string, unknown> | null>(null);
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
                  <span className="text-3xl font-bold text-emerald-600">{(trustData as Record<string, unknown>).trustScore as number}</span>
                </div>
                <h3 className="font-semibold text-lg">Composite Trust Score</h3>
                <p className="text-xs text-muted-foreground font-mono">{selectedDid}</p>
              </div>

              {/* Breakdown */}
              <div className="border border-border rounded-xl p-5 bg-card">
                <h3 className="font-semibold mb-4">Score Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries((trustData as Record<string, Record<string, Record<string, unknown>>>).breakdown || {}).map(([key, val]) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{(val as Record<string, unknown>).description as string}</span>
                        <span className="text-sm font-medium">{(val as Record<string, unknown>).score as number}/{(val as Record<string, unknown>).max as number}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${((val as Record<string, unknown>).score as number / (val as Record<string, unknown>).max as number) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border rounded-lg p-4 bg-card text-center">
                  <p className="text-2xl font-bold">{(trustData as Record<string, unknown>).totalTransactions as number}</p>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                </div>
                <div className="border border-border rounded-lg p-4 bg-card text-center">
                  <p className="text-2xl font-bold">{(trustData as Record<string, unknown>).totalActions as number}</p>
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

// ─── Messages View ─────────────────────────────────────────────────────────

function MessagesView() {
  const { messages, identities, sendMessage } = useTrustLandStore();
  const [sending, setSending] = React.useState(false);

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent Messages</h1>
        <p className="text-muted-foreground text-sm">Authenticated agent-to-agent communication with cryptographic signatures</p>
      </div>

      <div className="space-y-3 max-h-[700px] overflow-y-auto">
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
              <span className="text-xs text-muted-foreground">→</span>
              <span className="text-xs font-medium text-teal-600">{getIdentityName(msg.receiverDid)}</span>
            </div>
            <div className="p-2 bg-muted rounded text-xs">
              {JSON.stringify(msg.content, null, 2).slice(0, 300)}
            </div>
            <p className="text-[10px] font-mono text-emerald-600 mt-2 truncate">Signed: {msg.signature.slice(0, 40)}...</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Identities View ───────────────────────────────────────────────────────

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
              {identity.verifiedAt && <span className="text-[10px] text-emerald-600">✓ Verified</span>}
              {identity.t3Integrated && <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-600"><Lock className="h-2.5 w-2.5 mr-0.5" />T3</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Autonomous Purchase View (The "Wow" Feature) ────────────────────────────

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
    const dels = useTrustLandStore.getState().autonomousDelegations;
    if (dels.length > 0) {
      setDelegationId(dels[0].id);
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
          <div className="flex items-center gap-1 bg-white dark:bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-200">
            <Users className="h-3 w-3" /> <span className="font-medium">User Grants Authority</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-white dark:bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-200">
            <Key className="h-3 w-3" /> <span className="font-medium">T3 API Key Issued</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-white dark:bg-amber-900/30 px-3 py-2 rounded-lg border border-amber-200">
            <Lock className="h-3 w-3" /> <span className="font-medium">JWT Access Token</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-white dark:bg-amber-900/30 px-3 py-2 rounded-lg border border-emerald-200">
            <Bot className="h-3 w-3" /> <span className="font-medium">Agent Acts Autonomously</span>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-500" />
          <div className="flex items-center gap-1 bg-white dark:bg-amber-900/30 px-3 py-2 rounded-lg border border-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> <span className="font-medium">Every Step Signed (Ed25519)</span>
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
              <div className="bg-white dark:bg-emerald-900/30 p-2 rounded border border-emerald-200">
                <p className="text-muted-foreground">Delegation ID</p>
                <p className="font-mono truncate">{delegationId.slice(0, 20)}...</p>
              </div>
              <div className="bg-white dark:bg-emerald-900/30 p-2 rounded border border-emerald-200">
                <p className="text-muted-foreground">T3 API Key</p>
                <p className="font-mono text-emerald-600">Issued ✓</p>
              </div>
              <div className="bg-white dark:bg-emerald-900/30 p-2 rounded border border-emerald-200">
                <p className="text-muted-foreground">Signature</p>
                <p className="font-mono text-emerald-600">Ed25519 ✓</p>
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
                      {aStep.status === 'completed' ? '✓' : i + 1}
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
                <div className="bg-white dark:bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-emerald-600">{autonomousResult.matchScore}%</p>
                  <p className="text-xs text-muted-foreground">Match Score</p>
                </div>
                <div className="bg-white dark:bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-2xl font-bold text-amber-600">{autonomousResult.trustScore}%</p>
                  <p className="text-xs text-muted-foreground">Trust Score</p>
                </div>
                <div className="bg-white dark:bg-background p-3 rounded-lg border border-border text-center">
                  <p className="text-lg font-bold">{autonomousResult.riskLevel}</p>
                  <p className="text-xs text-muted-foreground">Risk Level</p>
                </div>
                <div className="bg-white dark:bg-background p-3 rounded-lg border border-border text-center">
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

              <div className="flex items-center gap-2 p-3 bg-white dark:bg-background rounded-lg border border-emerald-200">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  All actions signed with Ed25519Signature2020 and authenticated via Terminal 3 Agent Auth SDK
                  {autonomousResult.allActionsSigned && ' ✓ All signatures verified'}
                </span>
              </div>
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
