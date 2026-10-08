import catchAsync from '../utils/catchAsync.js';
import { success } from '../utils/apiResponse.js';
import { bookingService, razorpayService } from '../services/index.js';

class PaymentController {
  razorpayWebhook = catchAsync(async (req, res) => {
    razorpayService.verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'));
    const data = await bookingService.handleRazorpayWebhook(req.body);
    return success(res, data);
  });
}

export default new PaymentController();
