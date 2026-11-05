-- Unpaid checkouts move to expired instead of cancelled.
-- A new notification type lets the organizer app tell that push from a crew cancellation.

ALTER TYPE "BookingStatus" ADD VALUE 'expired';
ALTER TYPE "NotificationType" ADD VALUE 'booking_expired';
