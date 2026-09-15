import catchAsync from '../utils/catchAsync.js';
import { success } from '../utils/apiResponse.js';
import { authService, appInstallService } from '../services/index.js';

class AuthController {
  requestOtp = catchAsync(async (req, res) => {
    const data = await authService.requestPhoneOtp(req.body);
    return success(res, data, { message: 'OTP sent' });
  });

  verifyOtp = catchAsync(async (req, res) => {
    const data = await authService.verifyPhoneOtp({
      phoneNumber: req.body.phoneNumber,
      code: req.body.code,
      subjectType: req.body.subjectType,
    });
    return success(res, data, { message: 'Login successful' });
  });

  google = catchAsync(async (req, res) => {
    const data = await authService.loginWithGoogle(req.body);
    return success(res, data, { message: 'Login successful' });
  });

  adminLogin = catchAsync(async (req, res) => {
    const data = await authService.loginAdmin(req.body);
    return success(res, data, { message: 'Login successful' });
  });

  refresh = catchAsync(async (req, res) => {
    const data = await authService.refresh(req.body.refreshToken);
    return success(res, { tokens: data }, { message: 'Token refreshed' });
  });

  logout = catchAsync(async (req, res) => {
    await authService.logout(req.body.refreshToken);
    return success(res, null, { message: 'Logged out' });
  });

  /**
   * POST /auth/app/register
   * Called by the mobile app on first launch (or to rotate/refresh the token).
   * Returns a long-lived temp_access_token tied to the device's mid.
   * No authentication required — rate-limited at the route level.
   */
  registerApp = catchAsync(async (req, res) => {
    const { mid, platform, appVersion } = req.body;
    const data = await appInstallService.register({ mid, platform, appVersion });
    return success(res, data, { message: 'Device registered', status: 201 });
  });

  me = catchAsync(async (req, res) => {
    const data = await authService.getMe(req.auth);
    return success(res, data);
  });
}

export default new AuthController();
