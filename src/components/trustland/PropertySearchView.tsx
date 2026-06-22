// TrustLand AI Network — Property Search View
// Map-centric property explorer matching the TrustLand product demo.
// Layout: browser-framed hero → dark blue header (logo + global search)
//         → three-column body [left filter sidebar | central Nairobi map | right stats+category cards]
//         → dark blue bottom navigation bar
// Tagline: "Intelligent Decisions, Seamless Transactions."

'use client';

import React, { useMemo, useState } from 'react';
import {
  Search, MapPin as MapPinIcon, Home, Building2, Hotel, LandPlot, Star,
  SlidersHorizontal, Layers, Locate, Compass, Calendar,
  Bed, Bath, Car, TreePine, Wrench, DollarSign, Tag,
  TrendingUp, Sparkles, ArrowRight, Shield, ChevronRight,
  Loader2,
} from 'lucide-react';
import { useTrustLandStore, type Property } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { canAccessView, filterProperties, matchesPropertyStatus, matchesPropertyType } from '@/lib/trustland-access';
import ParcelSearchPalette from './ParcelSearchPalette';
import GoogleMapsView from './GoogleMapsView';

// ─── Brand mark (gradient "T" inside a square, like the demo) ───────────────
function TrustLandMark({ size = 40 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative rounded-lg overflow-hidden flex items-center justify-center shadow-lg"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-red-500 to-rose-600" />
      <div className="absolute inset-[2px] rounded-md bg-[#0a1f44] flex items-center justify-center">
        <span
          className="font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-400 via-amber-300 to-orange-500"
          style={{ fontSize: size * 0.55, lineHeight: 1 }}
        >
          T
        </span>
      </div>
    </div>
  );
}

// ─── Nairobi neighborhoods + pin coords (approx WGS84) ──────────────────────
const NAIROBI_NEIGHBORHOODS: Record<string, { lat: number; lng: number; label: string }> = {
  westlands:   { lat: -1.2676, lng: 36.8108, label: 'Westlands' },
  kilimani:    { lat: -1.2904, lng: 36.7822, label: 'Kilimani' },
  kileleshwa:  { lat: -1.2727, lng: 36.7880, label: 'Kileleshwa' },
  lavington:   { lat: -1.2800, lng: 36.7700, label: 'Lavington' },
  cbd:         { lat: -1.2864, lng: 36.8172, label: 'Nairobi CBD' },
  karen:       { lat: -1.3197, lng: 36.7076, label: 'Karen' },
  ruaka:       { lat: -1.2110, lng: 36.7790, label: 'Ruaka' },
  Kasarani:    { lat: -1.2190, lng: 36.8950, label: 'Kasarani' },
  parklands:   { lat: -1.2540, lng: 36.8180, label: 'Parklands' },
  embakasi:    { lat: -1.3290, lng: 36.8920, label: 'Embakasi' },
};

// Convert a lat/lng to a percentage position on the stylized map image.
// Bounds chosen so all 10 neighborhoods land inside the visible area.
// (Kept for reference; GoogleMapsView uses real WGS84 lat/lng directly.)
export const MAP_BOUNDS = { minLat: -1.345, maxLat: -1.20, minLng: 36.68, maxLng: 36.95 };
export function latLngToMapXY(lat: number, lng: number) {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
  const y = ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}

// ─── Filter categories matching the demo's left sidebar ─────────────────────
const FILTER_GROUPS = [
  { key: 'status', label: 'Property Status', icon: Home, options: ['For Sale', 'For Rent', 'Sold', 'Off-Market'] },
  { key: 'price',  label: 'Current Pricing', icon: DollarSign, options: ['< 5M', '5M–20M', '20M–50M', '> 50M'] },
  { key: 'type',   label: 'Property Type',   icon: Building2, options: ['Apartment', 'House', 'Land', 'Commercial'] },
  { key: 'rooms',  label: 'Rooms',           icon: Bed, options: ['1', '2', '3', '4+'] },
  { key: 'baths',  label: 'Bathrooms',       icon: Bath, options: ['1', '2', '3', '4+'] },
  { key: 'garage', label: 'Garage',          icon: Car, options: ['Yes', 'No'] },
  { key: 'garden', label: 'Landscaping',     icon: TreePine, options: ['Yes', 'No'] },
  { key: 'cond',   label: 'Condition',       icon: Wrench, options: ['New', 'Good', 'Renovation Needed'] },
  { key: 'feat',   label: 'Features',        icon: Star, options: ['Pool', 'Gym', 'Security', 'Smart Home'] },
] as const;

