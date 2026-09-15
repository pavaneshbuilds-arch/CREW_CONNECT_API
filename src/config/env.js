import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Read an environment variable, throwing if it is required and missing.
 * Keeping this centralized means the app fails fast at boot with a clear
 * message instead of misbehaving deep in a request.
 */
function get(name, { required = false, fallback = undefined } = {}) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (required) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    return fallback;
  }
  return value;
}

function getInt(name, { required = false, fallback = undefined } = {}) {
  const raw = get(name, { required, fallback: undefined });
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

function getNumber(name, { required = false, fallback = undefined } = {}) {
  const raw = get(name, { required, fallback: undefined });
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

const nodeEnv = get('NODE_ENV', { fallback: 'development' });

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  port: getInt('PORT', { fallback: 4000 }),
  apiPrefix: get('API_PREFIX', { fallback: '/api/v1' }),

  databaseUrl: get('DATABASE_URL', { required: true }),
  mongoUri: get('MONGO_URI', { required: true }),

  jwt: {
    accessSecret: get('JWT_ACCESS_SECRET', { required: true }),
    refreshSecret: get('JWT_REFRESH_SECRET', { required: true }),
    accessTtl: get('JWT_ACCESS_TTL', { fallback: '15m' }),
    refreshTtl: get('JWT_REFRESH_TTL', { fallback: '30d' }),
    issuer: get('JWT_ISSUER', { fallback: 'crew-connect-api' }),
  },

  otp: {
    length: getInt('OTP_LENGTH', { fallback: 4 }),
    ttlSeconds: getInt('OTP_TTL_SECONDS', { fallback: 300 }),
    maxAttempts: getInt('OTP_MAX_ATTEMPTS', { fallback: 5 }),
    // When true, the generated OTP is returned in the API response and logged.
    // Development convenience only — never enable in production.
    devExpose: get('OTP_DEV_EXPOSE', { fallback: 'true' }) === 'true',
    // When true, crew login accepts any 4-digit code (still requires a prior
    // OTP request). Hard-gated off in production regardless of this flag.
    devAcceptAny: get('OTP_DEV_ACCEPT_ANY', { fallback: 'true' }) === 'true',
  },

  google: {
    clientId: get('GOOGLE_CLIENT_ID', { fallback: undefined }),
  },

  // 32-byte key (hex or base64) used for AES-256-GCM encryption of sensitive
  // at-rest fields (Aadhaar, PAN, bank account numbers).
  encryptionKey: get('ENCRYPTION_KEY', { fallback: undefined }),

  // App install token — long-lived token issued to each mobile device on first
  // launch via POST /auth/app/register. Used to protect pre-login endpoints.
  appToken: {
    ttlDays: getInt('APP_TOKEN_TTL_DAYS', { fallback: 90 }),
  },

  support: {
    email: get('SUPPORT_EMAIL', { fallback: 'support@crewconnect.com' }),
    phone: get('SUPPORT_PHONE', { fallback: '+919515665550' }),
    whatsapp: get('SUPPORT_WHATSAPP', { fallback: '+919997775555' }),
  },

  pricing: {
    gstPercent: getNumber('GST_PERCENT', { fallback: 18 }),
  },

  cors: {
    // Comma-separated list of allowed origins for the admin web app, etc.
    origins: get('CORS_ORIGINS', { fallback: '*' })
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  uploads: {
    dir: get('UPLOAD_DIR', { fallback: 'uploads' }),
    maxFileBytes: getInt('UPLOAD_MAX_BYTES', { fallback: 5 * 1024 * 1024 }),
    publicBaseUrl: get('PUBLIC_BASE_URL', { fallback: 'http://localhost:4000' }).replace(/\/$/, ''),
  },
};

export default config;
