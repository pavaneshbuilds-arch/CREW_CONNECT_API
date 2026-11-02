import catchAsync from '../utils/catchAsync.js';
import { success } from '../utils/apiResponse.js';
import { bookingService, payoutService, razorpayService } from '../services/index.js';

class PaymentController {
  razorpayWebhook = catchAsync(async (req, res) => {
    razorpayService.verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'));
    const eventName = req.body?.event || '';
    const data = eventName.startsWith('payout.')
      ? await payoutService.handleWebhook(req.body)
      : await bookingService.handleRazorpayWebhook(req.body);
    return success(res, data);
  });
}

export default new PaymentController();
