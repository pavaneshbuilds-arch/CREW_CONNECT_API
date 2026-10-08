import crypto from 'node:crypto';

import { prisma } from '../config/prisma.js';
import config from '../config/env.js';
import {
  COVER_RATIO,
  CREW_ROLES,
  DURATION_PRESETS,
  EVENT_TYPES,
  FOOD_SERVICE_TYPES,
  ROLE_LABELS,
  getGstPercent,
  suggestCrew,
  splitWaiterQuotas,
  supervisorCountForWaiters,
} from '../config/pricing.js';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';
import { generateOtp } from '../utils/otp.js';
import {
  activityLogService,
  couponService,
  rateCardService,
  razorpayService,
  smsService,
  supervisorRangeService,
} from './index.js';

const CURRENT_STATUSES = ['confirmed', 'crew_assigned', 'in_progress'];
const PAST_STATUSES = ['completed', 'cancelled'];
const ALL_STATUSES = ['created', ...CURRENT_STATUSES, ...PAST_STATUSES];
const IN_FLIGHT_PAYMENT = ['initiated', 'processing'];
const OTP_VISIBLE_STATUSES = ['confirmed', 'crew_assigned', 'in_progress'];
const CANCELLABLE_STATUSES = ['confirmed', 'crew_assigned'];
const SLOT_STATUSES = ['assigned', 'confirmed', 'in_progress', 'completed'];
const CANCEL_FEE_HOURS = 24;
const CANCEL_FEE_PCT = 50;
const MIN_AMOUNT_PAISE = 100;

