import { rateLimit } from 'express-rate-limit';

/**
 * Small factory around express-rate-limit with sane JSON error output matching
 * our error envelope.
 */
export function makeLimiter({ windowMs, max, code = 'RATE_LIMITED', message = 'Too many requests, please try again later' }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({ success: false, error: { message, code } });
    },
  });
}

// Tight limit for OTP requests to curb SMS abuse / enumeration.
export const otpLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 5,
  code: 'OTP_RATE_LIMITED',
  message: 'Too many OTP requests. Wait a minute and try again.',
});

// General auth limiter for verify/login endpoints.
export const authLimiter = makeLimiter({ windowMs: 60 * 1000, max: 20 });
