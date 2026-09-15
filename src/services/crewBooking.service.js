import { prisma } from '../config/prisma.js';
import {
  DEFAULT_BRIEFING,
  ROLE_LABELS,
  ROLE_REQUIREMENTS,
} from '../config/pricing.js';
import ApiError from '../utils/apiError.js';
import { generateOtp } from '../utils/otp.js';
import { activityLogService, smsService } from './index.js';

const SLOT_STATUSES = ['assigned', 'confirmed', 'in_progress', 'completed'];
const OPEN_BOOKING_STATUSES = ['confirmed'];
const UPCOMING_ASSIGNMENT_STATUSES = ['assigned', 'confirmed'];
const CREW_JOB_INCLUDE = {
  crewRequirements: { orderBy: { id: 'asc' } },
  assignments: {
    where: { status: { in: SLOT_STATUSES } },
    include: {
      crew: { select: { id: true, fullName: true, profilePhotoUrl: true, primaryRole: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  user: { select: { id: true, fullName: true, phoneNumber: true, profilePhotoUrl: true } },
  reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
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

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysYmd(ymd, days) {
  const date = parseDateOnly(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToIsoDate(date);
}

function eventDateLabel(ymd) {
  if (!ymd) return null;
  const today = todayYmd();
  if (ymd === today) return 'Today';
  if (ymd === addDaysYmd(today, 1)) return 'Tomorrow';
  return null;
}

function eventStartInstant(eventDate, eventStartTime) {
  const ymd = dateToIsoDate(eventDate);
  const hm = dateToTimeString(eventStartTime);
  if (!ymd || !hm) return null;
  return new Date(`${ymd}T${hm}:00`);
}

function addHoursToTime(hhmm, hours) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + Number(hours) * 60;
  const endH = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const endM = ((total % 60) + 60) % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
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

function dayOfWeekFromYmd(ymd) {
  const js = parseDateOnly(ymd).getUTCDay(); // 0 Sun .. 6 Sat
  return js === 0 ? 6 : js - 1; // 0 Mon .. 6 Sun
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function roleLabel(role, count = 1) {
  const labels = ROLE_LABELS[role] || { singular: role, plural: role };
  return count === 1 ? labels.singular : labels.plural;
}

function requirementForRole(booking, role) {
  return (booking.crewRequirements || []).find((row) => row.role === role) || null;
}

function filledCountForRole(booking, role) {
  return (booking.assignments || []).filter(
    (row) => row.role === role && SLOT_STATUSES.includes(row.status)
  ).length;
}

function openSlotsForRole(booking, role) {
  const requirement = requirementForRole(booking, role);
  if (!requirement) return 0;
  return Math.max(0, requirement.countRequired - filledCountForRole(booking, role));
}

function staffCount(booking) {
  return (booking.crewRequirements || []).reduce((sum, row) => sum + row.countRequired, 0);
}

function allRolesFilled(booking) {
  return (booking.crewRequirements || []).every((row) => openSlotsForRole(booking, row.role) === 0);
}

function crewJobStatus(booking, assignment) {
  if (booking.status === 'cancelled') return 'cancelled';
  if (!assignment) return 'new_request';
  if (assignment.status === 'in_progress') return 'in_progress';
  if (assignment.status === 'completed') return 'completed';
  return 'accepted';
}

function requestStatusLabel(status) {
  switch (status) {
    case 'new_request':
      return 'NEW REQUEST';
    case 'accepted':
      return 'ACCEPTED';
    case 'in_progress':
      return 'IN PROGRESS';
    case 'completed':
      return 'COMPLETED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return String(status).replaceAll('_', ' ').toUpperCase();
  }
}

function formatDuration(hours) {
  const n = Number(hours) || 0;
  const whole = Math.floor(n);
  const minutes = Math.round((n - whole) * 60);
  if (minutes <= 0) return `${whole}h`;
  return `${whole}h ${minutes}m`;
}

function formatDurationFromMs(ms) {
  const totalMinutes = Math.max(0, Math.round(Number(ms) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function mapsUrl(booking) {
  if (booking.venueLatitude != null && booking.venueLongitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${Number(booking.venueLatitude)},${Number(booking.venueLongitude)}`;
  }
  if (booking.venueAddress) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.venueAddress)}`;
  }
  return null;
}

function distanceKm(booking, coords) {
  if (
    coords?.latitude == null ||
    coords?.longitude == null ||
    booking.venueLatitude == null ||
    booking.venueLongitude == null
  ) {
    return null;
  }
  return roundMoney(
    Math.round(
      haversineKm(
        Number(coords.latitude),
        Number(coords.longitude),
        Number(booking.venueLatitude),
        Number(booking.venueLongitude)
      ) * 10
    ) / 10
  );
}

function payForRole(booking, role) {
  const requirement = requirementForRole(booking, role);
  const hours = decimal(booking.expectedDurationHours) || 0;
  const rate = decimal(requirement?.rate) || 0;
  const total = roundMoney(rate);
  return {
    rate,
    hours,
    basePay: total,
    total,
  };
}

function coordsFrom(crew, query = {}) {
  if (query.latitude != null && query.longitude != null) {
    return { latitude: query.latitude, longitude: query.longitude };
  }
  if (crew.currentLatitude != null && crew.currentLongitude != null) {
    return { latitude: Number(crew.currentLatitude), longitude: Number(crew.currentLongitude) };
  }
  return null;
}

function assignmentForCrew(booking, crewId) {
  return (booking.assignments || []).find((row) => row.crewId === crewId) || null;
}

function serializeListItem(booking, { role, coords, assignment = null } = {}) {
  const pay = payForRole(booking, role);
  const eventDate = dateToIsoDate(booking.eventDate);
  const startTime = dateToTimeString(booking.eventStartTime);
  const hours = decimal(booking.expectedDurationHours);
  const status = crewJobStatus(booking, assignment);
  const roleCount = requirementForRole(booking, role)?.countRequired || 0;
  const totalStaff = staffCount(booking);

  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    orderId: booking.bookingReference,
    status,
    bookingStatus: booking.status,
    eventType: booking.eventType,
    role,
    roleLabel: roleLabel(role),
    venueName: booking.venueName,
    venueAddress: booking.venueAddress,
    eventDate,
    eventDateLabel: eventDateLabel(eventDate),
    eventStartTime: startTime,
    eventEndTime: addHoursToTime(startTime, hours),
    expectedDurationHours: hours,
    durationLabel: hours != null ? `${formatHoursLabel(hours)}` : null,
    staffCount: totalStaff,
    roleStaffNeeded: roleCount,
    staffNeededLabel: `${totalStaff} Staff`,
    roleStaffLabel: `${roleCount} ${roleLabel(role, roleCount)}`,
    distanceKm: distanceKm(booking, coords),
    estimatedEarnings: pay.total,
    pay,
  };
}

function formatHoursLabel(hours) {
  const n = Number(hours);
  if (Number.isInteger(n)) return `${n} Hours`;
  return `${n} Hours`;
}

function performanceQuote(rating) {
  if (rating >= 5) return 'Excellent service!';
  if (rating >= 4) return 'Great work.';
  if (rating >= 3) return 'Good job.';
  return null;
}

function serializeDetails(booking, { crew, assignment, coords }) {
  const role = assignment?.role || crew.primaryRole;
  const item = serializeListItem(booking, { role, coords, assignment });
  const pay = item.pay;
  const status = item.status;
  const now = new Date();
  const startedAt = assignment?.shiftStartedAt || null;
  const completedAt = assignment?.shiftCompletedAt || null;
  const windowStart = eventStartInstant(booking.eventDate, booking.eventStartTime);
  const durationMs = (decimal(booking.expectedDurationHours) || 0) * 60 * 60 * 1000;
  const scheduledEndAt =
    (startedAt || windowStart) && durationMs
      ? new Date((startedAt || windowStart).getTime() + durationMs)
      : null;

  let elapsedSeconds = 0;
  let remainingSeconds = 0;
  let progressPercent = 0;
  if (startedAt && status === 'in_progress') {
    elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
    remainingSeconds = scheduledEndAt
      ? Math.max(0, Math.floor((scheduledEndAt.getTime() - now.getTime()) / 1000))
      : 0;
    progressPercent = durationMs
      ? Math.min(100, Math.round((elapsedSeconds * 1000 / durationMs) * 100))
      : 0;
  }
  if (startedAt && completedAt && status === 'completed') {
    elapsedSeconds = Math.max(0, Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000));
    progressPercent = 100;
  }

  const review = (booking.reviews || [])[0] || null;
  const actualDurationLabel =
    startedAt && completedAt
      ? formatDurationFromMs(completedAt.getTime() - startedAt.getTime())
      : formatDuration(booking.expectedDurationHours);

  const canAccept = status === 'new_request' && booking.status === 'confirmed' && crew.isOnline;
  const canReject = status === 'new_request';
  const canStartShift = status === 'accepted' && booking.status !== 'cancelled';
  const canComplete = status === 'in_progress';

  return {
    ...item,
    requestStatusLabel: requestStatusLabel(status),
    assignmentId: assignment?.id || null,
    additionalInstructions: booking.additionalInstructions,
    briefingInstructions: booking.additionalInstructions || DEFAULT_BRIEFING,
    venue: {
      name: booking.venueName,
      address: booking.venueAddress,
      latitude: decimal(booking.venueLatitude),
      longitude: decimal(booking.venueLongitude),
      imageUrl: null,
      mapsUrl: mapsUrl(booking),
    },
    contact: booking.user
      ? {
          name: booking.user.fullName,
          phoneNumber: booking.user.phoneNumber,
          profilePhotoUrl: booking.user.profilePhotoUrl,
          rating: null,
        }
      : null,
    requirements: ROLE_REQUIREMENTS[role] || [],
    payment: {
      rate: pay.rate,
      hours: pay.hours,
      basePay: pay.basePay,
      total: pay.total,
    },
    assignedCrew: (booking.assignments || [])
      .filter((row) => SLOT_STATUSES.includes(row.status))
      .map((row) => ({
        id: row.crew?.id,
        fullName: row.crew?.fullName,
        profilePhotoUrl: row.crew?.profilePhotoUrl,
        role: row.role,
        status: row.status,
      })),
    shift: {
      startedAt,
      completedAt,
      scheduledEndAt,
      elapsedSeconds,
      remainingSeconds,
      progressPercent,
      expectedDurationSeconds: Math.round((decimal(booking.expectedDurationHours) || 0) * 3600),
    },
    payout:
      status === 'completed'
        ? {
            total: decimal(assignment?.earningsAmount) ?? pay.total,
            baseEarnings: pay.basePay,
          }
        : null,
    performance:
      status === 'completed'
        ? {
            rating: review?.rating ?? null,
            quote: review?.rating != null ? performanceQuote(review.rating) : null,
            feedback: review?.reviewText || null,
            clientPhotoUrl: booking.user?.profilePhotoUrl || null,
            durationLabel: actualDurationLabel,
            locationName: booking.venueName,
          }
        : null,
    actions: {
      canAccept,
      canReject,
      canStartShift,
      canVerifyStart: canStartShift,
      canComplete,
      canResendOtp: canStartShift,
    },
    serverNow: now.toISOString(),
  };
}

async function getApprovedCrew(crewId) {
  const crew = await prisma.crewMember.findUnique({ where: { id: crewId } });
  if (!crew || crew.deletedAt) {
    throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
  }
  if (!crew.isActive) {
    throw ApiError.forbidden('This account is suspended', { code: 'ACCOUNT_SUSPENDED' });
  }
  if (crew.verificationStatus !== 'approved') {
    throw ApiError.forbidden('Your profile must be approved before you can take jobs', {
      code: 'NOT_APPROVED',
    });
  }
  return crew;
}

async function loadBooking(bookingId, include = CREW_JOB_INCLUDE) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include,
  });
  if (!booking) throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
  return booking;
}

function assertVisibleToCrew(booking, crew, assignment, rejected) {
  if (assignment) return;
  if (rejected) {
    throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
  }
  if (!OPEN_BOOKING_STATUSES.includes(booking.status) || openSlotsForRole(booking, crew.primaryRole) < 1) {
    throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
  }
}

function availableOnWeekday(crewAvailability, eventDate) {
  if (!crewAvailability?.length) return true;
  const ymd = dateToIsoDate(eventDate);
  if (!ymd) return true;
  const day = dayOfWeekFromYmd(ymd);
  const row = crewAvailability.find((item) => item.dayOfWeek === day);
  if (!row) return true;
  return row.isAvailable !== false;
}

async function excludedBookingIds(crewId) {
  const [rejected, assigned] = await Promise.all([
    prisma.crewJobRejection.findMany({ where: { crewId }, select: { bookingId: true } }),
    prisma.eventCrewAssignment.findMany({ where: { crewId }, select: { bookingId: true } }),
  ]);
  return [...new Set([...rejected, ...assigned].map((row) => row.bookingId))];
}

function isOnTimeOff(timeOffRows, eventDate) {
  if (!eventDate) return false;
  const ymd = dateToIsoDate(eventDate);
  return timeOffRows.some((row) => dateToIsoDate(row.startDate) <= ymd && dateToIsoDate(row.endDate) >= ymd);
}

async function listOpenRequests(crew, { coords } = {}) {
  const excludeIds = await excludedBookingIds(crew.id);
  const [availability, timeOffRows, dateBlocks] = await Promise.all([
    prisma.crewWeeklyAvailability.findMany({ where: { crewId: crew.id } }),
    prisma.crewTimeOff.findMany({ where: { crewId: crew.id }, select: { startDate: true, endDate: true } }),
    prisma.crewDateBlock.findMany({ where: { crewId: crew.id }, select: { blockedDate: true } }),
  ]);
  const blockedDates = new Set(dateBlocks.map((row) => dateToIsoDate(row.blockedDate)));
  const today = parseDateOnly(todayYmd());

  const rows = await prisma.booking.findMany({
    where: {
      status: { in: OPEN_BOOKING_STATUSES },
      eventDate: { gte: today },
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      crewRequirements: { some: { role: crew.primaryRole, countRequired: { gt: 0 } } },
    },
    include: CREW_JOB_INCLUDE,
    orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }],
  });

  const open = [];
  for (const booking of rows) {
    if (openSlotsForRole(booking, crew.primaryRole) < 1) continue;
    if (isOnTimeOff(timeOffRows, booking.eventDate)) continue;
    if (blockedDates.has(dateToIsoDate(booking.eventDate))) continue;
    if (!availableOnWeekday(availability, booking.eventDate)) continue;
    open.push(serializeListItem(booking, { role: crew.primaryRole, coords }));
  }

  if (coords) {
    open.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }
  return open;
}

async function listMine(crew, { tab, coords }) {
  const statusFilter =
    tab === 'active'
      ? ['in_progress']
      : tab === 'completed'
        ? ['completed']
        : UPCOMING_ASSIGNMENT_STATUSES;

  const rows = await prisma.eventCrewAssignment.findMany({
    where: {
      crewId: crew.id,
      status: { in: statusFilter },
      booking: tab === 'completed' ? undefined : { status: { not: 'cancelled' } },
    },
    include: {
      booking: { include: CREW_JOB_INCLUDE },
    },
    orderBy:
      tab === 'completed'
        ? { shiftCompletedAt: 'desc' }
        : { createdAt: 'desc' },
  });

  return rows
    .filter((row) => row.booking)
    .map((row) =>
      serializeListItem(row.booking, { role: row.role, coords, assignment: row })
    );
}

async function todayStats(crewId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await prisma.eventCrewAssignment.findMany({
    where: {
      crewId,
      status: 'completed',
      OR: [
        { shiftCompletedAt: { gte: start, lt: end } },
        { shiftCompletedAt: null, booking: { eventDate: parseDateOnly(todayYmd()) } },
      ],
    },
    include: {
      booking: { select: { expectedDurationHours: true } },
    },
  });

  let earnings = 0;
  let hours = 0;
  for (const row of rows) {
    earnings += Number(row.earningsAmount) || 0;
    if (row.shiftStartedAt && row.shiftCompletedAt) {
      hours += (row.shiftCompletedAt.getTime() - row.shiftStartedAt.getTime()) / 3600000;
    } else {
      hours += Number(row.booking?.expectedDurationHours) || 0;
    }
  }

  return {
    earnings: roundMoney(earnings),
    jobs: rows.length,
    hours: roundMoney(hours),
  };
}

async function activeShift(crew, coords) {
  const row = await prisma.eventCrewAssignment.findFirst({
    where: { crewId: crew.id, status: 'in_progress' },
    include: { booking: { include: CREW_JOB_INCLUDE } },
    orderBy: { shiftStartedAt: 'desc' },
  });
  if (!row?.booking) return null;
  return serializeDetails(row.booking, { crew, assignment: row, coords });
}

class CrewBookingService {
  async getHome(crewId, query = {}) {
    const crew = await getApprovedCrew(crewId);
    const coords = coordsFrom(crew, query);
    const [today, requests, shift] = await Promise.all([
      todayStats(crew.id),
      crew.isOnline ? listOpenRequests(crew, { coords }) : Promise.resolve([]),
      activeShift(crew, coords),
    ]);
    return {
      isOnline: crew.isOnline,
      today,
      requests: requests.slice(0, 50),
      activeShift: shift,
    };
  }

  async list(crewId, query = {}) {
    const crew = await getApprovedCrew(crewId);
    const coords = coordsFrom(crew, query);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const tab = query.tab || 'requests';

    let items;
    if (tab === 'requests') {
      items = crew.isOnline ? await listOpenRequests(crew, { coords }) : [];
    } else {
      items = await listMine(crew, { tab, coords });
    }

    const total = items.length;
    const paged = items.slice((page - 1) * limit, page * limit);
    return { items: paged, meta: paginationMeta({ page, limit, total }) };
  }

  async getById(crewId, bookingId, query = {}) {
    const crew = await getApprovedCrew(crewId);
    const coords = coordsFrom(crew, query);
    const booking = await loadBooking(bookingId);
    const assignment = assignmentForCrew(booking, crew.id);
    const rejected = await prisma.crewJobRejection.findUnique({
      where: { bookingId_crewId: { bookingId, crewId: crew.id } },
      select: { id: true },
    });
    assertVisibleToCrew(booking, crew, assignment, rejected);
    return serializeDetails(booking, { crew, assignment, coords });
  }

  async accept(crewId, bookingId) {
    const crew = await getApprovedCrew(crewId);
    if (!crew.isOnline) {
      throw ApiError.conflict('Go online to accept jobs', { code: 'CREW_OFFLINE' });
    }

    const existing = await prisma.eventCrewAssignment.findUnique({
      where: { bookingId_crewId: { bookingId, crewId } },
    });
    if (existing && SLOT_STATUSES.includes(existing.status)) {
      throw ApiError.conflict('You have already accepted this job', { code: 'JOB_ALREADY_ACCEPTED' });
    }

    const rejected = await prisma.crewJobRejection.findUnique({
      where: { bookingId_crewId: { bookingId, crewId } },
    });
    if (rejected) {
      throw ApiError.conflict('You have already rejected this job', { code: 'JOB_ALREADY_REJECTED' });
    }

    const assignment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          crewRequirements: true,
          assignments: { where: { status: { in: SLOT_STATUSES } } },
        },
      });
      if (!booking) throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
      if (booking.status === 'cancelled') {
        throw ApiError.conflict('This booking was cancelled', { code: 'BOOKING_CANCELLED' });
      }
      if (!OPEN_BOOKING_STATUSES.includes(booking.status)) {
        throw ApiError.conflict('This job is no longer available', { code: 'JOB_NOT_AVAILABLE' });
      }
      if (openSlotsForRole(booking, crew.primaryRole) < 1) {
        throw ApiError.conflict('This job has no remaining slots for your role', { code: 'JOB_FULL' });
      }
      if (booking.eventDate) {
        const off = await tx.crewTimeOff.findFirst({
          where: {
            crewId: crew.id,
            startDate: { lte: booking.eventDate },
            endDate: { gte: booking.eventDate },
          },
          select: { id: true },
        });
        if (off) {
          throw ApiError.conflict('You are marked off on this date', { code: 'DATE_BLOCKED' });
        }
      }

      try {
        const created = await tx.eventCrewAssignment.create({
          data: {
            bookingId: booking.id,
            crewId: crew.id,
            role: crew.primaryRole,
            assignmentMethod: 'self_assigned',
            status: 'confirmed',
          },
        });

        if (booking.eventDate) {
          try {
            await tx.crewDateBlock.create({
              data: {
                crewId: crew.id,
                blockedDate: booking.eventDate,
                eventAssignmentId: created.id,
              },
            });
          } catch (err) {
            if (err?.code === 'P2002') {
              throw ApiError.conflict('You already have a job on this date', { code: 'DATE_BLOCKED' });
            }
            throw err;
          }
        }

        const nextAssignments = [...booking.assignments, created];
        const filled = { ...booking, assignments: nextAssignments };
        if (allRolesFilled(filled) && booking.status === 'confirmed') {
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'crew_assigned' },
          });
        }
        return created;
      } catch (err) {
        if (err?.code === 'P2002') {
          throw ApiError.conflict('You have already accepted this job', { code: 'JOB_ALREADY_ACCEPTED' });
        }
        throw err;
      }
    });

    await activityLogService.record({
      category: 'payment',
      actorType: 'crew',
      actorId: crewId,
      action: 'job_accepted',
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
      metadata: { assignmentId: assignment.id, role: assignment.role },
    });

    return this.getById(crewId, bookingId);
  }

  async reject(crewId, bookingId) {
    const crew = await getApprovedCrew(crewId);
    const existing = await prisma.eventCrewAssignment.findUnique({
      where: { bookingId_crewId: { bookingId, crewId } },
    });
    if (existing && SLOT_STATUSES.includes(existing.status)) {
      throw ApiError.conflict('You have already accepted this job', { code: 'JOB_ALREADY_ACCEPTED' });
    }

    const booking = await loadBooking(bookingId, { crewRequirements: true, assignments: true });
    assertVisibleToCrew(booking, crew, null, false);

    try {
      await prisma.crewJobRejection.create({
        data: { bookingId, crewId },
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw ApiError.conflict('You have already rejected this job', { code: 'JOB_ALREADY_REJECTED' });
      }
      throw err;
    }

    await activityLogService.record({
      category: 'payment',
      actorType: 'crew',
      actorId: crewId,
      action: 'job_rejected',
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
    });

    return { id: bookingId, rejected: true };
  }

  async verifyStart(crewId, bookingId, code) {
    const crew = await getApprovedCrew(crewId);
    const booking = await loadBooking(bookingId);
    const assignment = assignmentForCrew(booking, crew.id);
    if (!assignment || !UPCOMING_ASSIGNMENT_STATUSES.includes(assignment.status)) {
      throw ApiError.conflict('Accept this job before starting your shift', { code: 'SHIFT_NOT_STARTABLE' });
    }
    if (booking.status === 'cancelled') {
      throw ApiError.conflict('This booking was cancelled', { code: 'BOOKING_CANCELLED' });
    }
    if (!booking.shiftOtp || String(code) !== String(booking.shiftOtp)) {
      throw ApiError.badRequest('Incorrect shift code', { code: 'SHIFT_OTP_INVALID' });
    }

    const startedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.eventCrewAssignment.update({
        where: { id: assignment.id },
        data: { status: 'in_progress', shiftStartedAt: startedAt },
      });
      if (booking.status !== 'in_progress') {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'in_progress' },
        });
      }
    });

    await activityLogService.record({
      category: 'payment',
      actorType: 'crew',
      actorId: crewId,
      action: 'shift_started',
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
      metadata: { assignmentId: assignment.id },
    });

    return this.getById(crewId, bookingId);
  }

  async resendShiftOtp(crewId, bookingId) {
    const crew = await getApprovedCrew(crewId);
    const booking = await loadBooking(bookingId);
    const assignment = assignmentForCrew(booking, crew.id);
    if (!assignment || !UPCOMING_ASSIGNMENT_STATUSES.includes(assignment.status)) {
      throw ApiError.conflict('A shift code can only be resent for an accepted job', {
        code: 'SHIFT_NOT_STARTABLE',
      });
    }
    if (booking.status === 'cancelled') {
      throw ApiError.conflict('This booking was cancelled', { code: 'BOOKING_CANCELLED' });
    }

    const shiftOtp = generateOtp(4);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { shiftOtp },
    });

    if (booking.user?.phoneNumber) {
      await smsService.sendOtp(booking.user.phoneNumber, shiftOtp);
    }

    return { sent: true };
  }

  async complete(crewId, bookingId) {
    const crew = await getApprovedCrew(crewId);
    const booking = await loadBooking(bookingId);
    const assignment = assignmentForCrew(booking, crew.id);
    if (!assignment || assignment.status !== 'in_progress') {
      throw ApiError.conflict('Start your shift before completing it', { code: 'SHIFT_NOT_COMPLETABLE' });
    }
    if (booking.status === 'cancelled') {
      throw ApiError.conflict('This booking was cancelled', { code: 'BOOKING_CANCELLED' });
    }

    const pay = payForRole(booking, assignment.role);
    const completedAt = new Date();
    const earningsAmount = pay.total;

    await prisma.$transaction(async (tx) => {
      await tx.eventCrewAssignment.update({
        where: { id: assignment.id },
        data: {
          status: 'completed',
          shiftCompletedAt: completedAt,
          earningsAmount,
        },
      });

      const remaining = await tx.eventCrewAssignment.count({
        where: {
          bookingId: booking.id,
          status: { in: ['assigned', 'confirmed', 'in_progress'] },
        },
      });
      if (remaining === 0) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'completed' },
        });
      }
    });

    await activityLogService.record({
      category: 'crew_earning',
      actorType: 'crew',
      actorId: crewId,
      action: 'shift_completed',
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
      metadata: { assignmentId: assignment.id, earningsAmount },
    });

    return this.getById(crewId, bookingId);
  }
}

export default new CrewBookingService();