const bookingDetailInclude = {
  crewRequirements: { orderBy: { id: 'asc' } },
  coupon: true,
  assignments: {
    where: { status: { notIn: ['removed_by_admin', 'cancelled_by_crew'] } },
    include: {
      crew: { select: { id: true, fullName: true, profilePhotoUrl: true, primaryRole: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  reviews: true,
  refunds: { orderBy: { createdAt: 'desc' } },
  payments: { orderBy: { createdAt: 'desc' } },
};

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function dateToIsoDate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function dateToTimeString(date) {
  if (!date) return null;
  if (typeof date === 'string' && /^\d{2}:\d{2}/.test(date)) return date.slice(0, 5);
  return date.toISOString().slice(11, 16);
}

function parseDateOnly(ymd) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function parseTimeOnly(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function eventStartInstant(eventDate, eventStartTime) {
  const ymd = dateToIsoDate(eventDate);
  const hm = dateToTimeString(eventStartTime);
  if (!ymd || !hm) return null;
  return new Date(`${ymd}T${hm}:00`);
}

function roleLabel(role, count) {
  const labels = ROLE_LABELS[role] || { singular: role, plural: role };
  return count === 1 ? labels.singular : labels.plural;
}

function formatCrewCounts(crewCounts) {
  const parts = CREW_ROLES.filter((role) => crewCounts[role] > 0).map(
    (role) => `${crewCounts[role]} ${roleLabel(role, crewCounts[role])}`
  );
  if (!parts.length) return 'no crew';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function crewSummaryMessage(crewCounts, { supervisorAdjusted, minSupervisors } = {}) {
  const countsText = formatCrewCounts(crewCounts);
  if (supervisorAdjusted) {
    const waiterText = `${crewCounts.waiter} ${roleLabel('waiter', crewCounts.waiter)}`;
    const supervisorText = `${minSupervisors} ${roleLabel('supervisor', minSupervisors)}`;
    return `Supervisor count was updated to ${supervisorText} for ${waiterText}. Your booking now includes ${countsText}.`;
  }
  return `Your booking includes ${countsText}.`;
}

function blankToNull(value) {
  if (value === undefined) return undefined;
  if (value === '') return null;
  return value;
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getServiceArea() {
  const latitude = config.serviceArea?.latitude;
  const longitude = config.serviceArea?.longitude;
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    radiusKm: config.serviceArea.radiusKm ?? 50,
  };
}

function assertVenueInServiceArea(lat, lng) {
  const area = getServiceArea();
  if (!area) return;
  if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
    throw ApiError.badRequest('Venue location is required', { code: 'VENUE_LOCATION_REQUIRED' });
  }
  const distanceKm = roundMoney(haversineKm(area.latitude, area.longitude, Number(lat), Number(lng)));
  if (distanceKm > area.radiusKm) {
    throw ApiError.badRequest(`Bookings are only available within ${area.radiusKm} km of Hyderabad.`, {
      code: 'VENUE_OUT_OF_RANGE',
      details: { distanceKm, maxKm: area.radiusKm },
    });
  }
}

function normalizeCrewCounts(crew = {}) {
  return {
    waiter: Math.max(0, Number(crew.waiter) || 0),
    supervisor: Math.max(0, Number(crew.supervisor) || 0),
    bouncer: Math.max(0, Number(crew.bouncer) || 0),
  };
}

function crewCountsFromRequirements(requirements = []) {
  const counts = { waiter: 0, supervisor: 0, bouncer: 0 };
  for (const row of requirements) {
    if (counts[row.role] != null) counts[row.role] = row.countRequired;
  }
  return counts;
}

function staffCountFromRequirements(requirements = []) {
  return requirements.reduce((sum, row) => sum + row.countRequired, 0);
}

function primaryRoleFromRequirements(requirements = []) {
  if (!requirements.length) return null;
  const sorted = [...requirements].sort((a, b) => {
    if (b.countRequired !== a.countRequired) return b.countRequired - a.countRequired;
    return CREW_ROLES.indexOf(a.role) - CREW_ROLES.indexOf(b.role);
  });
  return sorted[0].role;
}

function ratesFromRequirements(requirements = []) {
  return Object.fromEntries(
    (requirements || []).map((row) => [row.role, decimal(row.rate)])
  );
}

function buildLineItems({ crewCounts, rates }) {
  return CREW_ROLES.filter((role) => crewCounts[role] > 0).map((role) => {
    const count = crewCounts[role];
    const rate = Number(rates[role]);
    const amount = roundMoney(count * rate);
    return {
      role,
      label: `${count} ${roleLabel(role, count)}`,
      count,
      rate,
      amount,
      description: `${count} x ₹${rate}`,
    };
  });
}

function computeTotals(lineItems, coupon) {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0));
  const gstPercent = getGstPercent();
  const gstAmount = roundMoney(subtotal * (gstPercent / 100));
  const discountAmount = couponService.computeDiscountAmount(subtotal, coupon);
  const estimatedTotal = roundMoney(Math.max(0, subtotal + gstAmount - discountAmount));
  return { subtotal, gstPercent, gstAmount, discountAmount, estimatedTotal };
}

function serializeCoupon(coupon) {
  return couponService.serializeForBooking(coupon);
}

function cancellationPreview(booking, now = new Date()) {
  const start = eventStartInstant(booking.eventDate, booking.eventStartTime);
  const hoursUntil = start ? (start.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
  const within24Hours = hoursUntil == null ? false : hoursUntil <= CANCEL_FEE_HOURS;
  const feePct = within24Hours ? CANCEL_FEE_PCT : 0;
  const refundPct = 100 - feePct;
  const estimatedTotal = decimal(booking.estimatedTotal) || 0;
  const refundAmount = roundMoney(estimatedTotal * (refundPct / 100));
  const feeAmount = roundMoney(estimatedTotal - refundAmount);
  const daysBefore = hoursUntil == null ? null : roundMoney(Math.max(0, hoursUntil / 24));
  return {
    allowed: CANCELLABLE_STATUSES.includes(booking.status),
    within24Hours,
    feePct,
    refundPct,
    feeAmount,
    refundAmount,
    hoursUntilEvent: hoursUntil == null ? null : roundMoney(hoursUntil),
    cancellationDaysBeforeEvent: daysBefore,
  };
}

function serializeCostBreakdown(booking) {
  const counts = crewCountsFromRequirements(booking.crewRequirements);
  const rates = ratesFromRequirements(booking.crewRequirements);
  const lineItems = buildLineItems({ crewCounts: counts, rates });
  return {
    rates,
    lineItems,
    subtotal: decimal(booking.subtotal),
    gstPercent: getGstPercent(),
    gstAmount: decimal(booking.gstAmount),
    discountAmount: decimal(booking.discountAmount),
    estimatedTotal: decimal(booking.estimatedTotal),
    coupon: serializeCoupon(booking.coupon),
  };
}

function serializeSummary(booking) {
  const breakdown = serializeCostBreakdown(booking);
  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    eventType: booking.eventType,
    guestCount: booking.guestCount,
    foodServiceType: booking.foodServiceType,
    foodItemsCount: booking.foodItemsCount,
    eventDate: dateToIsoDate(booking.eventDate),
    eventStartTime: dateToTimeString(booking.eventStartTime),
    expectedDurationHours: decimal(booking.expectedDurationHours),
    venueName: booking.venueName,
    venueAddress: booking.venueAddress,
    venueLatitude: decimal(booking.venueLatitude),
    venueLongitude: decimal(booking.venueLongitude),
    additionalInstructions: booking.additionalInstructions,
    crew: crewCountsFromRequirements(booking.crewRequirements),
    staffCount: staffCountFromRequirements(booking.crewRequirements),
    ...breakdown,
    paymentStatus: paymentStatusOf(booking),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

function paymentStatusOf(booking) {
  return (booking.payments || [])[0]?.status ?? null;
}

function buildTimeline(booking) {
  const firstAssignment = (booking.assignments || [])[0];
  const crewAssignedAt = firstAssignment?.createdAt || null;
  const crewAssignedDone = ['crew_assigned', 'in_progress', 'completed'].includes(booking.status);
  const cancelled = booking.status === 'cancelled';

  const steps = [
    { key: 'order_placed', label: 'Order Placed', at: booking.createdAt, done: true },
    {
      key: 'booking_confirmed',
      label: 'Booking Confirmed',
      at: booking.confirmedAt,
      done: Boolean(booking.confirmedAt) || CURRENT_STATUSES.includes(booking.status) || booking.status === 'completed',
    },
    {
      key: 'crew_assigned',
      label: 'Crew Assigned',
      at: crewAssignedDone ? crewAssignedAt : null,
      done: crewAssignedDone,
    },
    {
      key: 'completed',
      label: 'Completed',
      at: booking.status === 'completed' ? booking.updatedAt : null,
      done: booking.status === 'completed',
    },
  ];

  if (cancelled) {
    steps.push({
      key: 'cancelled',
      label: 'Cancelled',
      at: booking.cancelledAt,
      done: true,
    });
  }

  return steps;
}

function serializeListItem(booking, { latitude, longitude } = {}) {
  const review = (booking.reviews || [])[0];
  let distanceKm = null;
  if (
    latitude != null &&
    longitude != null &&
    booking.venueLatitude != null &&
    booking.venueLongitude != null
  ) {
    distanceKm = roundMoney(
      Math.round(
        haversineKm(
          Number(latitude),
          Number(longitude),
          Number(booking.venueLatitude),
          Number(booking.venueLongitude)
        ) * 10
      ) / 10
    );
  }

  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    eventType: booking.eventType,
    venueName: booking.venueName,
    venueAddress: booking.venueAddress,
    eventDate: dateToIsoDate(booking.eventDate),
    eventStartTime: dateToTimeString(booking.eventStartTime),
    expectedDurationHours: decimal(booking.expectedDurationHours),
    staffCount: staffCountFromRequirements(booking.crewRequirements),
    crew: crewCountsFromRequirements(booking.crewRequirements),
    primaryRole: primaryRoleFromRequirements(booking.crewRequirements),
    estimatedTotal: decimal(booking.estimatedTotal),
    paymentStatus: paymentStatusOf(booking),
    distanceKm,
    canCancel: CANCELLABLE_STATUSES.includes(booking.status),
    canReview: booking.status === 'completed' && !review,
    reviewSubmitted: Boolean(review),
  };
}

const SHIFT_STARTABLE_STATUSES = ['assigned', 'confirmed'];

function validationRoles(booking) {
  const counts = crewCountsFromRequirements(booking.crewRequirements);
  const roles = [];
  if (counts.supervisor > 0) roles.push('supervisor');
  else if (counts.waiter > 0) roles.push('waiter');
  if (counts.bouncer > 0) roles.push('bouncer');
  return roles;
}

function shiftValidationMode(roles) {
  if (roles.includes('supervisor')) return 'supervisors';
  if (roles.includes('waiter')) return 'waiters';
  return 'bouncers';
}

function serializeValidationRow(assignment) {
  const notStarted = SHIFT_STARTABLE_STATUSES.includes(assignment.status);
  return {
    assignmentId: assignment.id,
    crewId: assignment.crew?.id ?? assignment.crewId,
    fullName: assignment.crew?.fullName ?? null,
    profilePhotoUrl: assignment.crew?.profilePhotoUrl ?? null,
    role: assignment.role,
    status: assignment.status,
    shiftStartedAt: assignment.shiftStartedAt ?? null,
    otp: notStarted ? assignment.shiftOtp ?? null : null,
    canIssueOtp: notStarted,
  };
}

function buildShiftValidation(booking) {
  const roles = validationRoles(booking);
  const bookingOpen = OTP_VISIBLE_STATUSES.includes(booking.status);
  const rows = roles.flatMap((role) =>
    (booking.assignments || [])
      .filter((row) => row.role === role)
      .map((row) => {
        const serialized = serializeValidationRow(row);
        if (!bookingOpen) return { ...serialized, otp: null, canIssueOtp: false };
        return serialized;
      })
  );
  return {
    mode: shiftValidationMode(roles),
    rows,
  };
}

function serializeDetails(booking) {
  const review = (booking.reviews || [])[0];
  return {
    ...serializeSummary(booking),
    confirmedAt: booking.confirmedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    shiftValidation: buildShiftValidation(booking),
    timeline: buildTimeline(booking),
    cancellation: cancellationPreview(booking),
    assignedCrew: (booking.assignments || []).map((a) => ({
      id: a.crew?.id,
      fullName: a.crew?.fullName,
      profilePhotoUrl: a.crew?.profilePhotoUrl,
      role: a.role,
      status: a.status,
    })),
    review: review
      ? {
          id: review.id,
          rating: review.rating,
          wouldRecommend: review.wouldRecommend,
          reviewText: review.reviewText,
          createdAt: review.createdAt,
        }
      : null,
  };
}

async function getUserOrThrow(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw ApiError.notFound('User not found', { code: 'USER_NOT_FOUND' });
  if (!user.isActive) throw ApiError.forbidden('This account is suspended', { code: 'ACCOUNT_SUSPENDED' });
  return user;
}

async function loadOwnedBooking(userId, bookingId, include = bookingDetailInclude) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include,
  });
  if (!booking) throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
  return booking;
}

function assertCart(booking) {
  if (booking.status !== 'cart') {
    throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
  }
}

function assertCreated(booking) {
  if (booking.status !== 'created') {
    throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
  }
}

function toPaise(rupees) {
  const paise = Math.round((Number(rupees) + Number.EPSILON) * 100);
  return Number.isFinite(paise) ? paise : NaN;
}

function assertPayableAmount(booking) {
  const amountPaise = toPaise(booking.estimatedTotal);
  if (!Number.isInteger(amountPaise) || amountPaise < MIN_AMOUNT_PAISE) {
    throw ApiError.badRequest('Payment amount must be at least 100 paise', { code: 'AMOUNT_TOO_LOW' });
  }
  return amountPaise;
}

async function assertCouponRedeemable(client, booking, userId) {
  if (!booking.couponId) return;
  const coupon = await client.coupon.findUnique({ where: { id: booking.couponId } });
  await couponService.assertRedeemable(coupon, { userId, bookingId: booking.id, client });
  if (!couponService.meetsMinSpend(coupon, Number(booking.subtotal) || 0)) {
    throw ApiError.badRequest('Booking total is below this coupon minimum spend', {
      code: 'COUPON_MIN_SPEND',
    });
  }
}

async function assertReadyToPay(userId, booking) {
  if (booking.status !== 'cart' && booking.status !== 'created') {
    throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
  }
  if (!booking.crewRequirements.length || booking.estimatedTotal == null) {
    throw ApiError.badRequest('Booking is incomplete', { code: 'BOOKING_INCOMPLETE' });
  }
  assertVenueInServiceArea(booking.venueLatitude, booking.venueLongitude);
  const amountPaise = assertPayableAmount(booking);
  await prisma.$transaction(async (tx) => {
    await assertCrewSupplyForEvent(tx, booking);
    await assertCouponRedeemable(tx, booking, userId);
  });
  return amountPaise;
}

async function markPaymentCaptured(paymentId, razorpayPaymentId) {
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'success',
      paymentGatewayRef: razorpayPaymentId,
      paidAt: new Date(),
    },
  });
}