type FilterKey = typeof FILTER_GROUPS[number]['key'];

// ─── Property card on the right rail (compact category tiles like the demo) ─
function CategoryCard({
  label,
  count,
  icon: Icon,
  accent,
  active = false,
  onClick,
}: {
  label: string;
  count: number;
  icon: any;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left transition cursor-pointer',
        active ? 'bg-orange-500/20 border-orange-500/40 ring-1 ring-orange-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center', accent)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold text-white">{count}</span>
      </div>
      <p className="text-xs text-white/70">{label}</p>
    </button>
  );
}

// ─── Pin marker on the stylized map ─────────────────────────────────────────
// NOTE: PropertyPin was the old SVG-based marker. GoogleMapsView now renders
// proper Google Maps markers with InfoWindows. Kept here as a reference impl.
function _PropertyPin({ property, onClick, isSelected }: { property: Property; onClick: () => void; isSelected: boolean }) {
  const { x, y } = latLngToMapXY(property.lat, property.lng);
  // trust score >= 80 → red/orange featured pin, otherwise blue pin (matches demo)
  const featured = property.trustScore >= 80;
  return (
    <button
      onClick={onClick}
      style={{ left: `${x}%`, top: `${y}%` }}
      className="absolute -translate-x-1/2 -translate-y-full group focus:outline-none"
      title={property.title}
    >
      <div className={cn(
        'relative flex items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-125',
        featured ? 'bg-red-500 h-5 w-5' : 'bg-blue-500 h-4 w-4',
        isSelected && 'ring-4 ring-white/50 scale-125'
      )}>
        <MapPinIcon className="h-2 w-2 text-white" />
      </div>
    </button>
  );
}

