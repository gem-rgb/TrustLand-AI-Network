'use client';

import React from 'react';
import { Building2, CheckCircle2, Edit3, Loader2, MapPin, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useTrustLandStore, type Property } from '@/lib/store';
import { toast } from 'sonner';

type PropertyFormState = {
  title: string;
  address: string;
  city: string;
  region: string;
  propertyType: string;
  area: string;
  bedrooms: string;
  bathrooms: string;
  yearBuilt: string;
  askingPrice: string;
  currency: string;
  description: string;
  features: string;
  lat: string;
  lng: string;
  status: string;
};

const EMPTY_FORM: PropertyFormState = {
  title: '',
  address: '',
  city: '',
  region: '',
  propertyType: 'land',
  area: '',
  bedrooms: '',
  bathrooms: '',
  yearBuilt: '',
  askingPrice: '',
  currency: 'KES',
  description: '',
  features: '',
  lat: '',
  lng: '',
  status: 'for_sale',
};

const STATUS_LABELS: Record<string, string> = {
  for_sale: 'For Sale',
  for_rent: 'For Rent',
  'off-market': 'Off Market',
};

function normalizeStatus(status: string) {
  const value = status.toLowerCase().trim().replace(/\s+/g, ' ');
  if (value === 'for rent' || value === 'for_rent') return 'for_rent';
  if (value === 'off market' || value === 'off-market' || value === 'offmarket') return 'off-market';
  return 'for_sale';
}

function statusLabel(status: string) {
  return STATUS_LABELS[normalizeStatus(status)] || status;
}

