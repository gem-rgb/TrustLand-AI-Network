import { addAuditLedgerEntry, data, getDueDiligenceReports, getPropertyVerifications, } from './backend-data.js';
import { TrustLandPaymentError } from './payments.js';
const ACTIVE_TRANSACTION_STATUSES = new Set(['draft', 'offer_submitted', 'seller_review', 'due_diligence', 'legal_review', 'financing', 'approval', 'transfer']);
const STATUS_NORMALIZATION = {
    for_sale: 'for_sale',
    forsale: 'for_sale',
    forrent: 'for_rent',
    for_rent: 'for_rent',
    'off-market': 'off-market',
    offmarket: 'off-market',
    'off market': 'off-market',
};
function normalizeStatus(value) {
    if (!value)
        return undefined;
    const normalized = value.toLowerCase().trim().replace(/\s+/g, ' ');
    return STATUS_NORMALIZATION[normalized.replace(/\s+/g, '')]
        || STATUS_NORMALIZATION[normalized]
        || normalized;
}
function parseOptionalNumber(value) {
    if (value === null || value === undefined)
        return undefined;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function toStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return undefined;
}
function getPropertyOrThrow(propertyId) {
    const property = data.properties.find((item) => item.id === propertyId);
    if (!property) {
        throw new TrustLandPaymentError('Property not found', 404);
    }
    return property;
}
function hasActiveTransaction(propertyId) {
    return data.transactions.some((tx) => tx.propertyId === propertyId && ACTIVE_TRANSACTION_STATUSES.has(tx.status));
}
function isTerminalPropertyStatus(status) {
    const normalized = status.toLowerCase();
    return normalized === 'sold' || normalized === 'completed';
}
function assertPropertyAccess(session, property, requireOwnership = false) {
    if (session.role === 'admin')
        return;
    if (session.role !== 'seller') {
        if (requireOwnership) {
            throw new TrustLandPaymentError('Only sellers can edit listings', 403);
        }
        return;
    }
    if (property.ownerDid !== session.userId) {
        throw new TrustLandPaymentError('You can only manage properties you own', 403);
    }
    if (isTerminalPropertyStatus(property.status)) {
        throw new TrustLandPaymentError('Sold properties cannot be edited or archived by sellers', 403);
    }
}
function buildPropertyDetail(property) {
    return {
        ...property,
        documents: data.documents.filter((doc) => doc.propertyId === property.id),
        riskReports: data.riskReports.filter((report) => report.propertyId === property.id),
        attestations: data.attestations.filter((attestation) => attestation.subjectDid === property.ownerDid),
        verifications: getPropertyVerifications(property.id),
        dueDiligenceReports: getDueDiligenceReports(property.id),
    };
}
export function getPropertyDetailView(propertyId, session) {
    const property = getPropertyOrThrow(propertyId);
    if (session.role === 'seller' && property.ownerDid !== session.userId) {
        throw new TrustLandPaymentError('You can only view properties you manage through this endpoint', 403);
    }
    return buildPropertyDetail(property);
}
export function updatePropertyListing(propertyId, session, updates) {
    const property = getPropertyOrThrow(propertyId);
    assertPropertyAccess(session, property, true);
    const activeTransaction = hasActiveTransaction(property.id);
    const hasRestrictedChanges = Boolean(updates.propertyType !== undefined
        || updates.area !== undefined
        || updates.bedrooms !== undefined
        || updates.bathrooms !== undefined
        || updates.yearBuilt !== undefined
        || updates.askingPrice !== undefined
        || updates.currency !== undefined
        || updates.status !== undefined);
    if (activeTransaction && hasRestrictedChanges && session.role !== 'admin') {
        throw new TrustLandPaymentError('Active transactions lock pricing, status, and structural listing changes', 409);
    }
    const nextStatus = normalizeStatus(updates.status);
    if (nextStatus && !['for_sale', 'for_rent', 'off-market'].includes(nextStatus) && session.role !== 'admin') {
        throw new TrustLandPaymentError('Unsupported listing status', 400);
    }
    if (updates.title !== undefined)
        property.title = updates.title.trim();
    if (updates.address !== undefined)
        property.address = updates.address.trim();
    if (updates.city !== undefined)
        property.city = updates.city.trim();
    if (updates.region !== undefined)
        property.region = updates.region.trim();
    if (updates.propertyType !== undefined)
        property.propertyType = updates.propertyType.trim();
    const area = parseOptionalNumber(updates.area);
    if (area !== undefined)
        property.area = area;
    const bedrooms = parseOptionalNumber(updates.bedrooms);
    if (bedrooms !== undefined)
        property.bedrooms = bedrooms;
    const bathrooms = parseOptionalNumber(updates.bathrooms);
    if (bathrooms !== undefined)
        property.bathrooms = bathrooms;
    const yearBuilt = parseOptionalNumber(updates.yearBuilt);
    if (yearBuilt !== undefined)
        property.yearBuilt = yearBuilt;
    const askingPrice = parseOptionalNumber(updates.askingPrice);
    if (askingPrice !== undefined)
        property.askingPrice = askingPrice;
    if (updates.currency !== undefined)
        property.currency = updates.currency.trim().toUpperCase();
    if (updates.description !== undefined)
        property.description = updates.description.trim();
    const features = toStringArray(updates.features);
    if (features)
        property.features = features;
    const lat = parseOptionalNumber(updates.lat);
    if (lat !== undefined)
        property.lat = lat;
    const lng = parseOptionalNumber(updates.lng);
    if (lng !== undefined)
        property.lng = lng;
    if (nextStatus) {
        property.status = nextStatus;
        property.archivedAt = nextStatus === 'off-market' ? new Date().toISOString() : null;
    }
    property.updatedAt = new Date().toISOString();
    addAuditLedgerEntry(session.userId, session.role === 'admin' ? 'system' : 'user', 'property_updated', 'property', property.id, {
        ownerDid: property.ownerDid,
        propertyType: property.propertyType,
        askingPrice: property.askingPrice,
        currency: property.currency,
        status: property.status,
        activeTransaction,
        fields: Object.keys(updates),
    });
    return buildPropertyDetail(property);
}
export function archivePropertyListing(propertyId, session, reason) {
    const property = getPropertyOrThrow(propertyId);
    assertPropertyAccess(session, property, true);
    if (property.status !== 'off-market') {
        property.status = 'off-market';
    }
    property.archivedAt = new Date().toISOString();
    property.updatedAt = property.archivedAt;
    addAuditLedgerEntry(session.userId, session.role === 'admin' ? 'system' : 'user', 'property_archived', 'property', property.id, {
        ownerDid: property.ownerDid,
        reason: reason || 'Seller archived listing',
        activeTransaction: hasActiveTransaction(property.id),
    });
    return buildPropertyDetail(property);
}
