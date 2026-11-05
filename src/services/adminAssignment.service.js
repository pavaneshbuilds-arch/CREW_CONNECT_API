import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';
import { activityLogService, notificationService } from './index.js';
import { createConfirmedAssignment, openSlotsForRole } from './crewBooking.service.js';

const ASSIGNABLE_BOOKING_STATUSES = ['confirmed', 'crew_assigned', 'in_progress'];
const NO_SHOW_FROM = ['assigned', 'confirmed'];

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function assertAssignableBooking(booking) {
  if (!booking) throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });
  if (!ASSIGNABLE_BOOKING_STATUSES.includes(booking.status)) {
    throw ApiError.conflict('Crew can only be changed on a confirmed, staffed, or in-progress booking', {
      code: 'BOOKING_NOT_ASSIGNABLE',
    });
  }
}

async function countsForCrew(crewIds) {
  if (!crewIds.length) return { noShows: new Map(), replacements: new Map() };
  const [noShows, replacements] = await Promise.all([
    prisma.eventCrewAssignment.groupBy({
      by: ['crewId'],
      where: { crewId: { in: crewIds }, status: 'no_show' },
      _count: { _all: true },
    }),
    prisma.eventCrewAssignment.groupBy({
      by: ['crewId'],
      where: { crewId: { in: crewIds }, assignmentMethod: 'replacement' },
      _count: { _all: true },
    }),
  ]);
  return {
    noShows: new Map(noShows.map((row) => [row.crewId, row._count._all])),
    replacements: new Map(replacements.map((row) => [row.crewId, row._count._all])),
  };
}

