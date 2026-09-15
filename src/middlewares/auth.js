import ApiError from '../utils/apiError.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Authenticates a bearer access token and attaches the decoded principal to
 * req.auth = { sub, type, role }. `type` is one of user | crew | admin.
 */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('Missing or malformed Authorization header', { code: 'NO_TOKEN' }));
  }
  try {
    const decoded = verifyAccessToken(token);
    const sub = Number(decoded.sub);
    if (!Number.isInteger(sub) || sub < 1) {
      return next(ApiError.unauthorized('Invalid token subject', { code: 'INVALID_TOKEN' }));
    }
    req.auth = { sub, type: decoded.type, role: decoded.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Restricts a route to specific principal types, e.g. requireType('admin').
 */
export function requireType(...types) {
  return (req, res, next) => {
    if (!req.auth) return next(ApiError.unauthorized('Not authenticated', { code: 'NO_AUTH' }));
    if (!types.includes(req.auth.type)) {
      return next(ApiError.forbidden('Not allowed for this account type', { code: 'FORBIDDEN_TYPE' }));
    }
    return next();
  };
}

/**
 * Restricts a route to specific admin roles, e.g. requireRole('super_admin').
 * Assumes authenticate + requireType('admin') ran first.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(ApiError.forbidden('Insufficient role', { code: 'FORBIDDEN_ROLE' }));
    }
    return next();
  };
}
