import catchAsync from '../utils/catchAsync.js';
import { success } from '../utils/apiResponse.js';
import { crewBookingService } from '../services/index.js';

class CrewBookingController {
  getHome = catchAsync(async (req, res) => {
    return success(res, await crewBookingService.getHome(req.auth.sub, req.query));
  });

  list = catchAsync(async (req, res) => {
    const { items, meta } = await crewBookingService.list(req.auth.sub, req.query);
    return success(res, items, { meta });
  });

  getById = catchAsync(async (req, res) => {
    return success(res, await crewBookingService.getById(req.auth.sub, Number(req.params.id), req.query));
  });

  accept = catchAsync(async (req, res) => {
    const data = await crewBookingService.accept(req.auth.sub, Number(req.params.id));
    return success(res, data, { message: 'Job accepted' });
  });

  reject = catchAsync(async (req, res) => {
    const data = await crewBookingService.reject(req.auth.sub, Number(req.params.id));
    return success(res, data, { message: 'Job rejected' });
  });

  verifyStart = catchAsync(async (req, res) => {
    const data = await crewBookingService.verifyStart(req.auth.sub, Number(req.params.id), req.body.code);
    return success(res, data, { message: 'Shift started' });
  });

  resendShiftOtp = catchAsync(async (req, res) => {
    const data = await crewBookingService.resendShiftOtp(req.auth.sub, Number(req.params.id));
    return success(res, data, { message: 'Shift code sent to the organizer' });
  });

  complete = catchAsync(async (req, res) => {
    const data = await crewBookingService.complete(req.auth.sub, Number(req.params.id));
    return success(res, data, { message: 'Shift completed' });
  });
}

export default new CrewBookingController();
