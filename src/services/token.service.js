import crypto from 'node:crypto';
import ms from '../utils/ms.js';
import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import ApiError from '../utils/apiError.js';

class TokenService {
  #hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Issues an access + refresh token pair for a principal and persists a hashed
   * copy of the refresh token so it can be rotated and revoked.
   *
   * @param {{ id: number, type: 'user'|'crew'|'admin', role?: string }} principal
   */
  async issueTokens(principal) {
    // JWT `sub` must be a string; Prisma stores principal ids as integers.
    const payload = { sub: String(principal.id), type: principal.type };
    if (principal.role) payload.role = principal.role;

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        subjectType: principal.type,
        subjectId: principal.id,
        tokenHash: this.#hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ms(config.jwt.refreshTtl)),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: Math.floor(ms(config.jwt.accessTtl) / 1000),
    };
  }

  /**
   * Validates a refresh token (signature + stored, unrevoked, unexpired record),
   * rotates it (revokes the old, issues a new pair).
   */
  async rotateTokens(refreshToken) {
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      throw ApiError.unauthorized('Invalid refresh token', { code: 'INVALID_REFRESH' });
    }

    const tokenHash = this.#hashToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized('Refresh token is no longer valid', { code: 'REFRESH_REVOKED' });
    }

    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    return this.issueTokens({ id: Number(decoded.sub), type: decoded.type, role: decoded.role });
  }

  /**
   * Revokes a specific refresh token (logout). No-op if not found.
   */
  async revokeToken(refreshToken) {
    const tokenHash = this.#hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke every refresh token for a principal (account deletion).
   */
  async revokeAllForSubject({ subjectType, subjectId }) {
    await prisma.refreshToken.updateMany({
      where: { subjectType, subjectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export default new TokenService();
