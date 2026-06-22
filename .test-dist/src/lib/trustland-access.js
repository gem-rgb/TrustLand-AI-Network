const ROLE_VIEW_ACCESS = {
    admin: new Set([
        'overview',
        'dashboard',
        'agents',
        'ledger',
        'transactions',
        'finance',
        'diligence',
        'trust-score',
        'messages',
        'identities',
        'verification',
        'trust-engine',
        'audit-ledger',
        'analytics',
    ]),
    buyer: new Set([
        'overview',
        'dashboard',
        'diligence',
        'trust-score',
        'messages',
        'autonomous-purchase',
    ]),
    seller: new Set([
        'overview',
        'dashboard',
        'diligence',
        'trust-score',
        'messages',
        'withdrawals',
    ]),
};
const PROPERTY_TYPE_GROUPS = {
    apartment: ['apartment', 'apartments', 'flat', 'flats', 'studio', 'studios', 'condo', 'condominium', 'penthouse', 'residential'],
    house: ['house', 'houses', 'villa', 'villas', 'townhouse', 'townhouses', 'bungalow', 'bungalows', 'maisonette', 'maisonettes', 'residential'],
    land: ['land', 'lands', 'plot', 'plots', 'parcel', 'parcels', 'acre', 'acres', 'agricultural', 'farm', 'farmland'],
    commercial: ['commercial', 'office', 'offices', 'retail', 'warehouse', 'warehouses', 'industrial', 'shop', 'shops'],
    estate: ['estate', 'estates', 'mansion', 'mansions', 'compound', 'compounds', 'gated'],
};
const PROPERTY_STATUS_GROUPS = {
    'for sale': ['for sale', 'sale', 'available', 'active'],
    'for rent': ['for rent', 'rent', 'lease', 'leased'],
    sold: ['sold', 'completed'],
    'off-market': ['off-market', 'off market', 'private', 'hidden'],
};
function normalizeText(value) {
    return value.toLowerCase().trim().replace(/\s+/g, ' ');
}
function matchesFeature(property, keywords) {
    const propertyFeatures = (property.features || []).map((feature) => normalizeText(feature));
    return keywords.some((keyword) => propertyFeatures.some((feature) => feature.includes(keyword)));
}
function inferPropertyCondition(property) {
    const yearBuilt = property.yearBuilt ?? undefined;
    if (!yearBuilt)
        return 'good';
    const age = new Date().getFullYear() - yearBuilt;
    if (age <= 5)
        return 'new';
    if (age <= 15)
        return 'good';
    return 'renovation needed';
}
export function deriveDashboardRole(roleLike) {
    const role = normalizeText(roleLike || '');
    if (role === 'buyer')
        return 'buyer';
    if (role === 'seller')
        return 'seller';
    return 'admin';
}
export function getDashboardRoleLabel(role) {
    switch (role) {
        case 'buyer':
            return 'Buyer Dashboard';
        case 'seller':
            return 'Seller Dashboard';
        default:
            return 'Admin Dashboard';
    }
}
export function canAccessView(role, view) {
    if (view === 'auth')
        return true;
    if (role === 'admin')
        return true;
    return ROLE_VIEW_ACCESS[role]?.has(view) ?? false;
}
export function normalizePropertyType(value) {
    const normalized = normalizeText(value);
    if (normalized.startsWith('apart'))
        return 'apartment';
    if (normalized.startsWith('house') || normalized.startsWith('villa') || normalized.startsWith('town') || normalized.startsWith('bungal') || normalized.startsWith('maison'))
        return 'house';
    if (normalized.startsWith('land') || normalized.startsWith('plot') || normalized.startsWith('parcel') || normalized.startsWith('acre') || normalized.startsWith('agri') || normalized.startsWith('farm'))
        return 'land';
    if (normalized.startsWith('commercial') || normalized.startsWith('office') || normalized.startsWith('retail') || normalized.startsWith('warehouse') || normalized.startsWith('industrial') || normalized.startsWith('shop'))
        return 'commercial';
    if (normalized.startsWith('estate') || normalized.startsWith('mansion') || normalized.startsWith('compound') || normalized.startsWith('gated'))
        return 'estate';
    return normalized;
}
export function matchesPropertyType(propertyType, selectedType) {
    const actual = normalizePropertyType(propertyType);
    const selected = normalizePropertyType(selectedType);
    if (!selected)
        return true;
    if (actual === selected)
        return true;
    const selectedAliases = PROPERTY_TYPE_GROUPS[selected] || [selected];
    if (selectedAliases.includes(actual))
        return true;
    const actualAliases = PROPERTY_TYPE_GROUPS[actual] || [actual];
    return actualAliases.includes(selected);
}
export function matchesPropertyStatus(propertyStatus, selectedStatus) {
    const actual = normalizeText(propertyStatus || '');
    const selected = normalizeText(selectedStatus || '');
    if (!selected)
        return true;
    if (actual === selected)
        return true;
    const selectedAliases = PROPERTY_STATUS_GROUPS[selected] || [selected];
    if (selectedAliases.includes(actual))
        return true;
    const actualAliases = PROPERTY_STATUS_GROUPS[actual] || [actual];
    return actualAliases.includes(selected);
}
export function propertySearchHaystack(property) {
    return [
        property.title,
        property.address,
        property.city,
        property.region,
        property.country || '',
        property.propertyType,
        property.status || '',
        property.description || '',
        ...(property.features || []),
    ].join(' ').toLowerCase();
}
export function matchesPropertyQuery(property, query) {
    const q = normalizeText(query);
    if (!q)
        return true;
    return propertySearchHaystack(property).includes(q);
}
export function filterProperties(properties, filters = {}) {
    const query = filters.query?.trim() || '';
    const propertyTypes = [
        ...(filters.propertyTypes || []),
        ...(filters.propertyType ? [filters.propertyType] : []),
    ].map(normalizePropertyType).filter(Boolean);
    const features = (filters.features || []).map(normalizeText).filter(Boolean);
    const garage = (filters.garage || []).map(normalizeText).filter(Boolean);
    const garden = (filters.garden || []).map(normalizeText).filter(Boolean);
    const conditions = (filters.cond || []).map(normalizeText).filter(Boolean);
    const city = filters.city?.trim() || '';
    const region = filters.region?.trim() || '';
    const status = filters.status?.trim() || '';
    return properties.filter((property) => {
        if (query && !matchesPropertyQuery(property, query))
            return false;
        if (city && !property.city.toLowerCase().includes(city.toLowerCase()))
            return false;
        if (region && !property.region.toLowerCase().includes(region.toLowerCase()))
            return false;
        const isVisibleListing = matchesPropertyStatus(property.status, 'For Sale') || matchesPropertyStatus(property.status, 'For Rent');
        if (!status && !isVisibleListing)
            return false;
        if (status && !matchesPropertyStatus(property.status, status))
            return false;
        if (propertyTypes.length && !propertyTypes.some((type) => matchesPropertyType(property.propertyType, type)))
            return false;
        const askingPrice = property.askingPrice ?? 0;
        if (filters.minPrice != null && askingPrice < filters.minPrice)
            return false;
        if (filters.maxPrice != null && askingPrice > filters.maxPrice)
            return false;
        if (filters.bedrooms != null && (property.bedrooms ?? 0) < filters.bedrooms)
            return false;
        if (filters.bathrooms != null && (property.bathrooms ?? 0) < filters.bathrooms)
            return false;
        if (features.length) {
            const propertyFeatures = (property.features || []).map((feature) => feature.toLowerCase());
            if (!features.some((feature) => propertyFeatures.some((propertyFeature) => propertyFeature.includes(feature)))) {
                return false;
            }
        }
        if (garage.length) {
            const hasGarage = matchesFeature(property, ['garage', 'parking', 'carport']);
            if (garage.includes('yes') && !hasGarage)
                return false;
            if (garage.includes('no') && hasGarage)
                return false;
        }
        if (garden.length) {
            const hasGarden = matchesFeature(property, ['garden', 'landscap', 'yard', 'lawn', 'backyard']);
            if (garden.includes('yes') && !hasGarden)
                return false;
            if (garden.includes('no') && hasGarden)
                return false;
        }
        if (conditions.length) {
            const actualCondition = inferPropertyCondition(property);
            if (!conditions.some((condition) => actualCondition === condition))
                return false;
        }
        return true;
    });
}