class AdminAssignmentService {
  async listAvailable(bookingId, query) {
    const { role, search, page, limit } = query;
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    assertAssignableBooking(booking);

    const where = {
      deletedAt: null,
      isActive: true,
      verificationStatus: 'approved',
      primaryRole: role,
      AND: [{ NOT: { assignments: { some: { bookingId } } } }],
    };
    if (booking.eventDate) {
      where.AND.push(
        {
          NOT: {
            timeOff: {
              some: {
                startDate: { lte: booking.eventDate },
                endDate: { gte: booking.eventDate },
              },
            },
          },
        },
        { NOT: { dateBlocks: { some: { blockedDate: booking.eventDate } } } }
      );
    }
    if (search) {
      where.AND.push({
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phoneNumber: { contains: search } },
        ],
      });
    }

    const [total, rows] = await Promise.all([
      prisma.crewMember.count({ where }),
      prisma.crewMember.findMany({
        where,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          city: true,
          primaryRole: true,
          profilePhotoUrl: true,
          ratingAvg: true,
        },
      }),
    ]);

    const counts = await countsForCrew(rows.map((row) => row.id));
    return {
      items: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        city: row.city,
        primaryRole: row.primaryRole,
        profilePhotoUrl: row.profilePhotoUrl,
        ratingAvg: decimal(row.ratingAvg),
        noShowCount: counts.noShows.get(row.id) || 0,
        replacementCount: counts.replacements.get(row.id) || 0,
      })),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async markNoShow(bookingId, assignmentId, adminId) {
    const assignment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { crewRequirements: true, assignments: true },
      });
      assertAssignableBooking(booking);

      const current = booking.assignments.find((row) => row.id === assignmentId);
      if (!current) {
        throw ApiError.notFound('Assignment not found', { code: 'ASSIGNMENT_NOT_FOUND' });
      }
      if (!NO_SHOW_FROM.includes(current.status)) {
        throw ApiError.conflict('Only a crew member who has not started the shift can be marked as a no-show', {
          code: 'NO_SHOW_NOT_ALLOWED',
        });
      }

      if (current.role === 'supervisor') {
        await tx.eventCrewAssignment.updateMany({
          where: { reportsToAssignmentId: current.id },
          data: { reportsToAssignmentId: null },
        });
        await tx.bookingSupervisorSlot.updateMany({
          where: { supervisorAssignmentId: current.id },
          data: { supervisorAssignmentId: null },
        });
      }

      // Keep the no-show's date block so they cannot take another job that day.
      await tx.eventCrewAssignment.update({
        where: { id: current.id },
        data: { status: 'no_show' },
      });

      const nextAssignments = booking.assignments.map((row) =>
        row.id === current.id ? { ...row, status: 'no_show' } : row
      );
      const nextBooking = { ...booking, assignments: nextAssignments };
      const hasOpenSlot = (booking.crewRequirements || []).some(
        (requirement) => openSlotsForRole(nextBooking, requirement.role) > 0
      );
      if (booking.status === 'crew_assigned' && hasOpenSlot) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'confirmed' },
        });
      }

      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType: 'crew_marked_no_show',
          targetEntityType: 'event_crew_assignment',
          targetEntityId: current.id,
          details: {
            bookingId: booking.id,
            crewId: current.crewId,
            role: current.role,
          },
        },
      });

      return current;
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'crew_marked_no_show',
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
      metadata: { assignmentId: assignment.id, crewId: assignment.crewId, role: assignment.role },
    });

    return { assignmentId: assignment.id, crewId: assignment.crewId };
  }

  async assign(bookingId, adminId, { crewId, role, replacesAssignmentId = null }) {
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { crewRequirements: true, assignments: true },
      });
      assertAssignableBooking(booking);

      const crew = await tx.crewMember.findUnique({ where: { id: crewId } });
      if (!crew || crew.deletedAt) {
        throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
      }
      if (!crew.isActive) {
        throw ApiError.conflict('This crew account is suspended', { code: 'ACCOUNT_SUSPENDED' });
      }
      if (crew.verificationStatus !== 'approved') {
        throw ApiError.conflict('Only an approved crew member can be assigned', { code: 'NOT_APPROVED' });
      }
      if (crew.primaryRole !== role) {
        throw ApiError.badRequest('This crew member does not work that role', { code: 'ROLE_MISMATCH' });
      }
      if (booking.assignments.some((row) => row.crewId === crew.id)) {
        throw ApiError.conflict('This crew member is already on the booking', { code: 'CREW_ALREADY_ASSIGNED' });
      }

      if (replacesAssignmentId) {
        const target = booking.assignments.find((row) => row.id === replacesAssignmentId);
        if (!target) {
          throw ApiError.notFound('No-show assignment not found', { code: 'ASSIGNMENT_NOT_FOUND' });
        }
        if (target.status !== 'no_show') {
          throw ApiError.conflict('A replacement can only fill a no-show', { code: 'NOT_A_NO_SHOW' });
        }
        if (target.role !== role) {
          throw ApiError.conflict('The replacement must be the same role as the no-show', { code: 'ROLE_MISMATCH' });
        }
        if (booking.assignments.some((row) => row.replacesAssignmentId === replacesAssignmentId)) {
          throw ApiError.conflict('This no-show already has a replacement', { code: 'ALREADY_REPLACED' });
        }
      }

      if (openSlotsForRole(booking, role) < 1) {
        throw ApiError.conflict('This role has no open paid slots', { code: 'JOB_FULL' });
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
          throw ApiError.conflict('This crew member is marked off on the event date', { code: 'DATE_BLOCKED' });
        }
      }

      const created = await createConfirmedAssignment(tx, {
        booking,
        crewId: crew.id,
        role,
        assignmentMethod: replacesAssignmentId ? 'replacement' : 'admin_assigned',
        assignedByAdminId: adminId,
        replacesAssignmentId,
        duplicateMessage: 'This crew member is already on the booking',
        duplicateCode: 'CREW_ALREADY_ASSIGNED',
        dateBlockedMessage: 'This crew member already has a job on this date',
      });

      const actionType = replacesAssignmentId ? 'crew_reassigned' : 'crew_assigned_manually';
      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType,
          targetEntityType: 'event_crew_assignment',
          targetEntityId: created.id,
          details: {
            bookingId,
            crewId,
            role,
            replacesAssignmentId,
          },
        },
      });
      return created;
    });

    const actionType = replacesAssignmentId ? 'crew_reassigned' : 'crew_assigned_manually';

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: actionType,
      referenceEntityType: 'booking',
      referenceEntityId: bookingId,
      metadata: { assignmentId: created.id, crewId, role, replacesAssignmentId },
    });

    await notificationService.onAdminAssigned(bookingId, crewId);

    return { assignmentId: created.id, crewId, role, assignmentMethod: created.assignmentMethod };
  }
}

export default new AdminAssignmentService();
