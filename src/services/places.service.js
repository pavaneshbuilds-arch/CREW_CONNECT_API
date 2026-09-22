import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const NEARBY_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_BIAS_RADIUS_M = 50_000;
const ADDRESS_NEARBY_RADIUS_M = 1500;
const PINCODE_NEARBY_RADIUS_M = 3000;
const PIN_RE = /\b(\d{6})\b/;
const ADDRESS_TOKENS = new Set([
  'road',
  'rd',
  'nagar',
  'colony',
  'street',
  'st',
  'lane',
  'ln',
  'avenue',
  'ave',
  'cross',
  'layout',
  'enclave',
  'phase',
  'sector',
  'block',
  'plot',
  'station',
  'police',
  'hyderabad',
  'telangana',
  'guda',
  'pet',
  'pally',
  'pur',
  'abad',
  'mall',
  'circle',
  'chowk',
  'bazar',
  'bazaar',
  'market',
  'area',
  'village',
  'dist',
  'district',
]);

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getServiceArea() {
  const latitude = config.serviceArea?.latitude;
  const longitude = config.serviceArea?.longitude;
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    radiusKm: config.serviceArea.radiusKm ?? 50,
  };
}

function roundCoord(value) {
  return Math.round(Number(value) * 1e6) / 1e6;
}

function postalCodeFromAddress(address) {
  const match = String(address || '').match(PIN_RE);
  return match ? match[1] : null;
}

function isInServiceArea(lat, lng, area) {
  if (!area) return true;
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return false;
  }
  return haversineKm(area.latitude, area.longitude, Number(lat), Number(lng)) <= area.radiusKm;
}

function classifyQuery(q) {
  const trimmed = String(q || '').trim();
  const pin = trimmed.match(PIN_RE);
  if (pin) {
    const remainder = trimmed.replace(PIN_RE, '').trim();
    return { kind: 'pincode', pin: pin[1], googleQuery: remainder ? trimmed : `${pin[1]} Hyderabad` };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const hasAddressToken = words.some((w) => ADDRESS_TOKENS.has(w.toLowerCase().replace(/[^a-z]/g, '')));
  if (words.length >= 3 || hasAddressToken) {
    return { kind: 'address', googleQuery: trimmed };
  }

  return { kind: 'name', googleQuery: trimmed };
}

function normalizePlace(result, area) {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (lat == null || lng == null) return null;

  const name = result.name || result.formatted_address || '';
  const address = result.formatted_address || result.vicinity || name;
  if (!name && !address) return null;

  return {
    placeId: result.place_id || '',
    name,
    address,
    latitude: roundCoord(lat),
    longitude: roundCoord(lng),
    postalCode: postalCodeFromAddress(address),
    inServiceArea: isInServiceArea(lat, lng, area),
  };
}

function mergePlaces(primary, secondary, limit) {
  const seen = new Set();
  const out = [];
  for (const place of [...primary, ...secondary]) {
    if (!place) continue;
    const key = place.placeId || `${place.latitude},${place.longitude},${place.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
    if (out.length >= limit) break;
  }
  return out;
}

function upstreamError() {
  return new ApiError(502, 'Places search failed', { code: 'PLACES_UPSTREAM_ERROR' });
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { method: 'GET', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function googlePlacesGet(url) {
  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (err) {
    logger.warn('Places request failed', { name: err?.name, message: err?.message, host: url.host });
    return { ok: false, results: [], fatal: true };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    logger.warn('Places returned invalid JSON', { name: err?.name, host: url.host });
    return { ok: false, results: [], fatal: true };
  }

  if (!response.ok) {
    logger.warn('Places HTTP error', { status: response.status, googleStatus: payload?.status, host: url.host });
    return { ok: false, results: [], fatal: true };
  }

  const status = payload?.status;
  if (status === 'ZERO_RESULTS' || status === 'OK') {
    return { ok: true, results: Array.isArray(payload?.results) ? payload.results : [], fatal: false };
  }

  logger.warn('Places rejected request', {
    googleStatus: status,
    googleMessage: payload?.error_message,
    host: url.host,
  });
  return { ok: false, results: [], fatal: status !== 'INVALID_REQUEST' };
}

function textSearchUrl(apiKey, query, area) {
  const url = new URL(TEXT_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('region', 'in');
  url.searchParams.set('key', apiKey);
  if (area) {
    url.searchParams.set('location', `${area.latitude},${area.longitude}`);
    url.searchParams.set('radius', String(Math.min(area.radiusKm * 1000, MAX_BIAS_RADIUS_M)));
  }
  return url;
}

function nearbySearchUrl(apiKey, lat, lng, radiusM) {
  const url = new URL(NEARBY_SEARCH_URL);
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(Math.min(radiusM, MAX_BIAS_RADIUS_M)));
  url.searchParams.set('language', 'en');
  url.searchParams.set('key', apiKey);
  return url;
}

class PlacesService {
  async search({ q, limit }) {
    const apiKey = config.google.placesApiKey;
    if (!apiKey) {
      throw ApiError.internal('Places search is not configured', { code: 'PLACES_NOT_CONFIGURED' });
    }

    const area = getServiceArea();
    const classified = classifyQuery(q);
    const text = await googlePlacesGet(textSearchUrl(apiKey, classified.googleQuery, area));
    if (!text.ok && text.fatal && classified.kind === 'name') {
      throw upstreamError();
    }

    const textPlaces = text.results.map((result) => normalizePlace(result, area)).filter(Boolean);

    if (classified.kind === 'name') {
      if (!text.ok && !textPlaces.length) throw upstreamError();
      return textPlaces.slice(0, limit);
    }

    const center = textPlaces[0];
    if (!center) {
      if (!text.ok) throw upstreamError();
      return [];
    }

    const radiusM = classified.kind === 'pincode' ? PINCODE_NEARBY_RADIUS_M : ADDRESS_NEARBY_RADIUS_M;
    const nearby = await googlePlacesGet(nearbySearchUrl(apiKey, center.latitude, center.longitude, radiusM));
    const nearbyPlaces = nearby.ok
      ? nearby.results.map((result) => normalizePlace(result, area)).filter(Boolean)
      : [];

    return mergePlaces(nearbyPlaces, textPlaces, limit);
  }
}

export default new PlacesService();
