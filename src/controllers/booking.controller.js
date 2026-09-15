import catchAsync from '../utils/catchAsync.js';
import { success, created } from '../utils/apiResponse.js';
import { bookingService } from '../services/index.js';

class BookingController {
  getOptions = catchAsync(async (req, res) => {
    return success(res, await bookingService.getOptions());
  });

  getCrewSuggestion = catchAsync(async (req, res) => {
    return success(res, await bookingService.getCrewSuggestion(req.query));
  });

  upsertSummary = catchAsync(async (req, res) => {
    const { data, created: isNew } = await bookingService.upsertSummary(req.auth.sub, req.body);
    if (isNew) return created(res, data, { message: 'Booking summary saved' });
    return success(res, data, { message: 'Booking summary updated' });
  });

  getCart = catchAsync(async (req, res) => {
    const data = await bookingService.getCart(req.auth.sub);
    return success(res, data);
  });

  applyCoupon = catchAsync(async (req, res) => {
    const data = await bookingService.applyCoupon(req.auth.sub, Number(req.params.id), req.body.code);
    return success(res, data, { message: 'Coupon applied' });
  });

  removeCoupon = catchAsync(async (req, res) => {
    const data = await bookingService.removeCoupon(req.auth.sub, Number(req.params.id));
    return success(res, data, { message: 'Coupon removed' });
  });

  place = catchAsync(async (req, res) => {
    const data = await bookingService.place(req.auth.sub, Number(req.params.id));
    return success(res, data, { message: 'Booking confirmed' });
  });

  list = catchAsync(async (req, res) => {
    const { items, meta } = await bookingService.list(req.auth.sub, req.query);
    return success(res, items, { meta });
  });

  getById = catchAsync(async (req, res) => {
    const data = await bookingService.getById(req.auth.sub, Number(req.params.id));
    return success(res, data);
  });

  cancel = catchAsync(async (req, res) => {
    const data = await bookingService.cancel(req.auth.sub, Number(req.params.id), req.body?.reason);
    return success(res, data, { message: 'Booking cancelled' });
  });

  review = catchAsync(async (req, res) => {
    const data = await bookingService.review(req.auth.sub, Number(req.params.id), req.body);
    return success(res, data, { message: 'Review submitted' });
  });
}

export default new BookingController();
