import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';

/**
 * Hash a raw token with SHA-256 so the DB never stores the plaintext.
 * Same principle as how refresh tokens are stored.
 */
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a cryptographically secure random token (48 bytes → 96 hex chars).
 */
function generateRawToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Compute the expiry date from now + configured TTL.
 */
function tokenExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + config.appToken.ttlDays);
  return d;
}

class AppInstallService {
  /**
   * Register (or re-register) a device install.
   *
   * On first call for a given `mid`: creates a new row and returns a fresh token.
   * On subsequent calls (e.g. app reinstall, expiry refresh): rotates the token
   * and resets the expiry so the device stays valid.
   *
   * @param {{ mid: string, platform?: string, appVersion?: string }} params
   * @returns {{ temp_access_token: string, expiresAt: Date }}
   */
  async register({ mid, platform, appVersion }) {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = tokenExpiry();

    await prisma.appInstallToken.upsert({
      where: { mid },
      create: {
        mid,
        tokenHash,
        platform,
        appVersion,
        expiresAt,
      },
      update: {
        // Rotate token and refresh expiry on every re-registration call.
        tokenHash,
        platform: platform ?? undefined,
        appVersion: appVersion ?? undefined,
        isRevoked: false,
        expiresAt,
        lastUsedAt: null,
      },
    });

    return { temp_access_token: rawToken, expiresAt };
  }

  /**
   * Verify a raw token sent in the X-App-Token header.
   * Returns the install record if valid; throws ApiError otherwise.
   *
   * @param {string} rawToken
   * @returns {Promise<import('@prisma/client').AppInstallToken>}
   */
  async verify(rawToken) {
    const tokenHash = hashToken(rawToken);

    const install = await prisma.appInstallToken.findUnique({
      where: { tokenHash },
    });

    if (!install) {
      throw ApiError.unauthorized('Invalid app token', { code: 'INVALID_APP_TOKEN' });
    }
    if (install.isRevoked) {
      throw ApiError.unauthorized('App token has been revoked', { code: 'APP_TOKEN_REVOKED' });
    }
    if (install.expiresAt < new Date()) {
      throw ApiError.unauthorized('App token has expired — please re-register the device', {
        code: 'APP_TOKEN_EXPIRED',
      });
    }

    // Update lastUsedAt in the background — don't block the request on it.
    prisma.appInstallToken
      .update({ where: { id: install.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    return install;
  }

  /**
   * Revoke a device by mid (e.g. when reported stolen or admin bans it).
   *
   * @param {string} mid
   */
  async revoke(mid) {
    const install = await prisma.appInstallToken.findUnique({ where: { mid } });
    if (!install) {
      throw ApiError.notFound('Device not found', { code: 'DEVICE_NOT_FOUND' });
    }
    await prisma.appInstallToken.update({
      where: { mid },
      data: { isRevoked: true },
    });
  }
}

export default new AppInstallService();
