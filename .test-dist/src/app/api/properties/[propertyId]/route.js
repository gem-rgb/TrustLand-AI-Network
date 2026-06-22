import { NextResponse } from 'next/server';
import { addAuditLedgerEntry, data, getDueDiligenceReports, getPropertyVerifications, } from '@/lib/backend-data';
import { getPaymentSessionFromHeaders, TrustLandPaymentError } from '@/lib/payments';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
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
function readPropertyId(params) {
    return params.then((resolved) => resolved.propertyId?.trim() || '');
}
function jsonError(error) {
    if (error instanceof TrustLandPaymentError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Property mutation failed:', error);
    return NextResponse.json({ error: 'Unable to process property request' }, { status: 500 });
}
function normalizeStatus(value) {
    if (!value)
        return undefined;
    const normalized = value.toLowerCase().trim().replace(/\s+/g, ' ');
    return STATUS_NORMALIZATION[normalized.replace(/\s+/g, '')]
        || STATUS_NORMALIZATION[normalized]
        || normalized;
}
function parsePropertyUpdate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new TrustLandPaymentError('Invalid property payload', 400);
    }
    return body;
}
function toNumberOrNull(value) {
    if (value === null)
        return undefined;
    if (value === undefined)
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
function isTerminalPropertyStatus(status) {
    const normalized = status.toLowerCase();
    return normalized === 'sold' || normalized === 'completed';
}
function hasActiveTransaction(propertyId) {
    return data.transactions.some((tx) => tx.propertyId === propertyId && ACTIVE_TRANSACTION_STATUSES.has(tx.status));
}
function getPropertyOrThrow(propertyId) {
    const property = data.properties.find((item) => item.id === propertyId);
    if (!property) {
        throw new TrustLandPaymentError('Property not found', 404);
    }
    return property;
}
function assertWriteAccess(session, property) {
    if (session.role === 'admin')
        return;
    if (session.role !== 'seller') {
        throw new TrustLandPaymentError('Only sellers can edit listings', 403);
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
function applyPropertyUpdate(property, updates, session) {
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
    const area = toNumberOrNull(updates.area);
    if (area !== undefined)
        property.area = area;
    const bedrooms = toNumberOrNull(updates.bedrooms);
    if (bedrooms !== undefined)
        property.bedrooms = bedrooms;
    const bathrooms = toNumberOrNull(updates.bathrooms);
    if (bathrooms !== undefined)
        property.bathrooms = bathrooms;
    const yearBuilt = toNumberOrNull(updates.yearBuilt);
    if (yearBuilt !== undefined)
        property.yearBuilt = yearBuilt;
    const askingPrice = toNumberOrNull(updates.askingPrice);
    if (askingPrice !== undefined)
        property.askingPrice = askingPrice;
    if (updates.currency !== undefined)
        property.currency = updates.currency.trim().toUpperCase();
    if (updates.description !== undefined)
        property.description = updates.description.trim();
    const features = toStringArray(updates.features);
    if (features)
        property.features = features;
    const lat = toNumberOrNull(updates.lat);
    if (lat !== undefined)
        property.lat = lat;
    const lng = toNumberOrNull(updates.lng);
    if (lng !== undefined)
        property.lng = lng;
    if (nextStatus) {
        property.status = nextStatus;
        if (nextStatus === 'off-market') {
            property.archivedAt = new Date().toISOString();
        }
        else {
            property.archivedAt = null;
        }
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
    return property;
}
function archiveProperty(property, session, reason) {
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
    return property;
}
export async function GET(request, context) {
    try {
        const session = getPaymentSessionFromHeaders(request.headers);
        const propertyId = await readPropertyId(context.params);
        if (!propertyId) {
            throw new TrustLandPaymentError('Property ID is required', 400);
        }
        const property = getPropertyOrThrow(propertyId);
        if (session.role === 'seller' && property.ownerDid !== session.userId) {
            throw new TrustLandPaymentError('You can only view properties you manage through this endpoint', 403);
        }
        return NextResponse.json(buildPropertyDetail(property));
    }
    catch (error) {
        return jsonError(error);
    }
}
export async function PUT(request, context) {
    try {
        const session = getPaymentSessionFromHeaders(request.headers);
        const propertyId = await readPropertyId(context.params);
        if (!propertyId) {
            throw new TrustLandPaymentError('Property ID is required', 400);
        }
        const property = getPropertyOrThrow(propertyId);
        assertWriteAccess(session, property);
        const body = await request.json().catch(() => null);
        const updates = parsePropertyUpdate(body);
        applyPropertyUpdate(property, updates, session);
        return NextResponse.json({ property: buildPropertyDetail(property), updated: true });
    }
    catch (error) {
        return jsonError(error);
    }
}
export async function DELETE(request, context) {
    try {
        const session = getPaymentSessionFromHeaders(request.headers);
        const propertyId = await readPropertyId(context.params);
        if (!propertyId) {
            throw new TrustLandPaymentError('Property ID is required', 400);
        }
        const property = getPropertyOrThrow(propertyId);
        assertWriteAccess(session, property);
        const body = await request.json().catch(() => null);
        const reason = body && typeof body === 'object' && !Array.isArray(body) && typeof body.reason === 'string'
            ? body.reason
            : undefined;
        archiveProperty(property, session, reason);
        return NextResponse.json({ property: buildPropertyDetail(property), archived: true });
    }
    catch (error) {
        return jsonError(error);
    }
}
