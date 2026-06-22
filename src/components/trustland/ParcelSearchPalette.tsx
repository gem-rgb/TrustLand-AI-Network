// TrustLand AI Network — Parcel Search Palette
// A modal command-palette style search that lets users explore land parcels
// across the TrustLand network by text query, type, price range, and bedrooms.
// Hits POST /api/properties/search on the backend.

'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Search, MapPin, Home, Building2, LandPlot, Hotel, X, Loader2,
  SlidersHorizontal, ArrowRight, Bed, DollarSign,
} from 'lucide-react';
import { useTrustLandStore, type Property } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { filterProperties } from '@/lib/trustland-access';

const PROPERTY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'apartment', label: 'Apartments' },
  { value: 'house', label: 'Houses' },
  { value: 'land', label: 'Land Plots' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'estate', label: 'Estates' },
];

const PRICE_RANGES = [
  { value: '', label: 'Any Price', min: 0, max: Infinity },
  { value: '0-5',  label: 'Under KES 5M',  min: 0,         max: 5_000_000 },
  { value: '5-20', label: 'KES 5M–20M',    min: 5_000_000, max: 20_000_000 },
  { value: '20-50', label: 'KES 20M–50M',  min: 20_000_000, max: 50_000_000 },
  { value: '50+',  label: 'Over KES 50M',   min: 50_000_000, max: Infinity },
];

const BEDROOM_OPTIONS = [
  { value: '', label: 'Any' },
  { value: '1', label: '1+' },
  { value: '2', label: '2+' },
  { value: '3', label: '3+' },
  { value: '4', label: '4+' },
];

export default function ParcelSearchPalette({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect?: (property: Property) => void;
}) {
  const { properties, fetchProperties } = useTrustLandStore();
  const [query, setQuery] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Property[]>([]);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setHighlight(0);
    }
  }, [open]);

  // Debounced server-side search
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const range = PRICE_RANGES.find(r => r.value === priceRange);
        const body: Record<string, any> = {};
        if (query.trim()) body.query = query.trim();
        if (propertyType) body.propertyType = propertyType;
        if (range) { body.minPrice = range.min; body.maxPrice = range.max; }
        if (bedrooms) body.bedrooms = parseInt(bedrooms);

        const res = await fetch('/api/properties/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        if (!cancelled) setResults(Array.isArray(data) ? data : (data.results || []));
      } catch {
        if (!cancelled) {
          const range = PRICE_RANGES.find(r => r.value === priceRange);
          setResults(filterProperties(properties, {
            query: query.trim() || undefined,
            propertyType,
            minPrice: range?.min === Infinity ? undefined : range?.min,
            maxPrice: range?.max === Infinity ? undefined : range?.max,
            bedrooms: bedrooms ? parseInt(bedrooms, 10) : undefined,
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const t = setTimeout(run, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query, propertyType, priceRange, bedrooms, properties]);

  // Ensure properties are loaded for fallback
  useEffect(() => {
    if (open && properties.length === 0) fetchProperties();
  }, [open, properties.length, fetchProperties]);

  // Keyboard navigation
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && results[highlight]) { e.preventDefault(); handleSelect(results[highlight]); }
    if (e.key === 'Escape')    { e.preventDefault(); onClose(); }
  };

  const handleSelect = (p: Property) => {
    if (onSelect) onSelect(p);
    onClose();
  };

  const totalActive = [propertyType, priceRange, bedrooms].filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 bg-[#0c2350] border-white/20 text-white overflow-hidden">
        {/* Search input */}
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-5 w-5 text-orange-400" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search land parcels by neighborhood, address, type, or feature…"
              className="flex-1 bg-transparent border-0 text-lg text-white placeholder:text-white/30 focus-visible:ring-0 px-0"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
            <Button size="sm" variant="ghost" onClick={onClose} className="text-white/50 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <SlidersHorizontal className="h-3.5 w-3.5 text-white/40" />
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger className="h-7 w-[120px] bg-white/5 border-white/15 text-xs text-white">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priceRange} onValueChange={setPriceRange}>
              <SelectTrigger className="h-7 w-[140px] bg-white/5 border-white/15 text-xs text-white">
                <SelectValue placeholder="Price" />
              </SelectTrigger>
              <SelectContent>
                {PRICE_RANGES.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bedrooms} onValueChange={setBedrooms}>
              <SelectTrigger className="h-7 w-[90px] bg-white/5 border-white/15 text-xs text-white">
                <SelectValue placeholder="Beds" />
              </SelectTrigger>
              <SelectContent>
                {BEDROOM_OPTIONS.map(b => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {totalActive > 0 && (
              <button
                onClick={() => { setPropertyType(''); setPriceRange(''); setBedrooms(''); }}
                className="text-[11px] text-white/50 hover:text-white underline ml-1"
              >
                Clear filters ({totalActive})
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto">
          {results.length === 0 && !loading && (
            <div className="py-12 text-center text-white/50">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No land parcels match your search</p>
              <p className="text-xs mt-1">Try removing filters or broadening your query</p>
            </div>
          )}

          {results.map((p, i) => {
            const Icon = p.propertyType === 'apartment' ? Building2
                       : p.propertyType === 'land' ? LandPlot
                       : p.propertyType === 'commercial' ? Building2
                       : p.propertyType === 'estate' ? Hotel
                       : Home;
            return (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'w-full text-left flex items-center gap-3 px-4 py-3 border-b border-white/5 transition',
                  i === highlight ? 'bg-orange-500/15' : 'hover:bg-white/5'
                )}
              >
                <div className={cn(
                  'h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  p.propertyType === 'apartment' ? 'bg-blue-500/20' :
                  p.propertyType === 'land' ? 'bg-emerald-500/20' :
                  p.propertyType === 'commercial' ? 'bg-rose-500/20' :
                  p.propertyType === 'estate' ? 'bg-violet-500/20' : 'bg-amber-500/20'
                )}>
                  <Icon className="h-5 w-5 text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    {p.trustScore >= 80 && (
                      <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[9px] flex-shrink-0">
                        Featured
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-white/50 truncate flex items-center gap-1 mt-0.5">
                    <MapPin className="h-2.5 w-2.5" />
                    {p.address}, {p.city} · {p.propertyType}
                  </p>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-orange-400">
                    {p.currency} {(p.askingPrice / 1_000_000).toFixed(1)}M
                  </p>
                  <p className="text-[10px] text-white/50 flex items-center justify-end gap-1">
                    {p.bedrooms && <><Bed className="h-2.5 w-2.5" />{p.bedrooms} · </>}
                    {p.area} m²
                  </p>
                </div>

                <ArrowRight className={cn('h-4 w-4 flex-shrink-0 transition', i === highlight ? 'text-orange-400' : 'text-white/20')} />
              </button>
            );
          })}

          {results.length > 0 && (
            <div className="px-4 py-2 text-[10px] text-white/40 bg-black/20 border-t border-white/5">
              {results.length} parcel{results.length !== 1 ? 's' : ''} ·
              Press ↑↓ to navigate · Enter to select · Esc to close
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