async function reloadBookingDetails(bookingId) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingDetailInclude,
  });
}

function paymentOrderResponse(booking, payment) {
  return {
    keyId: razorpayService.credentials().keyId,
    orderId: payment.razorpayOrderId,
    amount: toPaise(payment.amount),
    currency: 'INR',
    bookingId: booking.id,
  };
}

function eventDateAdvisoryLockKeys(eventDate) {
  const ymd = dateToIsoDate(eventDate);
  const [year, month, day] = ymd.split('-').map(Number);
  return {
    key1: 0x434352, // CCR — serializes checkout confirm per event date
    key2: year * 10000 + month * 100 + day,
  };
}

function reservedDemandByRole(liveBookings) {
  const reserved = { waiter: 0, supervisor: 0, bouncer: 0 };
  for (const other of liveBookings) {
    const required = crewCountsFromRequirements(other.crewRequirements);
    const filled = { waiter: 0, supervisor: 0, bouncer: 0 };
    for (const assignment of other.assignments || []) {
      if (filled[assignment.role] != null) filled[assignment.role] += 1;
    }
    for (const role of CREW_ROLES) {
      reserved[role] += Math.max(0, required[role] - filled[role]);
    }
  }
  return reserved;
}

/**
 * A crew member can fill a role on this date if they are approved/active,
 * match the role, are not on time off, and are not already assigned that day.
 * Unfilled slots on other live same-day bookings also reserve capacity.
 */
