import { Router } from 'express';
import validate from '../middlewares/validate.js';
import { authenticate, requireType } from '../middlewares/auth.js';
import * as schema from '../validations/crew.validation.js';
import * as bookingSchema from '../validations/crewBooking.validation.js';
import { crewController, crewBookingController } from '../controllers/index.js';

class CrewRoutes {
  constructor() {
    this.router = Router();
    // Every route here operates on the authenticated crew member's own record.
    this.router.use(authenticate, requireType('crew'));
    this.registerRoutes();
  }

  registerRoutes() {
    // --- Profile ---
    this.router.get('/me', crewController.getProfile);

    // --- Onboarding steps (Complete Account: Personal → Work → Identity → Bank) ---
    this.router.patch('/me/personal', validate(schema.updatePersonal), crewController.updatePersonal);
    this.router.put('/me/work-profile', validate(schema.updateWorkProfile), crewController.updateWorkProfile);
    this.router.put('/me/identity-documents', validate(schema.upsertIdentityDocuments), crewController.upsertIdentityDocuments);
    this.router.put('/me/bank-details', validate(schema.upsertBankDetails), crewController.upsertBankDetails);
    this.router.post('/me/submit', crewController.submitForVerification);

    // --- Availability ---
    this.router.get('/me/availability', crewController.getAvailability);
    this.router.put('/me/availability', validate(schema.replaceAvailability), crewController.replaceAvailability);
    this.router.get('/me/time-off', crewController.listTimeOff);
    this.router.post('/me/time-off', validate(schema.addTimeOff), crewController.addTimeOff);
    this.router.delete('/me/time-off/:id', validate(schema.timeOffParam), crewController.deleteTimeOff);

    // --- Online/offline toggle ---
    this.router.patch('/me/online', validate(schema.setOnline), crewController.setOnline);

    // --- Post-approval edit requests (Edit Profile → Request Changes) ---
    this.router.post('/me/edit-requests', validate(schema.createEditRequest), crewController.createEditRequest);
    this.router.get('/me/edit-requests', crewController.listEditRequests);

    // --- Jobs (Home, Detail Order, Accept / Reject, Start Shift, Complete) ---
    this.router.get('/home', validate(bookingSchema.homeQuery), crewBookingController.getHome);
    this.router.get('/bookings', validate(bookingSchema.listBookings), crewBookingController.list);
    this.router.post('/bookings/:id/accept', validate(bookingSchema.bookingParam), crewBookingController.accept);
    this.router.post('/bookings/:id/reject', validate(bookingSchema.bookingParam), crewBookingController.reject);
    this.router.post('/bookings/:id/start', validate(bookingSchema.verifyStart), crewBookingController.verifyStart);
    this.router.post('/bookings/:id/otp/resend', validate(bookingSchema.bookingParam), crewBookingController.resendShiftOtp);
    this.router.post('/bookings/:id/complete', validate(bookingSchema.bookingParam), crewBookingController.complete);
    this.router.get('/bookings/:id', validate(bookingSchema.bookingParamWithCoords), crewBookingController.getById);
  }
}

export default new CrewRoutes().router;
