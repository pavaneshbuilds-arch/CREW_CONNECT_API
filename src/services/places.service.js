import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';

const TEXT_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
  'places.types',
].join(',');
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

function postalCodeFrom(components) {
  if (!Array.isArray(components)) return null;
  const match = components.find((c) => Array.isArray(c.types) && c.types.includes('postal_code'));
  if (!match) return null;
  const code = match.longText || match.longName || match.shortText || match.shortName;
  return code ? String(code) : null;
}

function placeIdFrom(place) {
  const raw = place.id || place.name || '';
  return raw.startsWith('places/') ? raw.slice('places/'.length) : raw;
}

function isInServiceArea(lat, lng, area) {
  if (!area) return true;
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    return false;
  }
  return haversineKm(area.latitude, area.longitude, Number(lat), Number(lng)) <= area.radiusKm;
}

function normalizePlace(place, area) {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (lat == null || lng == null) return null;

  const name = place.displayName?.text || place.formattedAddress || '';
  const address = place.formattedAddress || name;
  if (!name && !address) return null;

  return {
    placeId: placeIdFrom(place),
    name,
    address,
    latitude: roundCoord(lat),
    longitude: roundCoord(lng),
    postalCode: postalCodeFrom(place.addressComponents),
    inServiceArea: isInServiceArea(lat, lng, area),
  };
}

function upstreamError() {
  return new ApiError(502, 'Places search failed', { code: 'PLACES_UPSTREAM_ERROR' });
}

class PlacesService {
  async search({ q, limit }) {
    const apiKey = config.google.placesApiKey;
    if (!apiKey) {
      throw ApiError.internal('Places search is not configured', { code: 'PLACES_NOT_CONFIGURED' });
    }

    const area = getServiceArea();
    const body = {
      textQuery: q,
      languageCode: 'en',
      regionCode: 'IN',
      maxResultCount: limit,
    };

    if (area) {
      body.locationBias = {
        circle: {
          center: { latitude: area.latitude, longitude: area.longitude },
          radius: Math.min(area.radiusKm * 1000, MAX_BIAS_RADIUS_M),
        },
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(TEXT_SEARCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      logger.warn('Places upstream request failed', { name: err?.name, message: err?.message });
      throw upstreamError();
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      logger.warn('Places upstream rejected request', { status: response.status });
      throw upstreamError();
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      logger.warn('Places upstream returned invalid JSON', { name: err?.name });
      throw upstreamError();
    }

    const places = Array.isArray(payload.places) ? payload.places : [];
    return places.map((place) => normalizePlace(place, area)).filter(Boolean);
  }
}

export default new PlacesService();
