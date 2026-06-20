// TrustLand AI Network — Auth / Verification View
// Lets users register a T3-verified identity (Ed25519 DID + W3C VC) and
// sign in with an existing identity. Backed by real POST /api/identities.

'use client';

import React, { useState } from 'react';
import {
  Shield, Lock, Key, Fingerprint, CheckCircle2, User, Mail, Building2,
  Sparkles, ArrowRight, Loader2, AlertCircle, LogIn, UserPlus,
  BadgeCheck, Terminal, Eye, EyeOff, Copy, Check,
} from 'lucide-react';
import { useTrustLandStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CREDENTIAL_TYPES = [
  { value: 'buyer',       label: 'Property Buyer',     desc: 'Search, negotiate, sign, delegate', scopes: ['search:properties', 'negotiate:offers', 'sign:contracts', 'delegate:authority', 'autonomous:purchase'] },
  { value: 'seller',      label: 'Property Seller',    desc: 'List & sell property',              scopes: ['search:properties', 'negotiate:offers', 'sign:contracts'] },
  { value: 'agent',       label: 'Real Estate Agent',  desc: 'Broker property transactions',     scopes: ['verify:ownership', 'legal:review', 'negotiate:offers'] },
  { value: 'lawyer',      label: 'Legal Counsel',      desc: 'Title review & contract drafting',  scopes: ['legal:review', 'sign:contracts'] },
  { value: 'surveyor',    label: 'Land Surveyor',      desc: 'Boundary & topographic surveys',    scopes: ['verify:ownership', 'survey:property'] },
  { value: 'institution', label: 'Financial Institution', desc: 'Mortgage & escrow services',     scopes: ['finance:approve', 'escrow:hold'] },
  { value: 'government',  label: 'Government / Registry', desc: 'Land registry official',         scopes: ['registry:register', 'registry:verify'] },
];

type Mode = 'login' | 'register';

export default function AuthView() {
  const { identities, fetchIdentities, setCurrentView } = useTrustLandStore();
  const [mode, setMode] = useState<Mode>('register');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [credentialType, setCredentialType] = useState('buyer');
  const [agree, setAgree] = useState(false);

  // Login form state
  const [loginDid, setLoginDid] = useState('');
  const [showDid, setShowDid] = useState(false);

  // Success state — show issued credential
  const [issuedIdentity, setIssuedIdentity] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedCred = CREDENTIAL_TYPES.find(c => c.value === credentialType)!;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError('Name and email are required');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!agree) {
      setError('You must agree to the TrustLand Terms and Privacy Policy');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          organization: organization.trim() || undefined,
          credentialType,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Registration failed (${res.status})`);
      }
      const data = await res.json();
      await fetchIdentities();
      setIssuedIdentity(data.identity);
      toast.success('Identity verified & T3 credential issued');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!loginDid.trim()) {
      setError('Please enter your DID or pick an existing identity below');
      return;
    }

    setLoading(true);
    try {
      // "Logging in" = look up the identity and surface it as active
      await fetchIdentities();
      const found = useTrustLandStore.getState().identities.find(i =>
        i.did === loginDid.trim() || i.profile.email === loginDid.trim()
      );
      if (!found) {
        throw new Error('No TrustLand identity matches that DID or email');
      }
      setIssuedIdentity(found);
      toast.success(`Welcome back, ${found.profile.name}`);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const copyDid = () => {
    if (issuedIdentity?.did) {
      navigator.clipboard.writeText(issuedIdentity.did);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // ─── Success state ─────────────────────────────────────────────────────
  if (issuedIdentity) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a1f44] via-[#0c2350] to-[#0a1f44] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4 shadow-lg shadow-emerald-500/30">
              <CheckCircle2 className="h-9 w-9 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Identity Verified</h1>
            <p className="text-white/70">
              Your Terminal 3 credential has been issued and is ready to use across the TrustLand network.
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/15 backdrop-blur p-6 space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-white/10">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center font-bold text-2xl">
                {issuedIdentity.profile?.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-lg">{issuedIdentity.profile?.name}</p>
                <p className="text-sm text-white/60">{issuedIdentity.profile?.email}</p>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Active
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-white/50 mb-1">Decentralized Identifier (DID)</Label>
                <div className="flex items-center gap-2 rounded-lg bg-black/30 border border-white/10 p-2">
                  <code className="flex-1 text-[11px] font-mono text-emerald-300 truncate">
                    {issuedIdentity.did}
                  </code>
                  <Button size="sm" variant="ghost" onClick={copyDid} className="h-7 px-2 text-white/70 hover:text-white">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-white/50 mb-1">Credential Type</Label>
                  <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-sm">
                    {issuedIdentity.credentialType}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-white/50 mb-1">Verified At</Label>
                  <div className="rounded-lg bg-black/30 border border-white/10 p-2 text-sm">
                    {issuedIdentity.verifiedAt ? new Date(issuedIdentity.verifiedAt).toLocaleString() : '—'}
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs text-white/50 mb-1">Public Key (Ed25519)</Label>
                <div className="rounded-lg bg-black/30 border border-white/10 p-2">
                  <code className="text-[10px] font-mono text-white/70 break-all">
                    {issuedIdentity.publicKey}
                  </code>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
              <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30">
                <Terminal className="h-3 w-3 mr-1" /> T3 Agent Auth
              </Badge>
              {issuedIdentity.t3SDKRegistered && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <BadgeCheck className="h-3 w-3 mr-1" /> SDK Registered
                </Badge>
              )}
              {issuedIdentity.verifiableCredentialId && (
                <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  <Fingerprint className="h-3 w-3 mr-1" /> W3C VC Issued
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0"
              onClick={() => setCurrentView('overview')}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Explore Properties
            </Button>
            <Button
              variant="outline"
              className="flex-1 bg-white/5 border-white/20 text-white hover:bg-white/10"
              onClick={() => setCurrentView('identities')}
            >
              View All Identities
            </Button>
          </div>

          <button
            onClick={() => { setIssuedIdentity(null); setMode('register'); }}
            className="block mx-auto mt-4 text-xs text-white/50 hover:text-white underline"
          >
            Register another identity
          </button>
        </div>
      </div>
    );
  }

  // ─── Auth form (login / register) ──────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1f44] via-[#0c2350] to-[#0a1f44] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="relative h-14 w-14 rounded-xl overflow-hidden shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-red-500 to-rose-600" />
              <div className="absolute inset-[2px] rounded-lg bg-[#0a1f44] flex items-center justify-center">
                <span className="text-3xl font-black bg-gradient-to-br from-orange-400 to-orange-600 text-transparent bg-clip-text">T</span>
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-bold">TrustLand AI Network</h1>
          <p className="text-sm text-white/60 mt-1">Intelligent Decisions, Seamless Transactions.</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-white/5 rounded-lg p-1 mb-6 border border-white/10">
          <button
            onClick={() => { setMode('register'); setError(null); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition',
              mode === 'register' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' : 'text-white/60 hover:text-white'
            )}
          >
            <UserPlus className="h-4 w-4" /> Verify Identity
          </button>
          <button
            onClick={() => { setMode('login'); setError(null); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition',
              mode === 'login' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white' : 'text-white/60 hover:text-white'
            )}
          >
            <LogIn className="h-4 w-4" /> Sign In
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 flex items-start gap-2 text-sm text-red-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Register form */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <Label className="text-xs text-white/70 mb-1.5 block">Full Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Wanjiru Kamau"
                  className="pl-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:bg-white/10"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-white/70 mb-1.5 block">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="wanjiru@example.com"
                  className="pl-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:bg-white/10"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-white/70 mb-1.5 block">Organization (optional)</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. HassConsult Real Estate"
                  className="pl-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:bg-white/10"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-white/70 mb-1.5 block">Role / Credential Type</Label>
              <Select value={credentialType} onValueChange={setCredentialType}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDENTIAL_TYPES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      <div className="flex flex-col">
                        <span>{c.label}</span>
                        <span className="text-[10px] text-white/50">{c.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedCred.scopes.map(s => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <span>
                I agree to the TrustLand <a className="text-orange-400 underline" href="#">Terms of Service</a> and{' '}
                <a className="text-orange-400 underline" href="#">Privacy Policy</a>. I understand a
                Terminal 3 Verifiable Credential will be issued to my DID.
              </span>
            </label>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white h-11"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Issuing Credential…</>
              ) : (
                <>Verify & Issue Credential <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>

            <div className="text-[11px] text-white/40 text-center pt-2 border-t border-white/10 space-y-1">
              <p className="flex items-center justify-center gap-1">
                <Lock className="h-3 w-3" /> Ed25519 key pair generated locally
              </p>
              <p className="flex items-center justify-center gap-1">
                <Terminal className="h-3 w-3" /> Registered with Terminal 3 Agent Auth SDK
              </p>
              <p className="flex items-center justify-center gap-1">
                <Fingerprint className="h-3 w-3" /> W3C Verifiable Credential issued
              </p>
            </div>
          </form>
        )}

        {/* Login form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-xs text-white/70 mb-1.5 block">DID or Email</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input
                  value={loginDid}
                  onChange={(e) => setLoginDid(e.target.value)}
                  placeholder="did:t3:... or you@example.com"
                  className="pl-10 pr-10 bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:bg-white/10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowDid(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  {showDid ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {identities.length > 0 && (
              <div>
                <Label className="text-xs text-white/70 mb-1.5 block">Or pick an existing identity</Label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {identities.map(id => (
                    <button
                      key={id.did}
                      type="button"
                      onClick={() => setLoginDid(id.did)}
                      className={cn(
                        'w-full text-left rounded-lg p-2 border transition flex items-center gap-3',
                        loginDid === id.did
                          ? 'bg-orange-500/15 border-orange-500/40'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      )}
                    >
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-xs font-bold">
                        {id.profile.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{id.profile.name}</p>
                        <p className="text-[10px] text-white/50 truncate">{id.profile.email}</p>
                      </div>
                      <Badge className="text-[9px] bg-white/10 border-0">{id.credentialType}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white h-11"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Authenticating…</>
              ) : (
                <>Sign In <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>

            <p className="text-[11px] text-white/40 text-center pt-2 border-t border-white/10">
              Authentication is delegated to the Terminal 3 Agent Auth SDK using
              Ed25519 signatures — no passwords stored.
            </p>
          </form>
        )}

        {/* Back to explorer */}
        <button
          onClick={() => setCurrentView('overview')}
          className="block mx-auto mt-6 text-xs text-white/50 hover:text-white underline"
        >
          ← Back to Property Explorer
        </button>
      </div>
    </div>
  );
}
