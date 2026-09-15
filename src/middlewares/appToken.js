import appInstallService from '../services/appInstall.service.js';

/**
 * requireAppToken — protects pre-login endpoints (OTP request/verify,
 * Google sign-in, admin login, refresh, logout) that don't require a user
 * accessToken but must not be callable by arbitrary clients.
 *
 * The mobile app calls POST /auth/app/register on first launch to receive a
 * long-lived temp_access_token tied to its device ID (mid). It stores this
 * token in secure storage (iOS Keychain / Android Keystore) and sends it via
 * the X-App-Token header on every pre-login request.
 *
 * Advantages over a static API key:
 *  - Each device has its own token → individual revocation is possible
 *  - Token is fetched at runtime, not baked into the binary → not extractable
 *    by APK decompilation
 *  - Token is hashed in the DB → a DB leak doesn't expose raw tokens
 *
 * Usage:
 *   router.post('/otp/request', requireAppToken, otpLimiter, validate(...), handler);
 */
export async function requireAppToken(req, res, next) {
  const token = req.headers['x-app-token'];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Missing X-App-Token header. Register the device first.', code: 'NO_APP_TOKEN' },
    });
  }

  try {
    const install = await appInstallService.verify(token);
    // Attach mid so downstream handlers (e.g. activity log) can reference it.
    req.installMid = install.mid;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Same as requireAppToken when X-App-Token is present; otherwise continues.
 * Used for /auth/refresh and /auth/logout so the admin web app can rotate
 * tokens with only a refresh token, while mobile still sends the header.
 */
export async function optionalAppToken(req, res, next) {
  const token = req.headers['x-app-token'];
  if (!token) return next();
  return requireAppToken(req, res, next);
}
