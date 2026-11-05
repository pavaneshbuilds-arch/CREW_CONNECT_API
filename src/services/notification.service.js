import { prisma } from '../config/prisma.js';
import { ROLE_LABELS } from '../config/pricing.js';
import logger from '../utils/logger.js';

const LIVE_ASSIGNMENT_STATUSES = ['assigned', 'confirmed', 'in_progress', 'completed'];
const CANCEL_NOTIFY_STATUSES = ['assigned', 'confirmed', 'in_progress'];
const INSERT_CHUNK = 500;

function dateToIsoDate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function dateToTimeString(date) {
  if (!date) return null;
  if (typeof date === 'string' && /^\d{2}:\d{2}/.test(date)) return date.slice(0, 5);
  return date.toISOString().slice(11, 16);
}

function eventStartInstant(eventDate, eventStartTime) {
  const ymd = dateToIsoDate(eventDate);
  const hm = dateToTimeString(eventStartTime);
  if (!ymd || !hm) return null;
  return new Date(`${ymd}T${hm}:00`);
}

function formatEventDate(eventDate) {
  const ymd = dateToIsoDate(eventDate);
  if (!ymd) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function placeLabel(booking) {
  return booking.venueName || booking.venueAddress || 'the venue';
}

function refLabel(booking) {
  return booking.bookingReference || `#${booking.id}`;
}

function roleLabel(role) {
  return ROLE_LABELS[role]?.singular || role || 'crew';
}

function rupees(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

function notificationRow({
  recipientType,
  recipientId,
  title,
  body,
  type,
  referenceEntityType = null,
  referenceEntityId = null,
  data = null,
}) {
  return {
    recipientType,
    recipientId,
    title: String(title).slice(0, 200),
    body: String(body),
    type,
    referenceEntityType,
    referenceEntityId,
    ...(data ? { data } : {}),
  };
}

async function insertRows(rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await prisma.notification.createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
  }
}

async function alreadyNotified(where) {
  const existing = await prisma.notification.findFirst({ where, select: { id: true } });
  return Boolean(existing);
}

async function safe(action, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error('Failed to record notification', { message: err.message, action });
  }
}

async function scheduleReminders(booking, recipientType, recipientId) {
  const start = eventStartInstant(booking.eventDate, booking.eventStartTime);
  if (!start) return;
  const now = Date.now();
  const plans = [
    { reminderType: 'ONE_DAY_BEFORE', at: new Date(start.getTime() - 24 * 60 * 60 * 1000) },
    { reminderType: 'TWO_HOURS_BEFORE', at: new Date(start.getTime() - 2 * 60 * 60 * 1000) },
  ].filter((plan) => plan.at.getTime() > now);
  if (!plans.length) return;
  await prisma.scheduledReminder.createMany({
    data: plans.map((plan) => ({
      bookingId: booking.id,
      recipientType,
      recipientId,
      reminderType: plan.reminderType,
      scheduledAt: plan.at,
    })),
    skipDuplicates: true,
  });
}

function optionalInt(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function serializeNotification(row) {
  const extra = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    screen: extra.screen ?? null,
    bookingId: optionalInt(extra.bookingId),
    bookingReference: extra.bookingReference ?? null,
    crewId: optionalInt(extra.crewId),
    referenceEntityType: row.referenceEntityType,
    referenceEntityId: row.referenceEntityId,
    createdAt: row.createdAt,
  };
}