function toFormState(property: Property): PropertyFormState {
  return {
    title: property.title,
    address: property.address,
    city: property.city,
    region: property.region,
    propertyType: property.propertyType,
    area: String(property.area ?? ''),
    bedrooms: property.bedrooms == null ? '' : String(property.bedrooms),
    bathrooms: property.bathrooms == null ? '' : String(property.bathrooms),
    yearBuilt: property.yearBuilt == null ? '' : String(property.yearBuilt),
    askingPrice: String(property.askingPrice ?? ''),
    currency: property.currency || 'KES',
    description: property.description,
    features: (property.features || []).join(', '),
    lat: String(property.lat ?? ''),
    lng: String(property.lng ?? ''),
    status: normalizeStatus(property.status),
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function SellerPropertyManager({ onCreateNewListing }: { onCreateNewListing?: () => void }) {
  const { properties, sessionIdentityDid, sessionKycStatus, updateProperty, deleteProperty } = useTrustLandStore();
  const [editingProperty, setEditingProperty] = React.useState<Property | null>(null);
  const [form, setForm] = React.useState<PropertyFormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [archivingId, setArchivingId] = React.useState<string | null>(null);

  const ownedProperties = sessionIdentityDid
    ? properties.filter((property) => property.ownerDid === sessionIdentityDid)
    : [];

  React.useEffect(() => {
    if (editingProperty) {
      setForm(toFormState(editingProperty));
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingProperty]);

  const openEditor = (property: Property) => {
    setEditingProperty(property);
  };

  const closeEditor = () => {
    setEditingProperty(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!editingProperty) return;

    setSaving(true);
    try {
      await updateProperty(editingProperty.id, {
        title: form.title.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        region: form.region.trim(),
        propertyType: form.propertyType.trim(),
        area: parseOptionalNumber(form.area) ?? undefined,
        bedrooms: parseOptionalNumber(form.bedrooms),
        bathrooms: parseOptionalNumber(form.bathrooms),
        yearBuilt: parseOptionalNumber(form.yearBuilt),
        askingPrice: parseOptionalNumber(form.askingPrice) ?? undefined,
        currency: form.currency.trim().toUpperCase(),
        description: form.description.trim(),
        features: form.features.split(',').map((feature) => feature.trim()).filter(Boolean),
        lat: parseOptionalNumber(form.lat) ?? undefined,
        lng: parseOptionalNumber(form.lng) ?? undefined,
        status: normalizeStatus(form.status),
      });
      toast.success('Property listing updated');
      closeEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update listing';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (property: Property) => {
    const confirmed = window.confirm(
      `Archive "${property.title}"? This hides the listing from the market but keeps transaction history intact.`
    );
    if (!confirmed) return;

    setArchivingId(property.id);
    try {
      await deleteProperty(property.id);
      toast.success('Property archived off-market');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to archive property';
      toast.error(message);
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold">My Listings</h3>
            <p className="text-sm text-white/60">Edit your properties or archive them from the market.</p>
          </div>
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

        {ownedProperties.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {ownedProperties.slice(0, 4).map((property) => (
              <div key={property.id} className="rounded-xl border border-white/10 bg-[#0c2350]/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{property.title}</p>
                    <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{property.city}, {property.region}</span>
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-white/20 text-white/70">
                    {statusLabel(property.status)}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-teal-200 font-semibold">{property.currency} {property.askingPrice.toLocaleString()}</span>
                  <span className="text-white/60">Trust {property.trustScore}%</span>
                </div>
                <p className="mt-2 text-xs text-white/55 line-clamp-3">{property.description}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white/5 border-white/15 text-white hover:bg-white/10"
                    onClick={() => openEditor(property)}
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white/5 border-red-500/20 text-red-200 hover:bg-red-500/10 hover:text-red-100"
                    onClick={() => handleDelete(property)}
                    disabled={archivingId === property.id}
                  >
                    {archivingId === property.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    Delete
                  </Button>
                </div>

                {property.updatedAt && (
                  <p className="mt-3 text-[10px] text-white/40">
                    Updated {new Date(property.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-8 text-center">
            <Building2 className="h-10 w-10 mx-auto text-white/30 mb-3" />
            <p className="font-medium">No listings are linked to this seller yet.</p>
            <p className="text-sm text-white/60 mt-1">Use AI parcel upload to publish a new property listing.</p>
            <Button className="mt-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 border-0 text-white" onClick={onCreateNewListing}>
              <Plus className="h-4 w-4 mr-2" /> Launch AI Listing
            </Button>
          </div>
        )}
      </div>

      <Dialog open={Boolean(editingProperty)} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="max-w-3xl bg-[#0c2350] border-white/20 text-white">
          <DialogHeader>
            <DialogTitle>Edit Property Listing</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Property Type</Label>
              <Select value={form.propertyType} onValueChange={(value) => setForm((current) => ({ ...current, propertyType: value }))}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c2350] border-white/15 text-white">
                  <SelectItem value="land">Land</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="house">House</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="estate">Estate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <Input value={form.region} onChange={(event) => setForm((current) => ({ ...current, region: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Listing Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c2350] border-white/15 text-white">
                  <SelectItem value="for_sale">For Sale</SelectItem>
                  <SelectItem value="for_rent">For Rent</SelectItem>
                  <SelectItem value="off-market">Off Market</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Asking Price</Label>
              <Input type="number" value={form.askingPrice} onChange={(event) => setForm((current) => ({ ...current, askingPrice: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Input type="number" value={form.area} onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Bedrooms</Label>
              <Input type="number" value={form.bedrooms} onChange={(event) => setForm((current) => ({ ...current, bedrooms: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Bathrooms</Label>
              <Input type="number" value={form.bathrooms} onChange={(event) => setForm((current) => ({ ...current, bathrooms: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Year Built</Label>
              <Input type="number" value={form.yearBuilt} onChange={(event) => setForm((current) => ({ ...current, yearBuilt: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Latitude</Label>
              <Input type="number" value={form.lat} onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Longitude</Label>
              <Input type="number" value={form.lng} onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))} className="bg-white/5 border-white/15 text-white" />
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-28 bg-white/5 border-white/15 text-white" />
          </div>
          <div className="space-y-2 mt-4">
            <Label>Features</Label>
            <Input value={form.features} onChange={(event) => setForm((current) => ({ ...current, features: event.target.value }))} placeholder="Garden, Garage, Pool" className="bg-white/5 border-white/15 text-white placeholder:text-white/35" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-white/55">
              Seller edits are validated on the server. Archive uses the delete action and keeps transaction history intact.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="bg-white/5 border-white/15 text-white hover:bg-white/10" onClick={closeEditor}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  void handleSave();
                }}
                disabled={saving}
                className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
