import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import config from '../config/env.js';

/**
 * Generate a numeric OTP of configured length. Uses crypto for unbiased digits.
 */
export function generateOtp(length = config.otp.length) {
  let out = '';
  while (out.length < length) {
    // rejection sampling keeps the digit distribution uniform
    const byte = crypto.randomBytes(1)[0];
    if (byte < 250) out += String(byte % 10);
  }
  return out;
}

export async function hashOtp(code) {
  return bcrypt.hash(code, 10);
}

export async function verifyOtp(code, codeHash) {
  return bcrypt.compare(code, codeHash);
}

export function otpExpiry(ttlSeconds = config.otp.ttlSeconds) {
  return new Date(Date.now() + ttlSeconds * 1000);
}
