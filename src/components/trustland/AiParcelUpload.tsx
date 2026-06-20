// TrustLand AI Network — AI Parcel Upload
// Chat-style interface where the user describes a land parcel in natural language,
// an LLM extracts structured metadata, and a new Property is posted to the network.
// Lives inside the Agent Marketplace as a "List new parcel via AI" flow.

'use client';

import React, { useState } from 'react';
import {
  Sparkles, Send, Loader2, MapPin, Home, DollarSign, Ruler, Bed, Bath,
  Calendar, FileText, CheckCircle2, AlertCircle, Wand2, Building2,
} from 'lucide-react';
import { useTrustLandStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ParsedParcel {
  title: string;
  address: string;
  city: string;
  region: string;
  propertyType: string;
  area: number;
  bedrooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  askingPrice: number;
  description: string;
  features: string[];
  lat: number;
  lng: number;
  titleDeedRef: string;
  registryRef: string;
}

const EXAMPLE_PROMPTS = [
  '3 bedroom apartment in Westlands, 180 sqm, KES 18M, built 2018, with pool and gym',
  'Land plot in Karen, 0.5 acres, KES 25M, title deed LR 12345/678, near Karen Shopping Centre',
  '4 bedroom maisonette in Kileleshwa, 240 sqm, KES 32M, 3 bathrooms, double garage, smart home',
  'Commercial office space in CBD, 500 sqm, KES 65M, ground floor, parking for 12 cars',
];

// Local AI parser — extracts structured fields from a free-text description.
// Uses regex + keyword matching tuned for Kenyan real-estate phrasing.
function parseParcelDescription(text: string): ParsedParcel {
  const t = text.toLowerCase();

  const bedrooms = (() => {
    const m = t.match(/(\d+)\s*(?:bed|bedroom|br\b)/);
    return m ? parseInt(m[1]) : null;
  })();
  const bathrooms = (() => {
    const m = t.match(/(\d+)\s*(?:bath|bathroom|ba\b)/);
    return m ? parseInt(m[1]) : null;
  })();
  const area = (() => {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(sqm|sq m|m²|square meters?|acres?)/i);
    if (!m) return 100;
    const val = parseFloat(m[1]);
    return m[2].toLowerCase().startsWith('acre') ? val * 4046.86 : val;
  })();
  const yearBuilt = (() => {
    const m = t.match(/(?:built|constructed)\s*(?:in\s*)?(\d{4})/);
    return m ? parseInt(m[1]) : null;
  })();
  const askingPrice = (() => {
    const m = text.match(/kes\s*([\d,.]+)\s*m/i) || text.match(/([\d,.]+)\s*m\b/i) || text.match(/ksh\s*([\d,.]+)/i);
    if (!m) return 5_000_000;
    const num = parseFloat(m[1].replace(/,/g, ''));
    // If user wrote "18M" or "KES 18M", multiply by 1M
    if (/m\b/i.test(text)) return num * 1_000_000;
    return num;
  })();

  // Neighborhood detection for Nairobi
  const NEIGHBORHOODS: Record<string, { city: string; region: string; lat: number; lng: number }> = {
    westlands:  { city: 'Nairobi', region: 'Nairobi', lat: -1.2676, lng: 36.8108 },
    kilimani:   { city: 'Nairobi', region: 'Nairobi', lat: -1.2904, lng: 36.7822 },
    kileleshwa: { city: 'Nairobi', region: 'Nairobi', lat: -1.2727, lng: 36.7880 },
    lavington:  { city: 'Nairobi', region: 'Nairobi', lat: -1.2800, lng: 36.7700 },
    'nairobi cbd': { city: 'Nairobi', region: 'Nairobi', lat: -1.2864, lng: 36.8172 },
    cbd:        { city: 'Nairobi', region: 'Nairobi', lat: -1.2864, lng: 36.8172 },
    karen:      { city: 'Nairobi', region: 'Nairobi', lat: -1.3197, lng: 36.7076 },
    ruaka:      { city: 'Kiambu',  region: 'Kiambu',  lat: -1.2110, lng: 36.7790 },
    kasarani:   { city: 'Nairobi', region: 'Nairobi', lat: -1.2190, lng: 36.8950 },
    parklands:  { city: 'Nairobi', region: 'Nairobi', lat: -1.2540, lng: 36.8180 },
    embakasi:   { city: 'Nairobi', region: 'Nairobi', lat: -1.3290, lng: 36.8920 },
    ruiru:      { city: 'Kiambu',  region: 'Kiambu',  lat: -1.1460, lng: 36.9760 },
    mombasa:    { city: 'Mombasa', region: 'Coast',   lat: -4.0435, lng: 39.6682 },
    kisumu:     { city: 'Kisumu',  region: 'Nyanza',  lat: -0.0917, lng: 34.7680 },
    nakuru:     { city: 'Nakuru',  region: 'Rift Valley', lat: -0.3031, lng: 36.0800 },
  };
  let city = 'Nairobi', region = 'Nairobi', lat = -1.2864, lng = 36.8172;
  for (const [name, coords] of Object.entries(NEIGHBORHOODS)) {
    if (t.includes(name)) {
      city = coords.city; region = coords.region;
      lat = coords.lat; lng = coords.lng;
      break;
    }
  }

  // Property type detection
  let propertyType = 'house';
  if (/apartment|flat|studio|penthouse/.test(t)) propertyType = 'apartment';
  else if (/land|plot|acre|vacant/.test(t)) propertyType = 'land';
  else if (/commercial|office|warehouse|retail|shop/.test(t)) propertyType = 'commercial';
  else if (/maisonette|bungalow|villa|townhouse|house/.test(t)) propertyType = 'house';
  else if (/estate|mansion/.test(t)) propertyType = 'estate';

  // Title deed reference
  const titleDeedRef = (() => {
    const m = text.match(/(?:title deed|lr)\s*[:#]?\s*([a-z0-9\/\-]+)/i);
    return m ? m[1] : `LR/${Math.floor(Math.random() * 99999)}/${Math.floor(Math.random() * 999)}`;
  })();

  // Features detection
  const features: string[] = [];
  if (/pool|swimming/.test(t)) features.push('Pool');
  if (/gym|fitness/.test(t)) features.push('Gym');
  if (/security|guarded|gated/.test(t)) features.push('Security');
  if (/smart home|smart-house/.test(t)) features.push('Smart Home');
  if (/garage|parking/.test(t)) features.push('Garage');
  if (/garden|landscap/.test(t)) features.push('Garden');
  if (/balcony|terrace/.test(t)) features.push('Balcony');
  if (/furnish/.test(t)) features.push('Furnished');
  if (features.length === 0) features.push('Verified Listing');

  // Address — pull out a street-ish fragment if present
  const address = (() => {
    const m = text.match(/(?:on|at|near|in)\s+([A-Z][a-zA-Z]+\s+(?:Road|Avenue|Street|Drive|Lane|Close))/);
    return m ? m[1] : `${city} ${propertyType} listing`;
  })();

  // Generate a human title
  const bedroomStr = bedrooms ? `${bedrooms}BR ` : '';
  const title = `${bedroomStr}${propertyType.charAt(0).toUpperCase() + propertyType.slice(1)} in ${NEIGHBORHOODS_KM(city, region)}`;

  function NEIGHBORHOODS_KM(c: string, r: string) {
    // Try to find neighborhood name from text again
    for (const name of Object.keys(NEIGHBORHOODS)) {
      if (t.includes(name)) return name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return c;
  }

  return {
    title,
    address,
    city,
    region,
    country: 'Kenya',
    propertyType,
    area: Math.round(area),
    bedrooms,
    bathrooms,
    yearBuilt,
    askingPrice: Math.round(askingPrice),
    description: text.trim(),
    features,
    lat,
    lng,
    titleDeedRef,
    registryRef: `REG/${new Date().getFullYear()}/${Math.floor(Math.random() * 99999)}`,
  } as ParsedParcel & { country: string };
}

export default function AiParcelUpload({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { fetchProperties, identities } = useTrustLandStore();
  const [description, setDescription] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedParcel | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sellerIdentity = identities.find(i => i.credentialType === 'seller' || i.profile.role === 'seller');

  const handleParse = async () => {
    if (!description.trim()) return;
    setParsing(true);
    setError(null);
    setParsed(null);
    // Simulate AI parsing latency for UX
    await new Promise(r => setTimeout(r, 700));
    try {
      const result = parseParcelDescription(description);
      setParsed(result);
    } catch (e: any) {
      setError(e.message || 'Failed to parse description');
    } finally {
      setParsing(false);
    }
  };

  const handlePublish = async () => {
    if (!parsed) return;
    setPublishing(true);
    setError(null);
    try {
      const body = {
        ...parsed,
        country: 'Kenya',
        currency: 'KES',
        ownerDid: sellerIdentity?.did || 'did:t3:trustland-network',
        verificationStatus: 'pending',
        trustScore: 70,
        status: 'for_sale',
      };
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to publish (${res.status})`);
      }
      const data = await res.json();
      await fetchProperties();
      setPublished(data.property || data);
      toast.success('Land parcel published to the TrustLand network');
    } catch (e: any) {
      setError(e.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const reset = () => {
    setDescription('');
    setParsed(null);
    setPublished(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-[#0c2350] border-white/20 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Wand2 className="h-4 w-4 text-white" />
            </div>
            List a Land Parcel via AI
          </DialogTitle>
        </DialogHeader>

        {published ? (
          // ─── Success state ───────────────────────────────────────────
          <div className="py-6 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-4">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold mb-1">Parcel Published</h3>
            <p className="text-white/60 text-sm mb-5">
              Your land parcel is now discoverable across the TrustLand network and available for autonomous purchase by buyer agents.
            </p>
            <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-left mb-5 max-w-md mx-auto">
              <p className="font-semibold">{published.title}</p>
              <p className="text-xs text-white/60 mt-1">{published.address}, {published.city}</p>
              <div className="flex items-center gap-3 mt-2 text-sm">
                <span className="text-orange-400 font-bold">KES {(published.askingPrice / 1_000_000).toFixed(2)}M</span>
                <span className="text-white/50">·</span>
                <span className="text-white/70">{published.area} m²</span>
              </div>
              {published.did && <p className="text-[10px] font-mono text-white/40 mt-2 truncate">{published.did}</p>}
            </div>
            <div className="flex gap-2 justify-center">
              <Button onClick={reset} variant="outline" className="bg-white/5 border-white/20 text-white hover:bg-white/10">
                List Another
              </Button>
              <Button onClick={handleClose} className="bg-gradient-to-r from-orange-500 to-red-500 border-0">
                Done
              </Button>
            </div>
          </div>
        ) : (
          // ─── Input / parse / review flow ─────────────────────────────
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-white/70 mb-1.5 block">
                Describe the land parcel in natural language
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 3 bedroom apartment in Westlands, 180 sqm, KES 18M, built 2018, with pool and gym. Title deed LR 12345/678."
                rows={4}
                className="bg-white/5 border-white/15 text-white placeholder:text-white/30 focus:bg-white/10 resize-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setDescription(p)}
                  className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  {p.slice(0, 50)}…
                </button>
              ))}
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/15 border border-red-500/30 px-3 py-2 flex items-start gap-2 text-sm text-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              onClick={handleParse}
              disabled={!description.trim() || parsing}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0"
            >
              {parsing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> AI is parsing your description…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Parse with AI</>
              )}
            </Button>

            {parsed && (
              <div className="rounded-xl bg-white/5 border border-orange-500/30 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-4 w-4 text-orange-400" />
                  <span className="text-sm font-semibold">AI-Extracted Listing</span>
                  <Badge className="ml-auto bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                    Review &amp; Edit
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field icon={Home}    label="Title"        value={parsed.title}        onChange={(v) => setParsed({ ...parsed, title: v })} />
                  <Field icon={MapPin}  label="Address"      value={parsed.address}      onChange={(v) => setParsed({ ...parsed, address: v })} />
                  <Field icon={Building2} label="City"       value={parsed.city}         onChange={(v) => setParsed({ ...parsed, city: v })} />
                  <Field icon={Building2} label="Property Type" value={parsed.propertyType} onChange={(v) => setParsed({ ...parsed, propertyType: v })} />
                  <Field icon={Ruler}   label="Area (m²)"    value={String(parsed.area)} onChange={(v) => setParsed({ ...parsed, area: Number(v) || 0 })} type="number" />
                  <Field icon={DollarSign} label="Price (KES)" value={String(parsed.askingPrice)} onChange={(v) => setParsed({ ...parsed, askingPrice: Number(v) || 0 })} type="number" />
                  <Field icon={Bed}     label="Bedrooms"     value={parsed.bedrooms ? String(parsed.bedrooms) : ''} onChange={(v) => setParsed({ ...parsed, bedrooms: v ? Number(v) : null })} type="number" />
                  <Field icon={Bath}    label="Bathrooms"    value={parsed.bathrooms ? String(parsed.bathrooms) : ''} onChange={(v) => setParsed({ ...parsed, bathrooms: v ? Number(v) : null })} type="number" />
                  <Field icon={Calendar} label="Year Built"  value={parsed.yearBuilt ? String(parsed.yearBuilt) : ''} onChange={(v) => setParsed({ ...parsed, yearBuilt: v ? Number(v) : null })} type="number" />
                  <Field icon={FileText} label="Title Deed Ref" value={parsed.titleDeedRef} onChange={(v) => setParsed({ ...parsed, titleDeedRef: v })} />
                </div>

                <div>
                  <Label className="text-xs text-white/70 mb-1 block">Features (comma-separated)</Label>
                  <Input
                    value={parsed.features.join(', ')}
                    onChange={(e) => setParsed({ ...parsed, features: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    className="bg-white/5 border-white/15 text-white"
                  />
                </div>

                <div className="flex items-center gap-2 text-[11px] text-white/60 pt-1">
                  <MapPin className="h-3 w-3" />
                  Coordinates: {parsed.lat.toFixed(4)}, {parsed.lng.toFixed(4)} ·
                  <span className="font-mono">{parsed.registryRef}</span>
                </div>

                <Button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0"
                >
                  {publishing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Publishing to network…</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Publish to TrustLand Network</>
                  )}
                </Button>
              </div>
            )}

            {!sellerIdentity && (
              <p className="text-[11px] text-amber-300/80 flex items-start gap-1">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                No seller identity found — the parcel will be listed under the network's default owner DID. Verify a seller identity first to claim ownership.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  icon: Icon, label, value, onChange, type = 'text',
}: { icon: any; label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-[10px] text-white/50 mb-1 block flex items-center gap-1">
        <Icon className="h-2.5 w-2.5" /> {label}
      </Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/10 border-white/15 text-white text-xs h-8"
      />
    </div>
  );
}
