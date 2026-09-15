import jwt from 'jsonwebtoken';
import config from '../config/env.js';

/**
 * Tokens carry the subject id and its type (user | crew | admin) plus role
 * where relevant. The type lets a single middleware protect endpoints across
 * all three clients while still distinguishing who is calling.
 */

export function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl,
    issuer: config.jwt.issuer,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
    issuer: config.jwt.issuer,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: config.jwt.issuer });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret, { issuer: config.jwt.issuer });
}