class NotificationService {
  async listForRecipient(recipientType, recipientId, query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where = { recipientType, recipientId };
    const [total, rows] = await prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map(serializeNotification),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async onBookingConfirmed(bookingId) {
    await safe('booking_confirmed', async () => {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { crewRequirements: true },
      });
      if (!booking || ['cart', 'created', 'cancelled', 'expired'].includes(booking.status)) return;

      const bookingData = {
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        screen: 'booking_details',
      };
      const userWhere = {
        recipientType: 'user',
        recipientId: booking.userId,
        type: 'booking_confirmed',
        referenceEntityType: 'booking',
        referenceEntityId: booking.id,
      };
      if (!(await alreadyNotified(userWhere))) {
        await insertRows([
          notificationRow({
            ...userWhere,
            title: 'Booking confirmed',
            body: `${refLabel(booking)} at ${placeLabel(booking)} is confirmed. Crew can now accept the job.`,
            data: bookingData,
          }),
        ]);
      }

      await this.#notifyOpenCrew(booking);
      await scheduleReminders(booking, 'user', booking.userId);
    });
  }

  async #notifyOpenCrew(booking) {
    const roles = (booking.crewRequirements || [])
      .filter((row) => row.countRequired > 0)
      .map((row) => row.role);
    if (!roles.length) return;

    const crew = await prisma.crewMember.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        verificationStatus: 'approved',
        primaryRole: { in: roles },
      },
      select: { id: true },
    });
    if (!crew.length) return;

    const ids = crew.map((row) => row.id);
    const unavailable = new Set();
    if (booking.eventDate) {
      const [timeOff, blocks] = await Promise.all([
        prisma.crewTimeOff.findMany({
          where: {
            crewId: { in: ids },
            startDate: { lte: booking.eventDate },
            endDate: { gte: booking.eventDate },
          },
          select: { crewId: true },
        }),
        prisma.crewDateBlock.findMany({
          where: { crewId: { in: ids }, blockedDate: booking.eventDate },
          select: { crewId: true },
        }),
      ]);
      for (const row of [...timeOff, ...blocks]) unavailable.add(row.crewId);
    }

    const existing = await prisma.notification.findMany({
      where: {
        recipientType: 'crew',
        type: 'new_job_request',
        referenceEntityType: 'booking',
        referenceEntityId: booking.id,
        recipientId: { in: ids },
      },
      select: { recipientId: true },
    });
    const seen = new Set(existing.map((row) => row.recipientId));
    const when = formatEventDate(booking.eventDate);
    const body = when
      ? `${booking.eventType || 'Event'} on ${when} at ${placeLabel(booking)}. Open the app to accept.`
      : `${booking.eventType || 'Event'} at ${placeLabel(booking)}. Open the app to accept.`;

    const rows = ids
      .filter((id) => !unavailable.has(id) && !seen.has(id))
      .map((id) =>
        notificationRow({
          recipientType: 'crew',
          recipientId: id,
          title: 'New job request',
          body,
          type: 'new_job_request',
          referenceEntityType: 'booking',
          referenceEntityId: booking.id,
          data: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference,
            screen: 'job_details',
          },
        })
      );
    await insertRows(rows);
  }

  async onJobAccepted(bookingId, crewId) {
    await safe('job_accepted', async () => {
      const [booking, crew] = await Promise.all([
        prisma.booking.findUnique({
          where: { id: bookingId },
          include: {
            crewRequirements: true,
            assignments: { where: { status: { in: LIVE_ASSIGNMENT_STATUSES } } },
          },
        }),
        prisma.crewMember.findUnique({
          where: { id: crewId },
          select: { id: true, fullName: true, primaryRole: true },
        }),
      ]);
      if (!booking || !crew || booking.status === 'cancelled') return;

      const name = crew.fullName || 'A crew member';
      const duplicate = await alreadyNotified({
        recipientType: 'user',
        recipientId: booking.userId,
        type: 'job_accepted',
        referenceEntityType: 'booking',
        referenceEntityId: booking.id,
        data: { path: ['crewId'], equals: crew.id },
      });
      if (!duplicate) {
        await insertRows([
          notificationRow({
            recipientType: 'user',
            recipientId: booking.userId,
            title: 'Crew accepted',
            body: `${name} accepted the ${roleLabel(crew.primaryRole)} slot for ${refLabel(booking)}.`,
            type: 'job_accepted',
            referenceEntityType: 'booking',
            referenceEntityId: booking.id,
            data: {
              bookingId: booking.id,
              bookingReference: booking.bookingReference,
              crewId: crew.id,
              screen: 'booking_details',
            },
          }),
        ]);
      }

      const filled = (booking.crewRequirements || []).every((requirement) => {
        const count = booking.assignments.filter((row) => row.role === requirement.role).length;
        return count >= requirement.countRequired;
      });
      if (filled && booking.crewRequirements.length) {
        const alreadyFull = await alreadyNotified({
          recipientType: 'user',
          recipientId: booking.userId,
          type: 'crew_assigned',
          referenceEntityType: 'booking',
          referenceEntityId: booking.id,
        });
        if (!alreadyFull) {
          await insertRows([
            notificationRow({
              recipientType: 'user',
              recipientId: booking.userId,
              title: 'Crew assigned',
              body: `Every slot for ${refLabel(booking)} is filled.`,
              type: 'crew_assigned',
              referenceEntityType: 'booking',
              referenceEntityId: booking.id,
              data: {
                bookingId: booking.id,
                bookingReference: booking.bookingReference,
                screen: 'booking_details',
              },
            }),
          ]);
        }
      }

      await scheduleReminders(booking, 'crew', crew.id);
    });
  }

  async onAdminAssigned(bookingId, crewId) {
    await this.onJobAccepted(bookingId, crewId);
    await safe('admin_assigned', async () => {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true,
          bookingReference: true,
          eventType: true,
          venueName: true,
          venueAddress: true,
          status: true,
        },
      });
      if (!booking || booking.status === 'cancelled') return;
      const where = {
        recipientType: 'crew',
        recipientId: crewId,
        type: 'crew_assigned',
        referenceEntityType: 'booking',
        referenceEntityId: booking.id,
      };
      if (await alreadyNotified(where)) return;
      await insertRows([
        notificationRow({
          ...where,
          title: 'You are assigned',
          body: `You have been assigned to ${refLabel(booking)} at ${placeLabel(booking)}. The job is already accepted for you.`,
          data: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference,
            screen: 'job_details',
          },
        }),
      ]);
    });
  }

  async onShiftStarted(bookingId, crewId) {
    await safe('shift_started', async () => {
      const [booking, crew] = await Promise.all([
        prisma.booking.findUnique({
          where: { id: bookingId },
          select: { id: true, userId: true, bookingReference: true, status: true },
        }),
        prisma.crewMember.findUnique({
          where: { id: crewId },
          select: { id: true, fullName: true, primaryRole: true },
        }),
      ]);
      if (!booking || !crew || booking.status === 'cancelled') return;
      const duplicate = await alreadyNotified({
        recipientType: 'user',
        recipientId: booking.userId,
        type: 'crew_on_the_way',
        referenceEntityType: 'booking',
        referenceEntityId: booking.id,
        data: { path: ['crewId'], equals: crew.id },
      });
      if (duplicate) return;
      const name = crew.fullName || 'A crew member';
      await insertRows([
        notificationRow({
          recipientType: 'user',
          recipientId: booking.userId,
          title: 'Shift started',
          body: `${name} (${roleLabel(crew.primaryRole)}) started their shift for ${refLabel(booking)}.`,
          type: 'crew_on_the_way',
          referenceEntityType: 'booking',
          referenceEntityId: booking.id,
          data: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference,
            crewId: crew.id,
            screen: 'booking_details',
          },
        }),
      ]);
    });
  }

  async onBookingCompleted(bookingId) {
    await safe('rate_experience', async () => {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, userId: true, bookingReference: true, status: true },
      });
      if (!booking || booking.status !== 'completed') return;
      const duplicate = await alreadyNotified({
        recipientType: 'user',
        recipientId: booking.userId,
        type: 'rate_experience',
        referenceEntityType: 'booking',
        referenceEntityId: booking.id,
      });
      if (duplicate) return;
      await insertRows([
        notificationRow({
          recipientType: 'user',
          recipientId: booking.userId,
          title: 'How was the crew?',
          body: `${refLabel(booking)} is complete. Rate your experience.`,
          type: 'rate_experience',
          referenceEntityType: 'booking',
          referenceEntityId: booking.id,
          data: {
            bookingId: booking.id,
            bookingReference: booking.bookingReference,
            screen: 'booking_details',
          },
        }),
      ]);
    });
  }

  async onBookingCancelled(bookingId) {
    await safe('booking_cancelled', async () => {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          assignments: {
            where: { status: { in: CANCEL_NOTIFY_STATUSES } },
            select: { crewId: true },
          },
        },
      });
      if (!booking) return;

      await prisma.scheduledReminder.updateMany({
        where: { bookingId: booking.id, status: 'pending' },
        data: { status: 'cancelled' },
      });

      const crewIds = [...new Set(booking.assignments.map((row) => row.crewId))];
      if (!crewIds.length) return;
      const existing = await prisma.notification.findMany({
        where: {
          recipientType: 'crew',
          type: 'booking_cancelled',
          referenceEntityType: 'booking',
          referenceEntityId: booking.id,
          recipientId: { in: crewIds },
        },
        select: { recipientId: true },
      });
      const seen = new Set(existing.map((row) => row.recipientId));
      const rows = crewIds
        .filter((id) => !seen.has(id))
        .map((id) =>
          notificationRow({
            recipientType: 'crew',
            recipientId: id,
            title: 'Job cancelled',
            body: `${refLabel(booking)} at ${placeLabel(booking)} was cancelled.`,
            type: 'booking_cancelled',
            referenceEntityType: 'booking',
            referenceEntityId: booking.id,
            data: {
              bookingId: booking.id,
              bookingReference: booking.bookingReference,
              screen: 'job_details',
            },
          })
        );
      await insertRows(rows);
    });
  }

  async onCrewApproved(crewId) {
    await safe('profile_approved', () =>
      this.#profileNotice({
        crewId,
        type: 'profile_approved',
        title: 'Profile approved',
        body: 'You can go online and accept jobs.',
      })
    );
  }

  async onCrewRejected(crewId, reason) {
    await safe('profile_rejected', () =>
      this.#profileNotice({
        crewId,
        type: 'profile_rejected',
        title: 'Profile not approved',
        body: reason || 'Update your details and submit again.',
      })
    );
  }

  async onProfileEditApproved(crewId) {
    await safe('profile_edit_approved', () =>
      this.#profileNotice({
        crewId,
        type: 'profile_approved',
        title: 'Profile update approved',
        body: 'Your requested profile changes are now live.',
      })
    );
  }

  async onProfileEditRejected(crewId, reason) {
    await safe('profile_edit_rejected', () =>
      this.#profileNotice({
        crewId,
        type: 'profile_rejected',
        title: 'Profile update rejected',
        body: reason || 'Your requested profile changes were not approved.',
      })
    );
  }

  async #profileNotice({ crewId, type, title, body }) {
    await insertRows([
      notificationRow({
        recipientType: 'crew',
        recipientId: crewId,
        title,
        body,
        type,
        referenceEntityType: 'crew_member',
        referenceEntityId: crewId,
        data: { crewId, screen: 'profile' },
      }),
    ]);
  }

  async onPayoutSettled({ crewId, bookingId, payoutId, amount, outcome, failureReason }) {
    await safe('payout', async () => {
      if (!crewId || !payoutId) return;
      const typeByOutcome = {
        processed: 'payout_processed',
        failed: 'payout_failed',
        reversed: 'payout_reversed',
      };
      const type = typeByOutcome[outcome];
      if (!type) return;
      const duplicate = await alreadyNotified({
        recipientType: 'crew',
        recipientId: crewId,
        type,
        data: { path: ['payoutId'], equals: payoutId },
      });
      if (duplicate) return;

      const booking = bookingId
        ? await prisma.booking.findUnique({
            where: { id: bookingId },
            select: { id: true, bookingReference: true },
          })
        : null;
      const ref = booking ? refLabel(booking) : 'your job';
      const money = rupees(amount);
      const copy = {
        payout_processed: {
          title: 'Payout sent',
          body: money ? `${money} for ${ref} has been sent to your bank.` : `Your payout for ${ref} has been sent.`,
        },
        payout_failed: {
          title: 'Payout failed',
          body: failureReason
            ? `We could not send the payout for ${ref}. ${failureReason}`
            : `We could not send the payout for ${ref}.`,
        },
        payout_reversed: {
          title: 'Payout reversed',
          body: money ? `${money} for ${ref} was reversed.` : `The payout for ${ref} was reversed.`,
        },
      }[type];

      await insertRows([
        notificationRow({
          recipientType: 'crew',
          recipientId: crewId,
          title: copy.title,
          body: copy.body,
          type,
          referenceEntityType: 'crew_payout',
          referenceEntityId: payoutId,
          data: {
            payoutId,
            bookingId: booking?.id ?? bookingId ?? null,
            bookingReference: booking?.bookingReference ?? null,
            screen: 'earnings',
          },
        }),
      ]);
    });
  }
}

export default new NotificationService();