// ─── Main View ──────────────────────────────────────────────────────────────
export default function PropertySearchView() {
  const { properties, setCurrentView, fetchProperties, dashboardRole } = useTrustLandStore();
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, string[]>>({
    status: [], price: [], type: [], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [searchPaletteOpen, setSearchPaletteOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Property[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Pull properties on mount if empty
  React.useEffect(() => {
    if (properties.length === 0) fetchProperties();
  }, [properties.length, fetchProperties]);

  // Filter properties based on search query + active filters
  const localFiltered = useMemo(() => {
    return properties.filter((p) => {
      if (query) {
        const q = query.toLowerCase();
        const hay = `${p.title} ${p.address} ${p.city} ${p.region} ${p.country} ${p.propertyType}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const isVisibleListing = matchesPropertyStatus(p.status, 'For Sale') || matchesPropertyStatus(p.status, 'For Rent');
      if (!activeFilters.status.length && !isVisibleListing) return false;
      if (activeFilters.type.length && !activeFilters.type.some(t => matchesPropertyType(p.propertyType, t))) return false;
      if (activeFilters.status.length && !activeFilters.status.some(s => matchesPropertyStatus(p.status, s))) return false;
      if (activeFilters.rooms.length) {
        const beds = p.bedrooms ?? 0;
        const wants = activeFilters.rooms.map(r => r === '4+' ? 4 : parseInt(r));
        if (!wants.some(w => w === 4 ? beds >= 4 : beds === w)) return false;
      }
      if (activeFilters.baths.length) {
        const baths = p.bathrooms ?? 0;
        const wants = activeFilters.baths.map(r => r === '4+' ? 4 : parseInt(r));
        if (!wants.some(w => w === 4 ? baths >= 4 : baths === w)) return false;
      }
      if (activeFilters.price.length) {
        const m = p.askingPrice / 1_000_000;
        const ok = activeFilters.price.some(b => {
          if (b === '< 5M') return m < 5;
          if (b === '5M–20M') return m >= 5 && m < 20;
          if (b === '20M–50M') return m >= 20 && m < 50;
          if (b === '> 50M') return m >= 50;
          return true;
        });
        if (!ok) return false;
      }
      if (activeFilters.feat.length && !activeFilters.feat.some(f => p.features.some(pf => pf.toLowerCase().includes(f.toLowerCase())))) return false;
      return true;
    });
  }, [properties, query, activeFilters]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setSearchLoading(true);
      try {
        const res = await fetch('/api/properties/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: query.trim() || undefined,
            propertyTypes: activeFilters.type.length ? activeFilters.type : undefined,
            status: activeFilters.status[0] || undefined,
            minPrice: activeFilters.price[0] === '< 5M' ? 0 : activeFilters.price[0] === '5M–20M' ? 5_000_000 : activeFilters.price[0] === '20M–50M' ? 20_000_000 : activeFilters.price[0] === '> 50M' ? 50_000_000 : undefined,
            maxPrice: activeFilters.price[0] === '< 5M' ? 5_000_000 : activeFilters.price[0] === '5M–20M' ? 20_000_000 : activeFilters.price[0] === '20M–50M' ? 50_000_000 : undefined,
            bedrooms: activeFilters.rooms.length
              ? Math.min(...activeFilters.rooms.map((room) => {
                  if (room === '4+') return 4;
                  const parsed = parseInt(room, 10);
                  return Number.isFinite(parsed) ? parsed : 0;
                }).filter((count) => count > 0))
              : undefined,
            features: activeFilters.feat.length ? activeFilters.feat : undefined,
          }),
        });
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        if (!cancelled) {
          setSearchResults(Array.isArray(data) ? data : (data.results || []));
        }
      } catch {
        if (!cancelled) {
          setSearchResults(localFiltered);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };

    setSearchResults(localFiltered);
    const timer = setTimeout(run, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, activeFilters.type, activeFilters.status, activeFilters.rooms, activeFilters.feat, activeFilters.price, localFiltered]);

  const filtered = searchResults ?? localFiltered;
  const featuredCount = filtered.filter(p => p.trustScore >= 80).length;
  const newestCount = filtered.filter(p => Date.now() - new Date(p.createdAt).getTime() < 30 * 24 * 3600 * 1000).length;
  const byType = (t: string) => properties.filter(p => (matchesPropertyStatus(p.status, 'For Sale') || matchesPropertyStatus(p.status, 'For Rent')) && matchesPropertyType(p.propertyType, t)).length;

  const toggleFilter = (group: FilterKey, value: string) => {
    setActiveFilters(prev => {
      const list = prev[group];
      return { ...prev, [group]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });
  };

  const clearAll = () => {
    setActiveFilters({ status: [], price: [], type: [], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] });
    setQuery('');
    setSelectedId(null);
  };

  const totalActive = Object.values(activeFilters).flat().length;
  const selected = filtered.find(p => p.id === selectedId) || null;
  const primaryAction = dashboardRole === 'buyer'
    ? { label: 'Open Buyer Tools', view: 'autonomous-purchase' as const }
    : dashboardRole === 'seller'
      ? { label: 'Open Seller Dashboard', view: 'dashboard' as const }
      : { label: 'Open Admin Dashboard', view: 'dashboard' as const };

  return (
    <div className="min-h-screen bg-[#0a1f44] text-white flex flex-col">
      {/* ─── Top browser-bar style header ───────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0a1f44]">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <TrustLandMark size={42} />
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold leading-tight">TrustLand</h1>
              <p className="text-[10px] text-orange-300 tracking-widest uppercase">AI Network</p>
            </div>
          </div>

          {/* Global search — click opens the parcel search palette */}
          <button
            onClick={() => setSearchPaletteOpen(true)}
            className="flex-1 max-w-2xl relative text-left group"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50 group-hover:text-orange-400 transition" />
            <div className="h-10 pl-10 pr-20 flex items-center bg-white/5 border border-white/15 rounded-md text-white/40 group-hover:bg-white/10 group-hover:border-orange-500/40 transition">
              <span className="text-sm">Search parcels, neighborhoods, properties, or features across the network…</span>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white/60">⌘K</kbd>
                <Badge className="bg-orange-500 text-white text-[10px] h-5 px-2 ml-1">Search</Badge>
              </span>
            </div>
          </button>

          {/* Parcel search palette */}
          <ParcelSearchPalette
            open={searchPaletteOpen}
            onClose={() => setSearchPaletteOpen(false)}
            onSelect={(p) => {
              setSelectedId(p.id);
              setQuery(p.title);
              setActiveFilters(prev => ({
                ...prev,
                type: matchesPropertyType(p.propertyType, 'apartment')
                  ? ['Apartment']
                  : matchesPropertyType(p.propertyType, 'house')
                    ? ['House']
                    : matchesPropertyType(p.propertyType, 'land')
                      ? ['Land']
                      : matchesPropertyType(p.propertyType, 'commercial')
                        ? ['Commercial']
                        : matchesPropertyType(p.propertyType, 'estate')
                          ? ['Estate']
                          : prev.type,
              }));
            }}
          />

          {/* Right-side actions */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(s => !s)}
              className="bg-white/5 border-white/15 text-white hover:bg-white/10"
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {totalActive > 0 && (
                <Badge className="ml-2 bg-orange-500 text-white text-[10px] h-4 px-1">{totalActive}</Badge>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => setCurrentView(primaryAction.view)}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {primaryAction.label}
            </Button>
          </div>
        </div>

        {/* Tagline strip */}
        <div className="border-t border-white/5 bg-black/20">
          <div className="max-w-[1400px] mx-auto px-6 py-1.5 flex items-center justify-between text-[11px] text-white/60">
            <span className="flex items-center gap-2">
              <Shield className="h-3 w-3 text-orange-400" />
              Intelligent Decisions, Seamless Transactions.
            </span>
            <span className="hidden md:flex items-center gap-4">
              <span className="flex items-center gap-1"><MapPinIcon className="h-3 w-3" />Nairobi, Kenya</span>
              <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Live Network</span>
            </span>
          </div>
        </div>
      </header>

      {/* ─── Three-column body ──────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT — filter sidebar */}
        {showFilters && (
          <aside className="w-64 border-r border-white/10 bg-[#0c2350] flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Compass className="h-4 w-4 text-orange-400" />
                  Explore Nairobi
                </h2>
                {totalActive > 0 && (
                  <button onClick={clearAll} className="text-[10px] text-white/60 hover:text-white underline">
                    Clear
                  </button>
                )}
              </div>
              <div className="flex gap-1 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-orange-500 text-white">For Sale</span>
                <span className="px-2 py-0.5 rounded bg-white/10 text-white/70">For Rent</span>
              </div>
              {/* Inline filter query (kept here so users can still type-filter) */}
              <div className="relative mt-3">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Quick filter…"
                  className="pl-7 h-7 text-[11px] bg-white/5 border-white/15 text-white placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {FILTER_GROUPS.map(group => {
                const Icon = group.icon;
                const active = activeFilters[group.key];
                return (
                  <div key={group.key} className="rounded-lg">
                    <div className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-white/80">
                      <Icon className="h-3.5 w-3.5 text-orange-400" />
                      {group.label}
                      {active.length > 0 && <span className="ml-auto text-[10px] text-orange-400">{active.length}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 px-2 pb-2">
                      {group.options.map(opt => {
                        const on = active.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleFilter(group.key, opt)}
                            className={cn(
                              'text-[10px] px-2 py-1 rounded border transition',
                              on
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                            )}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-white/10">
              <Button
                size="sm"
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white"
                onClick={() => setCurrentView(primaryAction.view)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                {primaryAction.label}
              </Button>
            </div>
          </aside>
        )}

        {/* CENTER — map (Google Maps renders its own top search + controls) */}
        <main className="flex-1 relative overflow-hidden bg-[#0a1f44] min-w-0">
          {/* Google Maps integration — falls back to stylized SVG if no API key set */}
          <GoogleMapsView heightClass="absolute inset-0" properties={filtered} />

          {/* Neighborhood legend (below the map's top search bar) */}
          <div className="absolute top-16 left-3 z-10 bg-black/40 backdrop-blur-sm rounded-lg p-2 border border-white/10 max-w-[180px] hidden lg:block">
            <p className="text-[10px] text-white/70 mb-1 font-medium">Areas around Nairobi</p>
            <div className="space-y-0.5">
              {Object.entries(NAIROBI_NEIGHBORHOODS).slice(0, 6).map(([k, n]) => (
                <button
                  key={k}
                  onClick={() => setQuery(n.label)}
                  className="block text-[10px] text-white/60 hover:text-orange-300 transition w-full text-left"
                >
                  › {n.label}
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* RIGHT — stats + category cards */}
        <aside className="w-80 border-l border-white/10 bg-[#0c2350] flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="p-4 border-b border-white/10">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{filtered.length}</span>
              <span className="text-xs text-white/60">properties found</span>
              {searchLoading && <Loader2 className="h-4 w-4 animate-spin text-orange-300" />}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                <div className="flex items-center gap-1 text-orange-400 text-[10px] mb-0.5"><Star className="h-3 w-3" />Featured</div>
                <div className="text-lg font-bold">{featuredCount}</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2 border border-white/10">
                <div className="flex items-center gap-1 text-blue-300 text-[10px] mb-0.5"><Calendar className="h-3 w-3" />Newest</div>
                <div className="text-lg font-bold">{newestCount}</div>
              </div>
            </div>
          </div>

          <div className="p-4">
            <h3 className="text-sm font-semibold mb-1">Explore Properties</h3>
            <p className="text-[11px] text-white/50 mb-3">Browse by category across the TrustLand network</p>
            <div className="grid grid-cols-2 gap-2">
              <CategoryCard
                label="Apartments"
                count={byType('apartment')}
                icon={Building2}
                accent="bg-blue-500"
                active={activeFilters.type.some(t => matchesPropertyType('apartment', t))}
                onClick={() => { setActiveFilters({ status: [], price: [], type: ['Apartment'], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] }); setQuery(''); setSelectedId(null); }}
              />
              <CategoryCard
                label="Houses"
                count={byType('house')}
                icon={Home}
                accent="bg-amber-500"
                active={activeFilters.type.some(t => matchesPropertyType('house', t))}
                onClick={() => { setActiveFilters({ status: [], price: [], type: ['House'], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] }); setQuery(''); setSelectedId(null); }}
              />
              <CategoryCard
                label="Estates"
                count={byType('estate')}
                icon={Hotel}
                accent="bg-violet-500"
                active={activeFilters.type.some(t => matchesPropertyType('estate', t))}
                onClick={() => { setActiveFilters({ status: [], price: [], type: ['Estate'], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] }); setQuery(''); setSelectedId(null); }}
              />
              <CategoryCard
                label="Land Plots"
                count={byType('land')}
                icon={LandPlot}
                accent="bg-emerald-500"
                active={activeFilters.type.some(t => matchesPropertyType('land', t))}
                onClick={() => { setActiveFilters({ status: [], price: [], type: ['Land'], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] }); setQuery(''); setSelectedId(null); }}
              />
              <CategoryCard
                label="Featured"
                count={featuredCount}
                icon={Star}
                accent="bg-orange-500"
                onClick={() => { setActiveFilters({ status: [], price: [], type: [], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] }); setSelectedId(null); }}
              />
              <CategoryCard
                label="Commercial"
                count={byType('commercial')}
                icon={Building2}
                accent="bg-rose-500"
                active={activeFilters.type.some(t => matchesPropertyType('commercial', t))}
                onClick={() => { setActiveFilters({ status: [], price: [], type: ['Commercial'], rooms: [], baths: [], garage: [], garden: [], cond: [], feat: [] }); setQuery(''); setSelectedId(null); }}
              />
            </div>

            <Button
              className="w-full mt-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 text-white"
              onClick={() => setCurrentView(primaryAction.view)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {primaryAction.label}
            </Button>
          </div>

          {/* Selected property preview */}
          {selected ? (
            <div className="m-4 mt-0 rounded-xl bg-white/5 border border-orange-500/40 p-3">
              <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] mb-2">
                <Shield className="h-2.5 w-2.5 mr-1" />Trust Score {selected.trustScore}%
              </Badge>
              <h4 className="text-sm font-semibold text-white mb-1">{selected.title}</h4>
              <p className="text-[11px] text-white/60 mb-2">{selected.address}, {selected.city}</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-lg font-bold text-orange-400">{selected.currency} {(selected.askingPrice / 1_000_000).toFixed(2)}M</span>
                <span className="text-[10px] text-white/50">{selected.propertyType}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/70 mb-3">
                {selected.bedrooms && <span className="flex items-center gap-1"><Bed className="h-3 w-3" />{selected.bedrooms}</span>}
                {selected.bathrooms && <span className="flex items-center gap-1"><Bath className="h-3 w-3" />{selected.bathrooms}</span>}
                <span className="flex items-center gap-1"><MapPinIcon className="h-3 w-3" />{selected.area} m²</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full bg-white/5 border-white/20 text-white hover:bg-white/10"
                onClick={() => setCurrentView(primaryAction.view)}
              >
                {primaryAction.label}
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="m-4 mt-0 rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <MapPinIcon className="h-6 w-6 text-white/40 mx-auto mb-2" />
              <p className="text-[11px] text-white/60">Click any pin on the map to see property details here</p>
            </div>
          )}

          {/* Quick actions / network stats */}
          <div className="mt-auto p-4 border-t border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">TrustLand Network</p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {canAccessView(dashboardRole, 'agents') && <button onClick={() => setCurrentView('agents')} className="flex items-center gap-1 text-white/70 hover:text-white"><ChevronRight className="h-3 w-3" />Agents</button>}
              {canAccessView(dashboardRole, 'ledger') && <button onClick={() => setCurrentView('ledger')} className="flex items-center gap-1 text-white/70 hover:text-white"><ChevronRight className="h-3 w-3" />Trust Ledger</button>}
              {canAccessView(dashboardRole, 'transactions') && <button onClick={() => setCurrentView('transactions')} className="flex items-center gap-1 text-white/70 hover:text-white"><ChevronRight className="h-3 w-3" />Transactions</button>}
              {canAccessView(dashboardRole, 'diligence') && <button onClick={() => setCurrentView('diligence')} className="flex items-center gap-1 text-white/70 hover:text-white"><ChevronRight className="h-3 w-3" />Due Diligence</button>}
              {canAccessView(dashboardRole, 'autonomous-purchase') && <button onClick={() => setCurrentView('autonomous-purchase')} className="flex items-center gap-1 text-white/70 hover:text-white"><ChevronRight className="h-3 w-3" />Autonomous Purchase</button>}
              {canAccessView(dashboardRole, 'messages') && <button onClick={() => setCurrentView('messages')} className="flex items-center gap-1 text-white/70 hover:text-white"><ChevronRight className="h-3 w-3" />Messages</button>}
            </div>
          </div>
        </aside>
      </div>

      {/* ─── Bottom navigation bar ──────────────────────────────────────── */}
      <nav className="border-t border-white/10 bg-[#06143a] flex-shrink-0">
        <div className="max-w-[1400px] mx-auto px-6 py-2 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentView('overview')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/30"
            >
              <MapPinIcon className="h-3.5 w-3.5" /> Explore Properties
            </button>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Compass className="h-3.5 w-3.5" /> {dashboardRole === 'buyer' ? 'Buyer Dashboard' : dashboardRole === 'seller' ? 'Seller Dashboard' : 'Admin Dashboard'}
            </button>
            {canAccessView(dashboardRole, 'autonomous-purchase') && (
              <button
                onClick={() => setCurrentView('autonomous-purchase')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Sparkles className="h-3.5 w-3.5" /> Autonomous Purchase
              </button>
            )}
            <button
              onClick={() => setCurrentView('transactions')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Transactions
            </button>
          </div>
          <span className="text-white/40 hidden md:block">TrustLand Properties · Nairobi Metro Network</span>
        </div>
      </nav>
    </div>
  );
}
