import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';

const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const UPSTREAM_TIMEOUT_MS = 8000;
const MAX_BIAS_RADIUS_M = 50_000;

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
  const match = String(address || '').match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

function isInServiceArea(lat, lng, area) {
  if (!area) return true;
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return false;
  }
  return haversineKm(area.latitude, area.longitude, Number(lat), Number(lng)) <= area.radiusKm;
}

function normalizePlace(result, area) {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (lat == null || lng == null) return null;

  const name = result.name || result.formatted_address || '';
  const address = result.formatted_address || name;
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

class PlacesService {
  async search({ q, limit }) {
    const apiKey = config.google.placesApiKey;
    if (!apiKey) {
      throw ApiError.internal('Places search is not configured', { code: 'PLACES_NOT_CONFIGURED' });
    }

    const area = getServiceArea();
    const url = new URL(TEXT_SEARCH_URL);
    url.searchParams.set('query', q);
    url.searchParams.set('language', 'en');
    url.searchParams.set('region', 'in');
    url.searchParams.set('key', apiKey);
    if (area) {
      url.searchParams.set('location', `${area.latitude},${area.longitude}`);
      url.searchParams.set('radius', String(Math.min(area.radiusKm * 1000, MAX_BIAS_RADIUS_M)));
    }

    let response;
    try {
      response = await fetchWithTimeout(url);
    } catch (err) {
      logger.warn('Places Text Search request failed', { name: err?.name, message: err?.message });
      throw upstreamError();
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      logger.warn('Places Text Search returned invalid JSON', { name: err?.name });
      throw upstreamError();
    }

    if (!response.ok) {
      logger.warn('Places Text Search HTTP error', { status: response.status, googleStatus: payload?.status });
      throw upstreamError();
    }

    const status = payload?.status;
    if (status === 'ZERO_RESULTS' || status === 'OK') {
      const results = Array.isArray(payload?.results) ? payload.results : [];
      return results.map((result) => normalizePlace(result, area)).filter(Boolean).slice(0, limit);
    }

    logger.warn('Places Text Search rejected request', {
      googleStatus: status,
      googleMessage: payload?.error_message,
    });
    throw upstreamError();
  }
}

export default new PlacesService();
