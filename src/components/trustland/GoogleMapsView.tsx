// TrustLand AI Network — Google Maps integration
// Real interactive Google Map of Nairobi property network with:
//   - Custom property markers (red = featured trust≥80, blue = standard)
//   - InfoWindow with property details + CTA
//   - Google Places Autocomplete search bar (search neighborhoods, addresses, landmarks)
//   - "Use my location" geolocation
//   - Auto-fit bounds to filtered properties
//   - Graceful fallback to the original stylized SVG map if no API key is set
//
// Required env: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
// (Google Cloud Console → APIs: Maps JavaScript API, Places API, Geocoding API)

'use client';

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
  Autocomplete,
} from '@react-google-maps/api';
import {
  Search, MapPin as MapPinIcon, Locate, Shield, Bed, Bath, Maximize,
  Star, Navigation, Layers, X, AlertCircle,
} from 'lucide-react';
import { useTrustLandStore, type Property } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── Map config ─────────────────────────────────────────────────────────────
const NAIROBI_CENTER = { lat: -1.2864, lng: 36.8172 };

const CONTAINER_STYLE = {
  width: '100%',
  height: '100%',
};

const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  clickableIcons: true,
  styles: [
    { elementType: 'geometry', stylers: [{ color: '#0e1f44' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0a1f44' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9fb3d1' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#ffb27a' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9fb3d1' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#14532d' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e2c52' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3b82f6' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a3f6b' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c2340' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
  ],
};

const LIBRARIES: ('places' | 'geometry')[] = ['places', 'geometry'];

// Custom SVG pin (data URI) — keeps the orange/red TrustLand brand
function pinIcon(color: string, scale = 1): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <defs>
        <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
        </filter>
      </defs>
      <path filter="url(#s)" fill="${color}" stroke="#fff" stroke-width="2"
        d="M16 0C7.16 0 0 7.16 0 16c0 11 16 24 16 24s16-13 16-24C32 7.16 24.84 0 16 0z"/>
      <circle cx="16" cy="16" r="6" fill="#fff"/>
    </svg>`;
  return {
    url: 'data:image/svg+xml;utf8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(32 * scale, 40 * scale),
    anchor: new google.maps.Point(16 * scale, 40 * scale),
  };
}

// ─── Fallback SVG map (used when API key is missing) ────────────────────────
const MAP_BOUNDS = { minLat: -1.345, maxLat: -1.20, minLng: 36.68, maxLng: 36.95 };
function latLngToMapXY(lat: number, lng: number) {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
  const y = ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}

function FallbackSvgMap({
  properties, selectedId, onSelect,
}: { properties: Property[]; selectedId: string | null; onSelect: (p: Property) => void }) {
  return (
    <div className="absolute inset-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <radialGradient id="mapBg2" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="#0e2b5e" />
            <stop offset="100%" stopColor="#06143a" />
          </radialGradient>
          <linearGradient id="riverGrad2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#1e40af" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#mapBg2)" />
        {[20, 40, 60, 80].map(v => (
          <g key={v}>
            <line x1={v} y1={0} x2={v} y2={100} stroke="#1e3a8a" strokeWidth="0.15" opacity="0.4" />
            <line x1={0} y1={v} x2={100} y2={v} stroke="#1e3a8a" strokeWidth="0.15" opacity="0.4" />
          </g>
        ))}
        <path d="M 0 50 Q 30 45 50 50 T 100 50" stroke="#3b82f6" strokeWidth="0.4" fill="none" opacity="0.5" />
        <path d="M 50 0 Q 55 30 50 50 T 50 100" stroke="#3b82f6" strokeWidth="0.4" fill="none" opacity="0.5" />
        <path d="M 15 60 Q 35 65 50 55 T 90 45" stroke="url(#riverGrad2)" strokeWidth="1.2" fill="none" opacity="0.7" />
        <circle cx="22" cy="68" r="6" fill="#15803d" opacity="0.25" />
        <circle cx="75" cy="30" r="5" fill="#15803d" opacity="0.25" />
        <circle cx="55" cy="80" r="4" fill="#15803d" opacity="0.2" />
      </svg>
      <div className="absolute inset-0">
        {properties.slice(0, 60).map(p => {
          const { x, y } = latLngToMapXY(p.lat, p.lng);
          const featured = p.trustScore >= 80;
          const selected = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute -translate-x-1/2 -translate-y-full focus:outline-none group"
              title={p.title}
            >
              <div className={cn(
                'rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-125',
                featured ? 'bg-red-500 h-5 w-5' : 'bg-blue-500 h-4 w-4',
                selected && 'ring-4 ring-white/50 scale-125'
              )} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── No-API-key banner ──────────────────────────────────────────────────────
function MissingKeyBanner() {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-md">
      <div className="bg-amber-500/95 text-amber-950 rounded-lg px-3 py-2 flex items-center gap-2 shadow-xl border border-amber-300">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <div className="text-[11px]">
          <p className="font-semibold">Showing demo map</p>
          <p>
            Set <code className="bg-amber-950/20 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in{' '}
            <code className="bg-amber-950/20 px-1 rounded">.env</code> to enable live Google Maps.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Property InfoWindow content ────────────────────────────────────────────
function PropertyInfoWindow({
  property, onClose, onStartPurchase,
}: {
  property: Property;
  onClose: () => void;
  onStartPurchase: () => void;
}) {
  return (
    <div className="font-sans w-56">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-slate-900 leading-tight">{property.title}</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 -mt-1 -mr-1">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-slate-500 mb-2">{property.address}, {property.city}, {property.country}</p>

      <div className="flex items-center justify-between mb-2">
        <span className="text-base font-bold text-orange-600">KES {(property.askingPrice / 1_000_000).toFixed(2)}M</span>
        <Badge className={cn(
          'text-[10px] h-5',
          property.trustScore >= 80 ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
          : property.trustScore >= 60 ? 'bg-amber-100 text-amber-700 border border-amber-300'
          : 'bg-rose-100 text-rose-700 border border-rose-300'
        )}>
          <Shield className="h-2.5 w-2.5 mr-1" />{property.trustScore}%
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-slate-600 mb-3">
        {property.bedrooms != null && (
          <span className="flex items-center gap-1"><Bed className="h-3 w-3" />{property.bedrooms}</span>
        )}
        {property.bathrooms != null && (
          <span className="flex items-center gap-1"><Bath className="h-3 w-3" />{property.bathrooms}</span>
        )}
        <span className="flex items-center gap-1"><Maximize className="h-3 w-3" />{property.area} m²</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {property.features.slice(0, 3).map(f => (
          <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{f}</span>
        ))}
      </div>

      <Button
        size="sm"
        className="w-full h-7 text-[11px] bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0"
        onClick={onStartPurchase}
      >
        <Star className="h-3 w-3 mr-1" /> Start Autonomous Purchase
      </Button>
    </div>
  );
}

// ─── Main Google Maps View ──────────────────────────────────────────────────
export default function GoogleMapsView({
  heightClass = 'h-full',
  properties: injectedProperties,
}: {
  heightClass?: string;
  /** Optional pre-filtered property list. Falls back to all store properties. */
  properties?: Property[];
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasKey = Boolean(apiKey && apiKey.length > 10);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: hasKey ? (apiKey as string) : '',
    libraries: LIBRARIES,
    // Don't try to load if no key — saves a network round-trip
    id: 'trustland-google-maps',
  });

  const { properties: storeProperties, setCurrentView } = useTrustLandStore();
  // Prefer injected filtered list; otherwise use all store properties
  const filtered = injectedProperties && injectedProperties.length > 0
    ? injectedProperties
    : storeProperties;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [center, setCenter] = useState(NAIROBI_CENTER);
  const [zoom, setZoom] = useState(12);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'satellite'>('roadmap');

  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const boundsRef = useRef<google.maps.LatLngBounds | null>(null);

  const selected = useMemo(() => filtered.find(p => p.id === selectedId) || null, [filtered, selectedId]);

  // Fit bounds to filtered properties on first load / when filter changes
  const fitToProperties = useCallback((list: Property[]) => {
    if (!mapRef.current || !hasKey || list.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    list.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
    // If only 1 property, zoom in; else fit
    if (list.length === 1) {
      mapRef.current.setCenter({ lat: list[0].lat, lng: list[0].lng });
      mapRef.current.setZoom(15);
    } else {
      mapRef.current.fitBounds(bounds, 60);
    }
    boundsRef.current = bounds;
  }, [hasKey]);

  // Auto-fit when filtered list changes (debounced via effect)
  useEffect(() => {
    if (isLoaded && filtered.length > 0) {
      const t = setTimeout(() => fitToProperties(filtered), 150);
      return () => clearTimeout(t);
    }
  }, [isLoaded, filtered, fitToProperties]);

  // Geolocation
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setCenter(loc);
        setZoom(14);
        mapRef.current?.panTo(loc);
      },
      (err) => console.warn('Geolocation error:', err.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Autocomplete
  const onAutocompleteLoad = (ac: google.maps.places.Autocomplete) => {
    autocompleteRef.current = ac;
  };
  const onPlaceChanged = () => {
    const ac = autocompleteRef.current;
    if (!ac) return;
    const place = ac.getPlace();
    if (!place.geometry?.location) return;
    const loc = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    setCenter(loc);
    setZoom(14);
    mapRef.current?.panTo(loc);
  };

  const handleStartPurchase = useCallback(() => {
    setCurrentView('autonomous-purchase');
  }, [setCurrentView]);

  const onLoadMap = (map: google.maps.Map) => { mapRef.current = map; };
  const onUnmountMap = () => { mapRef.current = null; };

  // ─── No key → fallback SVG ────────────────────────────────────────────────
  if (!hasKey) {
    return (
      <div className={cn('relative w-full bg-[#0a1f44]', heightClass)}>
        <MissingKeyBanner />
        <FallbackSvgMap
          properties={filtered}
          selectedId={selectedId}
          onSelect={(p) => setSelectedId(p.id)}
        />
      </div>
    );
  }

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className={cn('relative w-full bg-[#0a1f44] flex items-center justify-center', heightClass)}>
        <div className="text-center text-white/70 max-w-sm px-4">
          <AlertCircle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
          <p className="text-sm font-semibold mb-1">Failed to load Google Maps</p>
          <p className="text-xs text-white/50">{String(loadError.message || loadError)}</p>
          <p className="text-[11px] text-white/40 mt-2">
            Verify your API key has Maps JavaScript API + Places API enabled.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={cn('relative w-full bg-[#0a1f44] flex items-center justify-center', heightClass)}>
        <div className="text-center text-white/70">
          <div className="inline-block h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin mb-3" />
          <p className="text-sm">Loading Google Maps…</p>
        </div>
      </div>
    );
  }

  // ─── Loaded map ────────────────────────────────────────────────────────────
  return (
    <div className={cn('relative w-full bg-[#0a1f44]', heightClass)}>
      {/* Top search + controls overlay */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 pointer-events-none">
        {/* Google Places Autocomplete search box */}
        <div className="pointer-events-auto flex-1 max-w-md">
          <Autocomplete onLoad={onAutocompleteLoad} onPlaceChanged={onPlaceChanged}
            restrictions={{ country: 'ke' }}
            fields={['geometry', 'name', 'formatted_address']}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search neighborhoods, addresses, landmarks…"
                className="w-full h-10 pl-10 pr-3 rounded-md bg-white text-slate-900 text-sm placeholder:text-slate-400 shadow-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </Autocomplete>
        </div>

        {/* Property count badge */}
        <div className="pointer-events-auto">
          <Badge className="bg-orange-500/95 border-0 text-white shadow-lg h-10 px-3 flex items-center gap-1">
            <MapPinIcon className="h-3.5 w-3.5" />
            {filtered.length} properties
          </Badge>
        </div>

        {/* Map type toggle */}
        <button
          onClick={() => setMapTypeId(t => t === 'roadmap' ? 'satellite' : 'roadmap')}
          className="pointer-events-auto h-10 px-3 rounded-md bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20 flex items-center gap-1 shadow-lg"
        >
          <Layers className="h-3.5 w-3.5" />
          {mapTypeId === 'roadmap' ? 'Road' : 'Satellite'}
        </button>

        {/* Locate me */}
        <button
          onClick={handleLocate}
          title="Use my location"
          className="pointer-events-auto h-10 w-10 rounded-md bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center shadow-lg"
        >
          <Locate className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom-right recenter button */}
      <button
        onClick={() => {
          if (filtered.length) {
            fitToProperties(filtered);
          } else {
            mapRef.current?.panTo(NAIROBI_CENTER);
            mapRef.current?.setZoom(12);
          }
        }}
        className="absolute bottom-4 right-4 z-10 h-10 w-10 rounded-md bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center shadow-lg"
        title="Fit all properties"
      >
        <Navigation className="h-4 w-4" />
      </button>

      <GoogleMap
        mapContainerStyle={CONTAINER_STYLE}
        center={center}
        zoom={zoom}
        onLoad={onLoadMap}
        onUnmount={onUnmountMap}
        options={{ ...MAP_OPTIONS, mapTypeId, mapTypeControl: false }}
      >
        {/* User location marker */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={{
              url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="6" fill="#3b82f6" stroke="#fff" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>'
              ),
              scaledSize: new google.maps.Size(24, 24),
              anchor: new google.maps.Point(12, 12),
            }}
          />
        )}

        {/* Property markers */}
        {filtered.slice(0, 200).map(p => {
          const featured = p.trustScore >= 80;
          const isSelected = p.id === selectedId;
          return (
            <Marker
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              icon={pinIcon(featured ? '#ef4444' : '#3b82f6', isSelected ? 1.25 : 1)}
              onClick={() => {
                setSelectedId(p.id);
                mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
              }}
              title={p.title}
            />
          );
        })}

        {/* InfoWindow for selected property */}
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelectedId(null)}
            options={{ pixelOffset: new google.maps.Size(0, -32) }}
          >
            <PropertyInfoWindow
              property={selected}
              onClose={() => setSelectedId(null)}
              onStartPurchase={handleStartPurchase}
            />
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Bottom-left legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/50 backdrop-blur-sm rounded-lg p-2 border border-white/10">
        <p className="text-[10px] text-white/70 mb-1 font-medium">Trust Score Legend</p>
        <div className="space-y-0.5 text-[10px] text-white/70">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 border border-white/40" /> Featured (≥80%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 border border-white/40" /> Standard (60–79%)
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-700 border border-white/40" /> Low Trust (&lt;60%)
          </div>
        </div>
      </div>
    </div>
  );
}
