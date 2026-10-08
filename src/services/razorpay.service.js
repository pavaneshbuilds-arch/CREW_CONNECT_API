import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import config from '../config/env.js';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';

/**
 * Razorpay Standard Checkout. The key secret is read from the environment and
 * never returned to clients. The public key id is safe to send to the app.
 */
class RazorpayService {
  credentials() {
    const { keyId, keySecret } = config.razorpay;
    if (!keyId || !keySecret) {
      throw ApiError.internal('Payment gateway is not configured', { code: 'PAYMENT_NOT_CONFIGURED' });
    }
    return { keyId, keySecret };
  }

  client() {
    const { keyId, keySecret } = this.credentials();
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder({ amount, receipt, notes }) {
    try {
      return await this.client().orders.create({
        amount,
        currency: 'INR',
        receipt,
        notes,
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.error('Razorpay order create failed', {
        statusCode: err?.statusCode,
        message: err?.error?.description || err?.message,
      });
      if (err?.statusCode === 401) {
        throw ApiError.unauthorized('Payment gateway authentication failed', { code: 'PAYMENT_GATEWAY_AUTH' });
      }
      throw ApiError.internal('Payment gateway request failed', { code: 'PAYMENT_GATEWAY_ERROR' });
    }
  }

  /**
   * HMAC-SHA256 of the raw webhook body using the webhook secret from the
   * Razorpay dashboard. A mismatch must not change payment status.
   */
  verifyWebhookSignature(rawBody, signature) {
    const secret = config.razorpay.webhookSecret;
    if (!config.razorpay.keyId || !secret) {
      throw ApiError.internal('Payment webhook is not configured', { code: 'PAYMENT_NOT_CONFIGURED' });
    }
    if (!rawBody || !signature) {
      throw ApiError.badRequest('Payment signature does not match', { code: 'PAYMENT_SIGNATURE_INVALID' });
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const actual = String(signature);
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(actual);
    const matches = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
    if (!matches) {
      throw ApiError.badRequest('Payment signature does not match', { code: 'PAYMENT_SIGNATURE_INVALID' });
    }
  }

  /**
   * HMAC-SHA256 of `orderId|paymentId` using the key secret.
   * A mismatch must not be treated as a successful payment.
   */
  verifySignature({ orderId, paymentId, signature }) {
    const { keySecret } = this.credentials();
    const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    const actual = String(signature || '');
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(actual);
    const matches = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
    if (!matches) {
      throw ApiError.badRequest('Payment signature does not match', { code: 'PAYMENT_SIGNATURE_INVALID' });
    }
  }
}

export default new RazorpayService();
