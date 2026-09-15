import catchAsync from '../utils/catchAsync.js';
import { success, created } from '../utils/apiResponse.js';
import { adminService, couponService, rateCardService, supervisorRangeService } from '../services/index.js';

class AdminController {
  me = catchAsync(async (req, res) => {
    const data = await adminService.getMe(req.auth.sub);
    return success(res, data);
  });

  dashboard = catchAsync(async (req, res) => {
    const data = await adminService.dashboard();
    return success(res, data);
  });

  listCrew = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listCrew(req.query);
    return success(res, items, { meta });
  });

  getCrew = catchAsync(async (req, res) => {
    const data = await adminService.getCrew(req.params.id);
    return success(res, data);
  });

  approveCrew = catchAsync(async (req, res) => {
    const data = await adminService.approveCrew(req.params.id, req.auth.sub);
    return success(res, data, { message: 'Crew approved' });
  });

  rejectCrew = catchAsync(async (req, res) => {
    const data = await adminService.rejectCrew(req.params.id, req.auth.sub, req.body.reason);
    return success(res, data, { message: 'Crew rejected' });
  });

  setCrewActive = catchAsync(async (req, res) => {
    const data = await adminService.setCrewActive(req.params.id, req.auth.sub, req.body.isActive);
    return success(res, data, { message: req.body.isActive ? 'Crew activated' : 'Crew suspended' });
  });

  listEditRequests = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listEditRequests(req.query);
    return success(res, items, { meta });
  });

  getEditRequest = catchAsync(async (req, res) => {
    const data = await adminService.getEditRequest(req.params.id);
    return success(res, data);
  });

  approveEditRequest = catchAsync(async (req, res) => {
    const data = await adminService.approveEditRequest(req.params.id, req.auth.sub);
    return success(res, data, { message: 'Edit request approved' });
  });

  rejectEditRequest = catchAsync(async (req, res) => {
    const data = await adminService.rejectEditRequest(req.params.id, req.auth.sub, req.body.reason);
    return success(res, data, { message: 'Edit request rejected' });
  });

  listUsers = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listUsers(req.query);
    return success(res, items, { meta });
  });

  getUser = catchAsync(async (req, res) => {
    const data = await adminService.getUser(req.params.id);
    return success(res, data);
  });

  setUserActive = catchAsync(async (req, res) => {
    const data = await adminService.setUserActive(req.params.id, req.auth.sub, req.body.isActive);
    return success(res, data, { message: req.body.isActive ? 'User activated' : 'User suspended' });
  });

  listBookings = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listBookings(req.query);
    return success(res, items, { meta });
  });

  getBooking = catchAsync(async (req, res) => {
    const data = await adminService.getBooking(req.params.id);
    return success(res, data);
  });

  listRates = catchAsync(async (req, res) => {
    const data = await rateCardService.listCurrent();
    return success(res, data);
  });

  updateRates = catchAsync(async (req, res) => {
    const data = await rateCardService.updateRates(req.auth.sub, req.body);
    return success(res, data, { message: 'Rates updated' });
  });

  listRateLogs = catchAsync(async (req, res) => {
    const { items, meta } = await rateCardService.listLogs(req.query);
    return success(res, items, { meta });
  });

  listSupervisorRanges = catchAsync(async (req, res) => {
    return success(res, await supervisorRangeService.list());
  });

  replaceSupervisorRanges = catchAsync(async (req, res) => {
    const data = await supervisorRangeService.replace(req.auth.sub, req.body.ranges);
    return success(res, data, { message: 'Supervisor ranges updated' });
  });

  listAuditLogs = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listAuditLogs(req.query);
    return success(res, items, { meta });
  });

  listActivityLogs = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listActivityLogs(req.query);
    return success(res, items, { meta });
  });

  listCoupons = catchAsync(async (req, res) => {
    const { items, meta } = await couponService.listAdmin(req.query);
    return success(res, items, { meta });
  });

  getCoupon = catchAsync(async (req, res) => {
    const data = await couponService.getAdmin(Number(req.params.id));
    return success(res, data);
  });

  createCoupon = catchAsync(async (req, res) => {
    const data = await couponService.create(req.auth.sub, req.body);
    return created(res, data, { message: 'Coupon created' });
  });

  updateCoupon = catchAsync(async (req, res) => {
    const data = await couponService.update(Number(req.params.id), req.auth.sub, req.body);
    return success(res, data, { message: 'Coupon updated' });
  });

  deleteCoupon = catchAsync(async (req, res) => {
    const data = await couponService.remove(Number(req.params.id), req.auth.sub);
    return success(res, data, { message: 'Coupon deleted' });
  });

  listAdmins = catchAsync(async (req, res) => {
    const { items, meta } = await adminService.listAdmins(req.query);
    return success(res, items, { meta });
  });

  createAdmin = catchAsync(async (req, res) => {
    const data = await adminService.createAdmin(req.auth.sub, req.body);
    return created(res, data, { message: 'Admin created' });
  });

  updateAdmin = catchAsync(async (req, res) => {
    const data = await adminService.updateAdmin(req.params.id, req.auth.sub, req.body);
    return success(res, data, { message: 'Admin updated' });
  });
}

export default new AdminController();
