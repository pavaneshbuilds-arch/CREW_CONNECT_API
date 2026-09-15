import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { authenticate, requireType } from '../middlewares/auth.js';
import * as schema from '../validations/user.validation.js';
import * as bookingSchema from '../validations/booking.validation.js';
import { userController, bookingController } from '../controllers/index.js';

class UserRoutes {
  constructor() {
    this.router = Router();
    this.router.use(authenticate, requireType('user'));
    this.registerRoutes();
  }

  registerRoutes() {
    this.router.get('/me', userController.getMe);
    this.router.patch('/me', validate(schema.updateMe), userController.updateMe);
    this.router.delete('/me', userController.deleteAccount);
    this.router.post('/me/phone/verify', validate(schema.verifyPhone), userController.verifyPhone);

    this.router.get('/me/addresses', userController.listAddresses);
    this.router.post('/me/addresses', validate(schema.createAddress), userController.createAddress);
    this.router.patch('/me/addresses/:id', validate(schema.updateAddress), userController.updateAddress);
    this.router.delete('/me/addresses/:id', validate(schema.addressParam), userController.deleteAddress);

    this.router.get('/coupons', userController.listCoupons);
    this.router.get('/support', userController.getSupport);

    this.router.get('/bookings/options', bookingController.getOptions);
    this.router.get('/bookings/crew-suggestion', validate(bookingSchema.crewSuggestion), bookingController.getCrewSuggestion);
    this.router.put('/bookings/summary', validate(bookingSchema.upsertSummary), bookingController.upsertSummary);
    this.router.get('/cart', bookingController.getCart);
    this.router.get('/bookings', validate(bookingSchema.listBookings), bookingController.list);
    this.router.post('/bookings/:id/coupon', validate(bookingSchema.applyCoupon), bookingController.applyCoupon);
    this.router.delete('/bookings/:id/coupon', validate(bookingSchema.bookingParam), bookingController.removeCoupon);
    this.router.post('/bookings/:id/place', validate(bookingSchema.bookingParam), bookingController.place);
    this.router.post('/bookings/:id/cancel', validate(bookingSchema.cancelBooking), bookingController.cancel);
    this.router.post('/bookings/:id/review', validate(bookingSchema.createReview), bookingController.review);
    this.router.get('/bookings/:id', validate(bookingSchema.bookingParam), bookingController.getById);
  }
}

export default new UserRoutes().router;
