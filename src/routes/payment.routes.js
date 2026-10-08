import { Router } from 'express';
import { paymentController } from '../controllers/index.js';

/**
 * Razorpay calls this directly. There is no user token. The webhook secret
 * signature is the authentication.
 */
class PaymentRoutes {
  constructor() {
    this.router = Router();
    this.router.post('/razorpay/webhook', paymentController.razorpayWebhook);
  }
}

export default new PaymentRoutes().router;
