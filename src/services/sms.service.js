import logger from '../utils/logger.js';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

/**
 * MSG91 expects digits with a country code and no leading +.
 * A 10-digit Indian mobile is prefixed with 91.
 */
function toMsg91Mobile(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

class SmsService {
  async sendOtp(phoneNumber, code) {
    const { authKey, templateId } = config.msg91;
    if (!authKey || !templateId) {
      if (!config.isProduction) {
        logger.info('DEV SMS — OTP dispatched', { phoneNumber, code });
        return { delivered: true, provider: 'dev-console' };
      }
      logger.error('MSG91 is not configured');
      throw ApiError.internal('SMS provider is not configured', { code: 'SMS_NOT_CONFIGURED' });
    }

    const otpExpiryMinutes = Math.max(1, Math.ceil(config.otp.ttlSeconds / 60));
    let response;
    try {
      response = await fetch(MSG91_OTP_URL, {
        method: 'POST',
        headers: {
          authkey: authKey,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          mobile: toMsg91Mobile(phoneNumber),
          otp: String(code),
          otp_expiry: String(otpExpiryMinutes),
        }),
      });
    } catch (err) {
      logger.error('MSG91 request failed', { message: err?.message });
      throw ApiError.internal('Could not send OTP', { code: 'SMS_SEND_FAILED' });
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const succeeded = response.ok && String(payload?.type || '').toLowerCase() === 'success';
    if (!succeeded) {
      logger.error('MSG91 rejected OTP', {
        status: response.status,
        type: payload?.type,
        message: payload?.message,
      });
      throw ApiError.internal('Could not send OTP', { code: 'SMS_SEND_FAILED' });
    }

    return { delivered: true, provider: 'msg91' };
  }
}

export default new SmsService();