async function assertCrewSupplyForEvent(client, booking) {
  const requirements = (booking.crewRequirements || []).filter((row) => row.countRequired > 0);
  if (!requirements.length || !booking.eventDate) return;

  const roles = [...new Set(requirements.map((row) => row.role))];
  const eventDate = booking.eventDate;
  const { key1, key2 } = eventDateAdvisoryLockKeys(eventDate);

  // Two-arg pg_advisory_xact_lock takes int4,int4 — Prisma binds JS numbers as bigint.
  // Use $executeRaw: the function returns void, which $queryRaw cannot deserialize.
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${key1}::int, ${key2}::int)`;
  await client.$queryRaw`
    SELECT id FROM bookings
    WHERE event_date = ${eventDate}
      AND status IN ('confirmed', 'crew_assigned', 'in_progress')
    FOR UPDATE
  `;

  const [eligible, dateBlocks, busyAssignments, timeOff, liveBookings] = await Promise.all([
    client.crewMember.findMany({
      where: {
        primaryRole: { in: roles },
        verificationStatus: 'approved',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, primaryRole: true },
    }),
    client.crewDateBlock.findMany({
      where: { blockedDate: eventDate },
      select: { crewId: true },
    }),
    client.eventCrewAssignment.findMany({
      where: {
        status: { in: SLOT_STATUSES },
        booking: { eventDate },
      },
      select: { crewId: true },
    }),
    client.crewTimeOff.findMany({
      where: {
        startDate: { lte: eventDate },
        endDate: { gte: eventDate },
      },
      select: { crewId: true },
    }),
    client.booking.findMany({
      where: {
        eventDate,
        status: { in: CURRENT_STATUSES },
        id: { not: booking.id },
      },
      include: {
        crewRequirements: true,
        assignments: { where: { status: { in: SLOT_STATUSES } }, select: { role: true } },
      },
    }),
  ]);

  const unavailable = new Set([
    ...dateBlocks.map((row) => row.crewId),
    ...busyAssignments.map((row) => row.crewId),
    ...timeOff.map((row) => row.crewId),
  ]);

  const poolByRole = { waiter: 0, supervisor: 0, bouncer: 0 };
  for (const crew of eligible) {
    if (unavailable.has(crew.id)) continue;
    poolByRole[crew.primaryRole] += 1;
  }

  const reservedByRole = reservedDemandByRole(liveBookings);
  const availableByRole = { waiter: 0, supervisor: 0, bouncer: 0 };
  for (const role of CREW_ROLES) {
    availableByRole[role] = Math.max(0, (poolByRole[role] || 0) - (reservedByRole[role] || 0));
  }

  const requiredByRole = crewCountsFromRequirements(requirements);
  const shortages = CREW_ROLES.filter((role) => requiredByRole[role] > 0)
    .map((role) => {
      const required = requiredByRole[role];
      const available = availableByRole[role] || 0;
      const shortage = Math.max(0, required - available);
      return {
        role,
        label: roleLabel(role, shortage || required),
        required,
        available,
        shortage,
      };
    })
    .filter((row) => row.shortage > 0);

  if (!shortages.length) return;

  const message = shortages.map((row) => `${row.shortage} ${row.label} shortage`).join(', ');
  throw ApiError.conflict(message, { code: 'CREW_SHORTAGE', details: { shortages } });
}

async function allocateBookingReference() {
  for (let i = 0; i < 8; i += 1) {
    const bookingReference = `PC-${crypto.randomInt(10000, 100000)}`;
    const clash = await prisma.booking.findUnique({
      where: { bookingReference },
      select: { id: true },
    });
    if (!clash) return bookingReference;
  }
  throw ApiError.internal('Could not allocate a booking reference');
}

async function quoteFromCounts(crewCounts, coupon) {
  const rates = await rateCardService.getRates();
  const lineItems = buildLineItems({ crewCounts, rates });
  if (!lineItems.length) {
    throw ApiError.badRequest('Select at least one crew member', { code: 'CREW_REQUIRED' });
  }
  return { rates, lineItems, ...computeTotals(lineItems, coupon) };
}

function quoteFromBooking(booking, coupon) {
  const crewCounts = crewCountsFromRequirements(booking.crewRequirements);
  const rates = ratesFromRequirements(booking.crewRequirements);
  const lineItems = buildLineItems({ crewCounts, rates });
  return { lineItems, ...computeTotals(lineItems, coupon) };
}

async function persistSupervisorSlots(tx, booking) {
  const counts = crewCountsFromRequirements(booking.crewRequirements);
  const quotas = splitWaiterQuotas(counts.waiter, counts.supervisor);
  if (!quotas.length) return;
  await tx.bookingSupervisorSlot.createMany({
    data: quotas.map((waiterQuota, index) => ({
      bookingId: booking.id,
      sortOrder: index,
      waiterQuota,
    })),
  });
}

async function confirmPaidBooking(userId, booking, payment, razorpayPaymentId, source) {
  assertCreated(booking);
  if (!booking.crewRequirements.length || booking.estimatedTotal == null) {
    throw ApiError.badRequest('Booking is incomplete', { code: 'BOOKING_INCOMPLETE' });
  }
  assertVenueInServiceArea(booking.venueLatitude, booking.venueLongitude);

  const chargedPaise = toPaise(payment.amount);
  const totalPaise = toPaise(booking.estimatedTotal);
  if (chargedPaise !== totalPaise) {
    throw ApiError.conflict('The booking total changed. Start checkout again.', { code: 'PAYMENT_AMOUNT_CHANGED' });
  }

  const confirmedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({
      where: { id: booking.id },
      select: { status: true },
    });
    if (!current || current.status !== 'created') {
      throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
    }

    await assertCrewSupplyForEvent(tx, booking);
    await assertCouponRedeemable(tx, booking, userId);

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'success',
        paymentGatewayRef: razorpayPaymentId,
        paidAt: confirmedAt,
      },
    });
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: 'created' },
      data: {
        status: 'confirmed',
        confirmedAt,
        advancePaidPct: 100,
      },
    });
    if (updated.count !== 1) {
      throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
    }
    await persistSupervisorSlots(tx, booking);
  });

  await activityLogService.record({
    category: 'payment',
    actorType: 'user',
    actorId: userId,
    action: 'booking_placed',
    referenceEntityType: 'booking',
    referenceEntityId: booking.id,
    metadata: {
      bookingReference: booking.bookingReference,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId,
      source: source || 'checkout',
    },
  });
}

/**
 * Apply a captured Razorpay payment. Confirms the booking when the same guards
 * as checkout verify pass. A refused confirm still stores the payment as
 * success, then rethrows, because the money has already moved.
 */
async function settleCapturedPayment(userId, booking, payment, razorpayPaymentId, source) {
  if (
    payment.status === 'success' &&
    payment.paymentGatewayRef === razorpayPaymentId &&
    booking.status !== 'created'
  ) {
    return { confirmed: true };
  }

  if (booking.status !== 'created') {
    throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
  }

  try {
    await confirmPaidBooking(userId, booking, payment, razorpayPaymentId, source);
    return { confirmed: true };
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (err.code === 'BOOKING_NOT_EDITABLE') {
      const fresh = await reloadBookingDetails(booking.id);
      const currentPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      if (
        fresh &&
        fresh.status !== 'created' &&
        currentPayment?.status === 'success' &&
        currentPayment.paymentGatewayRef === razorpayPaymentId
      ) {
        return { confirmed: true, booking: fresh };
      }
    }
    await markPaymentCaptured(payment.id, razorpayPaymentId);
    throw err;
  }
}

async function persistRequirements(tx, bookingId, crewCounts, rates) {
  await tx.bookingCrewRequirement.deleteMany({ where: { bookingId } });
  const rows = CREW_ROLES.filter((role) => crewCounts[role] > 0).map((role) => ({
    bookingId,
    role,
    countRequired: crewCounts[role],
    rate: rates[role],
  }));
  if (rows.length) await tx.bookingCrewRequirement.createMany({ data: rows });
}

class BookingService {
  async getOptions() {
    const [rates, supervisorRanges] = await Promise.all([
      rateCardService.getRates(),
      supervisorRangeService.list(),
    ]);
    return {
      eventTypes: EVENT_TYPES,
      foodServiceTypes: FOOD_SERVICE_TYPES,
      durations: DURATION_PRESETS,
      rates,
      gstPercent: getGstPercent(),
      coverRatio: COVER_RATIO,
      supervisorRanges,
    };
  }

  async getCrewSuggestion({ guestCount, foodItemsCount }) {
    const ranges = await supervisorRangeService.list();
    const suggestion = suggestCrew(guestCount, ranges);
    const foodNote =
      foodItemsCount != null ? ` and ${foodItemsCount} food item${foodItemsCount === 1 ? '' : 's'}` : '';
    const waiterLabel = `${suggestion.waiter} ${roleLabel('waiter', suggestion.waiter)}`;
    const supervisorPart =
      suggestion.supervisor > 0
        ? ` and ${suggestion.supervisor} ${roleLabel('supervisor', suggestion.supervisor)}`
        : '';
    return {
      guestCount,
      foodItemsCount: foodItemsCount ?? null,
      coverRatio: suggestion.coverRatio,
      totalPersonnel: suggestion.totalPersonnel,
      recommended: {
        waiter: suggestion.waiter,
        supervisor: suggestion.supervisor,
        bouncer: suggestion.bouncer,
      },
      message: `Based on ${guestCount} guests${foodNote}, we recommend at least ${waiterLabel}${supervisorPart}.`,
    };
  }

  async upsertSummary(userId, body) {
    await getUserOrThrow(userId);

    if (body.eventDate < todayYmd()) {
      throw ApiError.badRequest('Event date cannot be in the past', { code: 'EVENT_DATE_INVALID' });
    }

    assertVenueInServiceArea(body.venueLatitude, body.venueLongitude);

    const crewCounts = normalizeCrewCounts(body.crew);
    const requestedSupervisor = crewCounts.supervisor;
    const ranges = await supervisorRangeService.list();
    const minSupervisors = supervisorCountForWaiters(crewCounts.waiter, ranges);
    crewCounts.supervisor = Math.max(requestedSupervisor, minSupervisors);
    const supervisorAdjusted = crewCounts.supervisor > requestedSupervisor;
    const message = crewSummaryMessage(crewCounts, { supervisorAdjusted, minSupervisors });
    const durationHours = Number(body.expectedDurationHours);

    const existingById = body.id
      ? await loadOwnedBooking(userId, body.id)
      : null;
    if (existingById) assertCart(existingById);

    const pendingRows = await prisma.booking.findMany({
      where: { userId, status: 'cart' },
      include: bookingDetailInclude,
      orderBy: { updatedAt: 'desc' },
    });

    const target = existingById || pendingRows[0] || null;
    let coupon = target?.coupon || null;
    if (coupon && !(await couponService.isRedeemable(coupon, { userId, bookingId: target.id }))) {
      coupon = null;
    }
    let totals = await quoteFromCounts(crewCounts, coupon);
    if (coupon && !couponService.meetsMinSpend(coupon, totals.subtotal)) {
      coupon = null;
      totals = await quoteFromCounts(crewCounts, null);
    }

    const bookingData = {
      eventType: body.eventType,
      guestCount: body.guestCount,
      foodServiceType: body.foodServiceType,
      foodItemsCount: body.foodItemsCount,
      eventDate: parseDateOnly(body.eventDate),
      eventStartTime: parseTimeOnly(body.eventStartTime),
      expectedDurationHours: durationHours,
      venueName: body.venueName,
      venueAddress: body.venueAddress,
      venueLatitude: body.venueLatitude ?? null,
      venueLongitude: body.venueLongitude ?? null,
      additionalInstructions: blankToNull(body.additionalInstructions) ?? null,
      couponId: coupon?.id ?? null,
      subtotal: totals.subtotal,
      gstAmount: totals.gstAmount,
      discountAmount: totals.discountAmount,
      estimatedTotal: totals.estimatedTotal,
    };

    const extrasToDelete = pendingRows.filter((row) => !target || row.id !== target.id).map((row) => row.id);

    const saved = await prisma.$transaction(async (tx) => {
      if (extrasToDelete.length) {
        await tx.booking.deleteMany({ where: { id: { in: extrasToDelete }, userId, status: 'cart' } });
      }

      let booking;
      let created = false;
      if (target) {
        booking = await tx.booking.update({
          where: { id: target.id },
          data: bookingData,
        });
      } else {
        created = true;
        booking = await tx.booking.create({
          data: {
            ...bookingData,
            userId,
            bookingReference: await allocateBookingReference(),
            status: 'cart',
          },
        });
      }

      await persistRequirements(tx, booking.id, crewCounts, totals.rates);
      return { id: booking.id, created };
    });

    const fresh = await prisma.booking.findUnique({
      where: { id: saved.id },
      include: bookingDetailInclude,
    });
    return { data: { ...serializeSummary(fresh), message }, created: saved.created, message };
  }

  async getCart(userId) {
    await getUserOrThrow(userId);
    const booking = await prisma.booking.findFirst({
      where: { userId, status: 'cart' },
      include: bookingDetailInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return booking ? serializeSummary(booking) : null;
  }

  async applyCoupon(userId, bookingId, code) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    assertCart(booking);
    const coupon = await couponService.findUsableByCode(code, { userId, bookingId: booking.id });
    const quote = quoteFromBooking(booking, coupon);
    if (!couponService.meetsMinSpend(coupon, quote.subtotal)) {
      throw ApiError.badRequest('Booking total is below this coupon minimum spend', {
        code: 'COUPON_MIN_SPEND',
      });
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        couponId: coupon.id,
        subtotal: quote.subtotal,
        gstAmount: quote.gstAmount,
        discountAmount: quote.discountAmount,
        estimatedTotal: quote.estimatedTotal,
      },
    });

    const fresh = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: bookingDetailInclude,
    });
    return serializeSummary(fresh);
  }

  async removeCoupon(userId, bookingId) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    assertCart(booking);
    const quote = quoteFromBooking(booking, null);

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        couponId: null,
        subtotal: quote.subtotal,
        gstAmount: quote.gstAmount,
        discountAmount: quote.discountAmount,
        estimatedTotal: quote.estimatedTotal,
      },
    });

    const fresh = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: bookingDetailInclude,
    });
    return serializeSummary(fresh);
  }

  async createPaymentOrder(userId, bookingId) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== 'cart' && booking.status !== 'created') {
      throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
    }

    const latest = await prisma.payment.findFirst({
      where: { bookingId: booking.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latest?.status === 'success') {
      throw ApiError.conflict(
        'Payment was captured but the booking is not confirmed. Retry payment verification.',
        { code: 'PAYMENT_CAPTURED' }
      );
    }
    if (booking.status === 'created' && latest && IN_FLIGHT_PAYMENT.includes(latest.status)) {
      return paymentOrderResponse(booking, latest);
    }

    const amountPaise = await assertReadyToPay(userId, booking);
    const order = await razorpayService.createOrder({
      amount: amountPaise,
      receipt: booking.bookingReference.slice(0, 40),
      notes: { bookingId: String(booking.id) },
    });
    const amountRupees = roundMoney(amountPaise / 100);

    const stored = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`;
      const current = await tx.booking.findUnique({
        where: { id: booking.id },
        select: { status: true },
      });
      if (!current || (current.status !== 'cart' && current.status !== 'created')) {
        throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
      }
      const capturedNow = await tx.payment.findFirst({
        where: { bookingId: booking.id, status: 'success' },
        select: { id: true },
      });
      if (capturedNow) {
        throw ApiError.conflict(
          'Payment was captured but the booking is not confirmed. Retry payment verification.',
          { code: 'PAYMENT_CAPTURED' }
        );
      }
      const inFlight = await tx.payment.findFirst({
        where: { bookingId: booking.id, status: { in: IN_FLIGHT_PAYMENT } },
        orderBy: { createdAt: 'desc' },
      });
      if (inFlight) return inFlight;

      const createdPayment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          paymentType: 'advance',
          amount: amountRupees,
          status: 'initiated',
          razorpayOrderId: order.id,
        },
      });
      if (current.status === 'cart') {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'created' },
        });
      }
      return createdPayment;
    });

    return paymentOrderResponse(booking, stored);
  }

  async verifyPayment(userId, bookingId, body) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    razorpayService.verifySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    const payment = await prisma.payment.findFirst({
      where: { bookingId: booking.id, razorpayOrderId },
    });
    if (!payment) {
      throw ApiError.badRequest('Payment order does not match this booking', { code: 'PAYMENT_ORDER_MISMATCH' });
    }

    const settled = await settleCapturedPayment(userId, booking, payment, razorpayPaymentId, 'checkout');
    if (settled.booking) return serializeDetails(settled.booking);
    const fresh = await reloadBookingDetails(booking.id);
    return serializeDetails(fresh);
  }

  /**
   * Razorpay server callback. Signature is checked by the controller before this
   * runs. Captured payments follow the same confirm path as checkout verify.
   * Failed payments stay `failed` on a `created` booking so the organizer can retry.
   * Unknown orders are acknowledged so Razorpay does not retry them.
   */
  async handleRazorpayWebhook(event) {
    const name = event?.event;
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;
    const paymentId = paymentEntity?.id;
    if (!orderId || !paymentId) {
      return { received: true, ignored: true };
    }

    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: orderId },
    });
    if (!payment) {
      logger.info('Razorpay webhook for an unknown order', { event: name, orderId });
      return { received: true, ignored: true };
    }

    if (name === 'payment.failed') {
      if (payment.status === 'success') {
        return { received: true, paymentStatus: 'success' };
      }
      await prisma.payment.updateMany({
        where: { id: payment.id, status: { not: 'success' } },
        data: {
          status: 'failed',
          paymentGatewayRef: paymentId,
        },
      });
      await activityLogService.record({
        category: 'payment',
        actorType: 'system',
        action: 'payment_failed',
        referenceEntityType: 'booking',
        referenceEntityId: payment.bookingId,
        metadata: { razorpayOrderId: orderId, razorpayPaymentId: paymentId },
      });
      return { received: true, paymentStatus: 'failed', bookingConfirmed: false };
    }

    if (name === 'payment.authorized') {
      if (payment.status === 'success' || payment.status === 'failed') {
        return { received: true, paymentStatus: payment.status };
      }
      await prisma.payment.updateMany({
        where: { id: payment.id, status: { in: IN_FLIGHT_PAYMENT } },
        data: {
          status: 'processing',
          paymentGatewayRef: paymentId,
        },
      });
      return { received: true, paymentStatus: 'processing', bookingConfirmed: false };
    }

    if (name !== 'payment.captured' && name !== 'order.paid') {
      return { received: true, ignored: true };
    }

    const capturedPaise = Number(paymentEntity.amount);
    if (capturedPaise !== toPaise(payment.amount)) {
      logger.error('Razorpay webhook amount does not match the stored payment', {
        orderId,
        paymentId,
        capturedPaise,
        expectedPaise: toPaise(payment.amount),
      });
      return { received: true, ignored: true };
    }

    const booking = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      include: bookingDetailInclude,
    });
    if (!booking) {
      return { received: true, ignored: true };
    }

    try {
      const settled = await settleCapturedPayment(
        booking.userId,
        booking,
        payment,
        paymentId,
        'webhook'
      );
      return { received: true, paymentStatus: 'success', bookingConfirmed: settled.confirmed };
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      logger.warn('Razorpay payment captured but booking was not confirmed', {
        code: err.code,
        orderId,
        paymentId,
        bookingId: booking.id,
      });
      return {
        received: true,
        paymentStatus: 'success',
        bookingConfirmed: false,
        code: err.code,
      };
    }
  }

  async list(userId, query) {
    await getUserOrThrow(userId);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const tab = query.tab || 'current';
    const statuses = tab === 'past' ? PAST_STATUSES : tab === 'all' ? ALL_STATUSES : CURRENT_STATUSES;

    const where = { userId, status: { in: statuses } };
    const [total, rows] = await prisma.$transaction([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: {
          crewRequirements: true,
          reviews: { select: { id: true } },
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy:
          tab === 'all'
            ? [{ createdAt: 'desc' }]
            : [{ eventDate: tab === 'past' ? 'desc' : 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) =>
        serializeListItem(row, { latitude: query.latitude, longitude: query.longitude })
      ),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async getById(userId, bookingId) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    return serializeDetails(booking);
  }

  async issueShiftOtp(userId, bookingId, assignmentId) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    if (!OTP_VISIBLE_STATUSES.includes(booking.status)) {
      throw ApiError.conflict('Shift codes can only be issued for an active booking', {
        code: 'SHIFT_OTP_NOT_ISSUABLE',
      });
    }

    const assignment = (booking.assignments || []).find((row) => row.id === assignmentId);
    if (!assignment) {
      throw ApiError.notFound('Crew assignment not found', { code: 'ASSIGNMENT_NOT_FOUND' });
    }
    if (!validationRoles(booking).includes(assignment.role)) {
      throw ApiError.forbidden('This crew member is not validated from this order', {
        code: 'SHIFT_OTP_NOT_ALLOWED',
      });
    }
    if (!SHIFT_STARTABLE_STATUSES.includes(assignment.status)) {
      throw ApiError.conflict('This shift has already started', { code: 'SHIFT_ALREADY_STARTED' });
    }

    const shiftOtp = generateOtp(4);
    const updated = await prisma.eventCrewAssignment.update({
      where: { id: assignment.id },
      data: { shiftOtp, shiftOtpIssuedAt: new Date() },
      include: {
        crew: {
          select: { id: true, fullName: true, profilePhotoUrl: true, phoneNumber: true },
        },
      },
    });

    if (updated.crew?.phoneNumber) {
      await smsService.sendOtp(updated.crew.phoneNumber, shiftOtp);
    }

    return serializeValidationRow(updated);
  }

  async cancel(userId, bookingId, reason) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    const preview = cancellationPreview(booking);
    if (!preview.allowed) {
      throw ApiError.conflict('This booking cannot be cancelled', { code: 'BOOKING_NOT_CANCELLABLE' });
    }

    const cancelledAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'cancelled',
          cancelledAt,
          cancellationReason: blankToNull(reason) ?? null,
        },
      });
      await tx.refund.create({
        data: {
          bookingId: booking.id,
          paymentId: null,
          cancellationDaysBeforeEvent: preview.cancellationDaysBeforeEvent,
          refundPctApplied: preview.refundPct,
          refundAmount: preview.refundAmount,
          status: 'pending',
        },
      });
    });

    await activityLogService.record({
      category: 'payment',
      actorType: 'user',
      actorId: userId,
      action: 'booking_cancelled',
      referenceEntityType: 'booking',
      referenceEntityId: booking.id,
      metadata: {
        bookingReference: booking.bookingReference,
        refundPct: preview.refundPct,
        feePct: preview.feePct,
      },
    });

    const fresh = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: bookingDetailInclude,
    });
    return serializeDetails(fresh);
  }

  async review(userId, bookingId, body) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    if (booking.status !== 'completed') {
      throw ApiError.conflict('Reviews are only allowed after the booking is completed', {
        code: 'REVIEW_NOT_ALLOWED',
      });
    }
    if (booking.reviews?.length) {
      throw ApiError.conflict('A review has already been submitted for this booking', {
        code: 'REVIEW_ALREADY_EXISTS',
      });
    }

    try {
      await prisma.review.create({
        data: {
          bookingId: booking.id,
          userId,
          rating: body.rating,
          wouldRecommend: body.wouldRecommend ?? null,
          reviewText: blankToNull(body.reviewText) ?? null,
        },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw ApiError.conflict('A review has already been submitted for this booking', {
          code: 'REVIEW_ALREADY_EXISTS',
        });
      }
      throw err;
    }

    await activityLogService.record({
      category: 'payment',
      actorType: 'user',
      actorId: userId,
      action: 'booking_reviewed',
      referenceEntityType: 'booking',
      referenceEntityId: booking.id,
      metadata: { rating: body.rating },
    });

    const fresh = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: bookingDetailInclude,
    });
    return serializeDetails(fresh);
  }
}

export default new BookingService();
