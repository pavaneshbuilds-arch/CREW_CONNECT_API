-- Cart is the unpaid draft. Created is checkout in flight. Payment pending becomes initiated.

ALTER TYPE "BookingStatus" RENAME VALUE 'pending_payment' TO 'cart';
ALTER TYPE "BookingStatus" ADD VALUE 'created' BEFORE 'confirmed';

ALTER TYPE "PaymentStatus" RENAME VALUE 'pending' TO 'initiated';
ALTER TYPE "PaymentStatus" ADD VALUE 'processing' AFTER 'initiated';
