import catchAsync from '../utils/catchAsync.js';
import { success, created } from '../utils/apiResponse.js';
import { userService, placesService } from '../services/index.js';

class UserController {
  getMe = catchAsync(async (req, res) => {
    const data = await userService.getMe(req.auth.sub);
    return success(res, data);
  });

  updateMe = catchAsync(async (req, res) => {
    const data = await userService.updateMe(req.auth.sub, req.body);
    return success(res, data, { message: 'Profile updated' });
  });

  verifyPhone = catchAsync(async (req, res) => {
    const data = await userService.verifyPhone(req.auth.sub, req.body);
    return success(res, data, { message: 'Phone number verified' });
  });

  listAddresses = catchAsync(async (req, res) => {
    const data = await userService.listAddresses(req.auth.sub);
    return success(res, data);
  });

  createAddress = catchAsync(async (req, res) => {
    const data = await userService.createAddress(req.auth.sub, req.body);
    return created(res, data, { message: 'Address added' });
  });

  updateAddress = catchAsync(async (req, res) => {
    const data = await userService.updateAddress(req.auth.sub, Number(req.params.id), req.body);
    return success(res, data, { message: 'Address updated' });
  });

  deleteAddress = catchAsync(async (req, res) => {
    await userService.deleteAddress(req.auth.sub, Number(req.params.id));
    return success(res, null, { message: 'Address removed' });
  });

  deleteAccount = catchAsync(async (req, res) => {
    await userService.deleteAccount(req.auth.sub);
    return success(res, null, { message: 'Account deleted' });
  });

  listCoupons = catchAsync(async (req, res) => {
    const data = await userService.listCoupons(req.auth.sub);
    return success(res, data);
  });

  getSupport = catchAsync(async (req, res) => {
    const data = userService.getSupport();
    return success(res, data);
  });

  searchPlaces = catchAsync(async (req, res) => {
    const data = await placesService.search(req.query);
    return success(res, data);
  });
}

export default new UserController();
