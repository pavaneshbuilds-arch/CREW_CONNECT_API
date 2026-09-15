import logger from '../utils/logger.js';
import config from '../config/env.js';

/**
 * SMS gateway abstraction. In development the OTP is logged to the console so
 * the flow can be exercised without a real provider. Wire an actual gateway
 * (MSG91 / Twilio / Gupshup) here for staging/production.
 */
class SmsService {
  async sendOtp(phoneNumber, code) {
    if (!config.isProduction) {
      logger.info('DEV SMS — OTP dispatched', { phoneNumber, code });
      return { delivered: true, provider: 'dev-console' };
    }

    // TODO: integrate real SMS provider before production launch.
    logger.warn('SMS provider not configured; OTP not actually sent', { phoneNumber });
    return { delivered: false, provider: 'none' };
  }
}

export default new SmsService();
