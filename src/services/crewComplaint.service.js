import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';

const REASONS = [
  { code: 'customer_not_available', label: 'Customer Not Available' },
  { code: 'payment_issue', label: 'Payment Issue' },
  { code: 'safety_concern', label: 'Safety Concern' },
  { code: 'venue_problem', label: 'Venue Problem' },
  { code: 'other', label: 'Other' },
];

const REASON_LABEL = new Map(REASONS.map((reason) => [reason.code, reason.label]));

const ELIGIBLE_ASSIGNMENT_STATUSES = ['assigned', 'confirmed', 'in_progress', 'completed'];

function dateToIsoDate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function crewFacingStatus(assignmentStatus) {
  if (assignmentStatus === 'in_progress') return 'in_progress';
  if (assignmentStatus === 'completed') return 'completed';
  return 'accepted';
}

async function getCrewOrThrow(crewId) {
  const crew = await prisma.crewMember.findUnique({ where: { id: crewId } });
  if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
  return crew;
}

function eligibleAssignmentWhere(crewId, bookingId) {
  return {
    crewId,
    ...(bookingId ? { bookingId } : {}),
    status: { in: ELIGIBLE_ASSIGNMENT_STATUSES },
    booking: { status: { not: 'cancelled' } },
  };
}

function serializeOrder(row) {
  return {
    bookingId: row.booking.id,
    orderId: row.booking.bookingReference,
    status: crewFacingStatus(row.status),
    eventDate: dateToIsoDate(row.booking.eventDate),
    venueName: row.booking.venueName,
  };
}

function serializeComplaint(row) {
  return {
    id: row.id,
    bookingId: row.bookingId,
    orderId: row.booking.bookingReference,
    venueName: row.booking.venueName,
    eventDate: dateToIsoDate(row.booking.eventDate),
    reason: row.reason,
    reasonLabel: REASON_LABEL.get(row.reason) || row.reason,
    details: row.details,
    imageUrls: row.imageUrls,
    createdAt: row.createdAt,
  };
}

class CrewComplaintService {
  listReasons() {
    return REASONS;
  }

  async listOrders(crewId) {
    await getCrewOrThrow(crewId);
    const rows = await prisma.eventCrewAssignment.findMany({
      where: eligibleAssignmentWhere(crewId),
      include: {
        booking: {
          select: { id: true, bookingReference: true, eventDate: true, venueName: true },
        },
      },
      orderBy: [{ booking: { eventDate: 'desc' } }, { id: 'desc' }],
    });
    return rows.filter((row) => row.booking).map(serializeOrder);
  }

  async create(crewId, data) {
    await getCrewOrThrow(crewId);
    const assignment = await prisma.eventCrewAssignment.findFirst({
      where: eligibleAssignmentWhere(crewId, data.bookingId),
      select: { id: true },
    });
    if (!assignment) {
      throw ApiError.notFound('Order not found', { code: 'ORDER_NOT_FOUND' });
    }

    const row = await prisma.crewComplaint.create({
      data: {
        crewId,
        bookingId: data.bookingId,
        reason: data.reason,
        details: data.details,
        imageUrls: data.imageUrls || [],
      },
      include: {
        booking: { select: { bookingReference: true, venueName: true, eventDate: true } },
      },
    });
    return serializeComplaint(row);
  }

  async list(crewId) {
    await getCrewOrThrow(crewId);
    const rows = await prisma.crewComplaint.findMany({
      where: { crewId },
      include: {
        booking: { select: { bookingReference: true, venueName: true, eventDate: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serializeComplaint);
  }
}

export default new CrewComplaintService();
