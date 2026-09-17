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
  supervisorCountForWaiters,
} from '../config/pricing.js';
import ApiError from '../utils/apiError.js';
import { generateOtp } from '../utils/otp.js';
import { activityLogService, couponService, rateCardService, supervisorRangeService } from './index.js';

const CURRENT_STATUSES = ['confirmed', 'crew_assigned', 'in_progress'];
const PAST_STATUSES = ['completed', 'cancelled'];
const OTP_VISIBLE_STATUSES = ['confirmed', 'crew_assigned', 'in_progress'];
const CANCELLABLE_STATUSES = ['confirmed', 'crew_assigned'];
const SLOT_STATUSES = ['assigned', 'confirmed', 'in_progress', 'completed'];
const CANCEL_FEE_HOURS = 24;
const CANCEL_FEE_PCT = 50;

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
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
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
    distanceKm,
    canCancel: CANCELLABLE_STATUSES.includes(booking.status),
    canReview: booking.status === 'completed' && !review,
    reviewSubmitted: Boolean(review),
  };
}

function serializeDetails(booking) {
  const review = (booking.reviews || [])[0];
  const showOtp = OTP_VISIBLE_STATUSES.includes(booking.status);
  return {
    ...serializeSummary(booking),
    confirmedAt: booking.confirmedAt,
    cancelledAt: booking.cancelledAt,
    cancellationReason: booking.cancellationReason,
    shiftOtp: showOtp ? booking.shiftOtp : null,
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

function assertPendingPayment(booking) {
  if (booking.status !== 'pending_payment') {
    throw ApiError.conflict('This booking can no longer be edited', { code: 'BOOKING_NOT_EDITABLE' });
  }
}

function eventDateAdvisoryLockKeys(eventDate) {
  const ymd = dateToIsoDate(eventDate);
  const [year, month, day] = ymd.split('-').map(Number);
  return {
    key1: 0x434352, // CCR — serializes place() per event date
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

  await client.$queryRaw`SELECT pg_advisory_xact_lock(${key1}, ${key2})`;
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
    if (existingById) assertPendingPayment(existingById);

    const pendingRows = await prisma.booking.findMany({
      where: { userId, status: 'pending_payment' },
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
        await tx.booking.deleteMany({ where: { id: { in: extrasToDelete }, userId, status: 'pending_payment' } });
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
            status: 'pending_payment',
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
      where: { userId, status: 'pending_payment' },
      include: bookingDetailInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return booking ? serializeSummary(booking) : null;
  }

  async applyCoupon(userId, bookingId, code) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    assertPendingPayment(booking);
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
    assertPendingPayment(booking);
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

  async place(userId, bookingId) {
    await getUserOrThrow(userId);
    const booking = await loadOwnedBooking(userId, bookingId);
    assertPendingPayment(booking);
    if (!booking.crewRequirements.length || booking.estimatedTotal == null) {
      throw ApiError.badRequest('Booking is incomplete', { code: 'BOOKING_INCOMPLETE' });
    }

    assertVenueInServiceArea(booking.venueLatitude, booking.venueLongitude);

    const shiftOtp = generateOtp(4);
    const confirmedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await assertCrewSupplyForEvent(tx, booking);
      if (booking.couponId) {
        const coupon = await tx.coupon.findUnique({ where: { id: booking.couponId } });
        await couponService.assertRedeemable(coupon, { userId, bookingId: booking.id, client: tx });
        if (!couponService.meetsMinSpend(coupon, Number(booking.subtotal) || 0)) {
          throw ApiError.badRequest('Booking total is below this coupon minimum spend', {
            code: 'COUPON_MIN_SPEND',
          });
        }
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'confirmed',
          confirmedAt,
          shiftOtp,
        },
      });
    });

    await activityLogService.record({
      category: 'payment',
      actorType: 'user',
      actorId: userId,
      action: 'booking_placed',
      referenceEntityType: 'booking',
      referenceEntityId: booking.id,
      metadata: { bookingReference: booking.bookingReference },
    });

    const fresh = await prisma.booking.findUnique({
      where: { id: booking.id },
      include: bookingDetailInclude,
    });
    return serializeDetails(fresh);
  }

  async list(userId, query) {
    await getUserOrThrow(userId);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const tab = query.tab || 'current';
    const statuses = tab === 'past' ? PAST_STATUSES : CURRENT_STATUSES;

    const where = { userId, status: { in: statuses } };
    const [total, rows] = await prisma.$transaction([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: {
          crewRequirements: true,
          reviews: { select: { id: true } },
        },
        orderBy: [{ eventDate: tab === 'past' ? 'desc' : 'asc' }, { createdAt: 'desc' }],
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
