import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { authenticate, requireType, requireRole } from '../middlewares/auth.js';
import * as schema from '../validations/admin.validation.js';
import { adminController } from '../controllers/index.js';

/**
 * Admin web console. Every route requires an admin access token.
 * Team-management endpoints are restricted to super_admin.
 */
class AdminRoutes {
  constructor() {
    this.router = Router();
    this.router.use(authenticate, requireType('admin'));
    this.registerRoutes();
  }

  registerRoutes() {
    this.router.get('/me', adminController.me);
    this.router.get('/dashboard', adminController.dashboard);

    this.router.get('/crew', validate(schema.listCrew), adminController.listCrew);
    this.router.get('/crew/:id', validate(schema.idParam), adminController.getCrew);
    this.router.post('/crew/:id/approve', validate(schema.idParam), adminController.approveCrew);
    this.router.post('/crew/:id/reject', validate(schema.rejectCrew), adminController.rejectCrew);
    this.router.patch('/crew/:id/active', validate(schema.setActive), adminController.setCrewActive);

    this.router.get('/edit-requests', validate(schema.listEditRequests), adminController.listEditRequests);
    this.router.get('/edit-requests/:id', validate(schema.idParam), adminController.getEditRequest);
    this.router.post('/edit-requests/:id/approve', validate(schema.idParam), adminController.approveEditRequest);
    this.router.post('/edit-requests/:id/reject', validate(schema.rejectEditRequest), adminController.rejectEditRequest);

    this.router.get('/users', validate(schema.listUsers), adminController.listUsers);
    this.router.get('/users/:id', validate(schema.idParam), adminController.getUser);
    this.router.patch('/users/:id/active', validate(schema.setActive), adminController.setUserActive);

    this.router.get('/bookings', validate(schema.listBookings), adminController.listBookings);
    this.router.get('/bookings/:id', validate(schema.idParam), adminController.getBooking);

    this.router.get('/rates/logs', validate(schema.listRateLogs), adminController.listRateLogs);
    this.router.get('/rates', adminController.listRates);
    this.router.patch('/rates', validate(schema.updateRates), adminController.updateRates);

    this.router.get('/supervisor-ranges', adminController.listSupervisorRanges);
    this.router.put('/supervisor-ranges', validate(schema.replaceSupervisorRanges), adminController.replaceSupervisorRanges);

    this.router.get('/coupons', validate(schema.listCoupons), adminController.listCoupons);
    this.router.post('/coupons', validate(schema.createCoupon), adminController.createCoupon);
    this.router.get('/coupons/:id', validate(schema.idParam), adminController.getCoupon);
    this.router.patch('/coupons/:id', validate(schema.updateCoupon), adminController.updateCoupon);
    this.router.delete('/coupons/:id', validate(schema.idParam), adminController.deleteCoupon);

    this.router.get('/audit-logs', validate(schema.listAuditLogs), adminController.listAuditLogs);
    this.router.get('/activity-logs', validate(schema.listActivityLogs), adminController.listActivityLogs);

    this.router.get(
      '/admins',
      requireRole('super_admin'),
      validate(schema.listAdmins),
      adminController.listAdmins
    );
    this.router.post(
      '/admins',
      requireRole('super_admin'),
      validate(schema.createAdmin),
      adminController.createAdmin
    );
    this.router.patch(
      '/admins/:id',
      requireRole('super_admin'),
      validate(schema.updateAdmin),
      adminController.updateAdmin
    );
  }
}

export default new AdminRoutes().router;
