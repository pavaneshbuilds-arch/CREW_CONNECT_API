import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { authenticate, requireType } from '../middlewares/auth.js';
import { requireAppToken, optionalAppToken } from '../middlewares/appToken.js';
import { otpLimiter, authLimiter } from '../middlewares/rateLimiter.js';
import * as schema from '../validations/auth.validation.js';
import { authController, deviceController } from '../controllers/index.js';

class AuthRoutes {
  constructor() {
    this.router = Router();
    this.registerRoutes();
  }

  registerRoutes() {
    // --- Device registration (no auth — rate-limited only) ---
    // Mobile app calls this once on first launch to receive a temp_access_token
    // that is then required on all subsequent pre-login API calls.
    this.router.post('/app/register', authLimiter, validate(schema.registerApp), authController.registerApp);

    // --- Phone OTP (users + crew mobile apps) ---
    // requireAppToken verifies the per-device token from POST /auth/app/register.
    this.router.post('/otp/request', requireAppToken, otpLimiter, validate(schema.requestOtp), authController.requestOtp);
    this.router.post('/otp/verify', requireAppToken, authLimiter, validate(schema.verifyOtp), authController.verifyOtp);

    // --- Google Sign-In (user app) ---
    this.router.post('/google', requireAppToken, authLimiter, validate(schema.google), authController.google);

    // --- Admin web app (email + password; no device handshake) ---
    this.router.post('/admin/login', authLimiter, validate(schema.adminLogin), authController.adminLogin);

    // --- Token lifecycle ---
    // Mobile still sends X-App-Token; admin web may omit it (refresh token is enough).
    this.router.post('/refresh', optionalAppToken, authLimiter, validate(schema.refresh), authController.refresh);
    this.router.post('/logout', optionalAppToken, validate(schema.logout), authController.logout);

    // --- Identity check (any authenticated principal) ---
    this.router.get('/me', authenticate, authController.me);

    // Register mid + pnid after login (user + crew). History is stored server-side;
    // mobile does not list or delete devices.
    this.router.post(
      '/devices',
      authenticate,
      requireType('user', 'crew'),
      validate(schema.registerDevice),
      deviceController.register
    );
  }
}

export default new AuthRoutes().router;
