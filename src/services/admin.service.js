import bcrypt from 'bcryptjs';

import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';
import { decrypt, encrypt, maskTail } from '../utils/crypto.js';
import { activityLogService } from './index.js';

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function dateToIsoDate(date) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function dateToTimeString(date) {
  if (!date) return null;
  return date.toISOString().slice(11, 16);
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function safeDecrypt(value) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return null;
  }
}

const PERSONAL_KEYS = [
  'fullName',
  'email',
  'profilePhotoUrl',
  'dateOfBirth',
  'gender',
  'city',
  'currentAddress',
];
const WORK_KEYS = ['primaryRole', 'yearsOfExperience', 'languages', 'skills'];
const IDENTITY_KEYS = ['aadhaarNumber', 'aadhaarFrontUrl', 'aadhaarBackUrl', 'panNumber', 'panCardUrl'];
const BANK_KEYS = ['accountHolderName', 'accountNumber', 'ifscCode', 'upiId'];

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out;
}

function flattenChangedFields(changedFields) {
  const raw = changedFields && typeof changedFields === 'object' ? changedFields : {};
  return {
    personal: { ...pick(raw, PERSONAL_KEYS), ...(raw.personal || raw.personalInfo || {}) },
    work: { ...pick(raw, WORK_KEYS), ...(raw.work || raw.workProfile || {}) },
    identity: { ...pick(raw, IDENTITY_KEYS), ...(raw.identity || raw.identityDocuments || {}) },
    bank: { ...pick(raw, BANK_KEYS), ...(raw.bank || raw.bankDetails || {}) },
  };
}

function serializeCrewListItem(crew) {
  return {
    id: crew.id,
    fullName: crew.fullName,
    phoneNumber: crew.phoneNumber,
    email: crew.email,
    profilePhotoUrl: crew.profilePhotoUrl,
    city: crew.city,
    primaryRole: crew.primaryRole,
    yearsOfExperience: crew.yearsOfExperience,
    verificationStatus: crew.verificationStatus,
    submittedAt: crew.submittedAt,
    rejectionReason: crew.rejectionReason,
    ratingAvg: decimal(crew.ratingAvg),
    isActive: crew.isActive,
    isOnline: crew.isOnline,
    createdAt: crew.createdAt,
    updatedAt: crew.updatedAt,
  };
}

function serializeCrewDetail(crew) {
  const doc = crew.identityDocuments?.[0];
  const bank = crew.bankDetails?.[0];
  const aadhaar = safeDecrypt(doc?.aadhaarNumber);
  const pan = safeDecrypt(doc?.panNumber);
  const accountNumber = safeDecrypt(bank?.accountNumber);

  return {
    ...serializeCrewListItem(crew),
    dateOfBirth: dateToIsoDate(crew.dateOfBirth),
    gender: crew.gender,
    currentAddress: crew.currentAddress,
    currentLatitude: decimal(crew.currentLatitude),
    currentLongitude: decimal(crew.currentLongitude),
    languages: (crew.languages || []).map((l) => l.language),
    skills: (crew.skills || []).map((s) => s.skill),
    identityDocuments: doc
      ? {
          aadhaarMasked: aadhaar ? maskTail(aadhaar, 4) : null,
          aadhaarFrontUrl: doc.aadhaarFrontUrl,
          aadhaarBackUrl: doc.aadhaarBackUrl,
          panMasked: pan ? maskTail(pan, 4) : null,
          panCardUrl: doc.panCardUrl,
          verifiedByAdminId: doc.verifiedByAdminId,
          verifiedAt: doc.verifiedAt,
        }
      : null,
    bankDetails: bank
      ? {
          accountHolderName: bank.accountHolderName,
          accountNumberMasked: accountNumber ? maskTail(accountNumber, 4) : null,
          ifscCode: bank.ifscCode,
          upiId: bank.upiId,
        }
      : null,
    availability: (crew.weeklyAvailability || []).map((d) => ({
      dayOfWeek: d.dayOfWeek,
      isAvailable: d.isAvailable,
      shiftStart: dateToTimeString(d.shiftStart),
      shiftEnd: dateToTimeString(d.shiftEnd),
    })),
    timeOff: (crew.timeOff || []).map((t) => ({
      id: t.id,
      startDate: dateToIsoDate(t.startDate),
      endDate: dateToIsoDate(t.endDate),
      reason: t.reason,
    })),
    pendingEditRequests: (crew.profileEditRequests || []).length,
    assignmentCount: crew._count?.assignments ?? 0,
  };
}

function serializeBooking(booking) {
  const assigned = (booking.assignments || []).filter((a) =>
    ['assigned', 'confirmed', 'in_progress', 'completed'].includes(a.status)
  ).length;
  const required = (booking.crewRequirements || []).reduce((sum, r) => sum + r.countRequired, 0);

  return {
    id: booking.id,
    bookingReference: booking.bookingReference,
    status: booking.status,
    eventType: booking.eventType,
    guestCount: booking.guestCount,
    eventDate: dateToIsoDate(booking.eventDate),
    eventStartTime: dateToTimeString(booking.eventStartTime),
    expectedDurationHours: decimal(booking.expectedDurationHours),
    venueName: booking.venueName,
    venueAddress: booking.venueAddress,
    estimatedTotal: decimal(booking.estimatedTotal),
    createdAt: booking.createdAt,
    user: booking.user
      ? {
          id: booking.user.id,
          fullName: booking.user.fullName,
          phoneNumber: booking.user.phoneNumber,
          email: booking.user.email,
        }
      : null,
    crewRequired: required,
    crewAssigned: assigned,
  };
}

class AdminService {
  async getMe(adminId) {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    });
    if (!admin || !admin.isActive) {
      throw ApiError.unauthorized('Admin account is not active', { code: 'ACCOUNT_INACTIVE' });
    }
    return { ...admin, type: 'admin' };
  }

  async dashboard() {
    const [
      users,
      crew,
      pendingCrew,
      onboardingCrew,
      approvedCrew,
      rejectedCrew,
      onlineCrew,
      pendingEdits,
      bookings,
      bookingsByStatus,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.crewMember.count({ where: { deletedAt: null } }),
      prisma.crewMember.count({
        where: { deletedAt: null, verificationStatus: 'pending', submittedAt: { not: null } },
      }),
      prisma.crewMember.count({
        where: { deletedAt: null, verificationStatus: 'pending', submittedAt: null },
      }),
      prisma.crewMember.count({ where: { deletedAt: null, verificationStatus: 'approved' } }),
      prisma.crewMember.count({ where: { deletedAt: null, verificationStatus: 'rejected' } }),
      prisma.crewMember.count({ where: { deletedAt: null, isOnline: true, isActive: true } }),
      prisma.crewProfileEditRequest.count({ where: { status: 'pending' } }),
      prisma.booking.count(),
      prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const bookingStatus = Object.fromEntries(bookingsByStatus.map((row) => [row.status, row._count._all]));

    return {
      users: { total: users },
      crew: {
        total: crew,
        pending: pendingCrew,
        onboarding: onboardingCrew,
        approved: approvedCrew,
        rejected: rejectedCrew,
        online: onlineCrew,
      },
      editRequests: { pending: pendingEdits },
      bookings: { total: bookings, byStatus: bookingStatus },
    };
  }

  async listCrew(query) {
    const { page, limit, search, verificationStatus, primaryRole, isActive, isOnline, ready } = query;
    const where = { deletedAt: null };

    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (primaryRole) where.primaryRole = primaryRole;
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (typeof isOnline === 'boolean') where.isOnline = isOnline;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (ready) {
      // Only profiles the crew explicitly submitted after completing signup.
      where.submittedAt = { not: null };
    }

    const [total, rows] = await Promise.all([
      prisma.crewMember.count({ where }),
      prisma.crewMember.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items: rows.map(serializeCrewListItem), meta: paginationMeta({ page, limit, total }) };
  }

  async getCrew(id) {
    const crew = await prisma.crewMember.findUnique({
      where: { id },
      include: {
        languages: true,
        skills: true,
        identityDocuments: true,
        bankDetails: true,
        weeklyAvailability: { orderBy: { dayOfWeek: 'asc' } },
        timeOff: { orderBy: { startDate: 'asc' } },
        profileEditRequests: { where: { status: 'pending' }, select: { id: true } },
        _count: { select: { assignments: true } },
      },
    });
    if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
    return serializeCrewDetail(crew);
  }

  async approveCrew(id, adminId) {
    const crew = await prisma.crewMember.findUnique({
      where: { id },
      include: { identityDocuments: true },
    });
    if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
    if (!crew.submittedAt) {
      throw ApiError.badRequest('This crew has not finished signup or submitted for review', {
        code: 'NOT_SUBMITTED',
      });
    }
    if (crew.verificationStatus === 'approved') {
      throw ApiError.conflict('Crew is already approved', { code: 'ALREADY_APPROVED' });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.crewMember.update({
        where: { id },
        data: { verificationStatus: 'approved', rejectionReason: null },
      });

      const doc = crew.identityDocuments[0];
      if (doc) {
        await tx.crewIdentityDocument.update({
          where: { id: doc.id },
          data: { verifiedByAdminId: adminId, verifiedAt: now },
        });
      }

      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType: 'crew_verified',
          targetEntityType: 'crew_member',
          targetEntityId: id,
          details: { previousStatus: crew.verificationStatus },
        },
      });
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'crew_verified',
      referenceEntityType: 'crew_member',
      referenceEntityId: id,
    });

    return this.getCrew(id);
  }

  async rejectCrew(id, adminId, reason) {
    const crew = await prisma.crewMember.findUnique({ where: { id } });
    if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });
    if (crew.verificationStatus === 'approved') {
      throw ApiError.conflict('Approved crew cannot be rejected; deactivate the account instead', {
        code: 'ALREADY_APPROVED',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.crewMember.update({
        where: { id },
        data: { verificationStatus: 'rejected', rejectionReason: reason },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType: 'crew_rejected',
          targetEntityType: 'crew_member',
          targetEntityId: id,
          details: { reason },
        },
      });
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'crew_rejected',
      referenceEntityType: 'crew_member',
      referenceEntityId: id,
      metadata: { reason },
    });

    return this.getCrew(id);
  }

  async setCrewActive(id, adminId, isActive) {
    const crew = await prisma.crewMember.findUnique({ where: { id } });
    if (!crew || crew.deletedAt) throw ApiError.notFound('Crew profile not found', { code: 'CREW_NOT_FOUND' });

    await prisma.crewMember.update({
      where: { id },
      data: { isActive, isOnline: isActive ? crew.isOnline : false },
    });

    await prisma.adminAuditLog.create({
      data: {
        adminId,
        actionType: 'other',
        targetEntityType: 'crew_member',
        targetEntityId: id,
        details: { isActive },
      },
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: isActive ? 'crew_activated' : 'crew_suspended',
      referenceEntityType: 'crew_member',
      referenceEntityId: id,
    });

    return this.getCrew(id);
  }

  async listEditRequests(query) {
    const { page, limit, status, crewId } = query;
    const where = {};
    if (status) where.status = status;
    if (crewId) where.crewId = crewId;

    const [total, rows] = await Promise.all([
      prisma.crewProfileEditRequest.count({ where }),
      prisma.crewProfileEditRequest.findMany({
        where,
        include: {
          crew: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
              profilePhotoUrl: true,
              primaryRole: true,
              verificationStatus: true,
            },
          },
          reviewedByAdmin: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        crewId: r.crewId,
        status: r.status,
        changedFields: r.changedFields,
        reviewedByAdminId: r.reviewedByAdminId,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        crew: r.crew,
        reviewedByAdmin: r.reviewedByAdmin,
      })),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async getEditRequest(id) {
    const request = await prisma.crewProfileEditRequest.findUnique({
      where: { id },
      include: {
        crew: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            email: true,
            profilePhotoUrl: true,
            primaryRole: true,
            city: true,
            verificationStatus: true,
          },
        },
        reviewedByAdmin: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!request) throw ApiError.notFound('Edit request not found', { code: 'EDIT_REQUEST_NOT_FOUND' });
    return {
      id: request.id,
      crewId: request.crewId,
      status: request.status,
      changedFields: request.changedFields,
      reviewedByAdminId: request.reviewedByAdminId,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
      crew: request.crew,
      reviewedByAdmin: request.reviewedByAdmin,
    };
  }

  async #applyChangedFields(tx, crewId, changedFields) {
    const { personal, work, identity, bank } = flattenChangedFields(changedFields);

    const crewData = {};
    if (personal.fullName !== undefined) crewData.fullName = personal.fullName;
    if (personal.email !== undefined) crewData.email = personal.email || null;
    if (personal.profilePhotoUrl !== undefined) crewData.profilePhotoUrl = personal.profilePhotoUrl || null;
    if (personal.dateOfBirth !== undefined) crewData.dateOfBirth = personal.dateOfBirth ? new Date(personal.dateOfBirth) : null;
    if (personal.gender !== undefined) crewData.gender = personal.gender;
    if (personal.city !== undefined) crewData.city = personal.city;
    if (personal.currentAddress !== undefined) crewData.currentAddress = personal.currentAddress;
    if (work.primaryRole !== undefined) crewData.primaryRole = work.primaryRole;
    if (work.yearsOfExperience !== undefined) crewData.yearsOfExperience = work.yearsOfExperience;

    if (Object.keys(crewData).length) {
      await tx.crewMember.update({ where: { id: crewId }, data: crewData });
    }

    if (work.languages) {
      await tx.crewLanguage.deleteMany({ where: { crewId } });
      if (work.languages.length) {
        await tx.crewLanguage.createMany({
          data: work.languages.map((language) => ({ crewId, language })),
        });
      }
    }

    if (work.skills) {
      await tx.crewSkill.deleteMany({ where: { crewId } });
      if (work.skills.length) {
        await tx.crewSkill.createMany({ data: work.skills.map((skill) => ({ crewId, skill })) });
      }
    }

    if (Object.keys(identity).length) {
      const payload = {};
      if (identity.aadhaarNumber !== undefined) payload.aadhaarNumber = encrypt(identity.aadhaarNumber);
      if (identity.aadhaarFrontUrl !== undefined) payload.aadhaarFrontUrl = identity.aadhaarFrontUrl;
      if (identity.aadhaarBackUrl !== undefined) payload.aadhaarBackUrl = identity.aadhaarBackUrl;
      if (identity.panNumber !== undefined) payload.panNumber = encrypt(identity.panNumber);
      if (identity.panCardUrl !== undefined) payload.panCardUrl = identity.panCardUrl;

      const existing = await tx.crewIdentityDocument.findFirst({ where: { crewId } });
      if (existing) await tx.crewIdentityDocument.update({ where: { id: existing.id }, data: payload });
      else await tx.crewIdentityDocument.create({ data: { crewId, ...payload } });
    }

    if (Object.keys(bank).length) {
      const payload = {};
      if (bank.accountHolderName !== undefined) payload.accountHolderName = bank.accountHolderName;
      if (bank.accountNumber !== undefined) payload.accountNumber = encrypt(bank.accountNumber);
      if (bank.ifscCode !== undefined) payload.ifscCode = bank.ifscCode;
      if (bank.upiId !== undefined) payload.upiId = bank.upiId || null;

      const existing = await tx.crewBankDetail.findFirst({ where: { crewId } });
      if (existing) await tx.crewBankDetail.update({ where: { id: existing.id }, data: payload });
      else await tx.crewBankDetail.create({ data: { crewId, ...payload } });
    }
  }

  async approveEditRequest(id, adminId) {
    const request = await prisma.crewProfileEditRequest.findUnique({ where: { id } });
    if (!request) throw ApiError.notFound('Edit request not found', { code: 'EDIT_REQUEST_NOT_FOUND' });
    if (request.status !== 'pending') {
      throw ApiError.conflict('Edit request has already been reviewed', { code: 'ALREADY_REVIEWED' });
    }

    await prisma.$transaction(async (tx) => {
      await this.#applyChangedFields(tx, request.crewId, request.changedFields);
      await tx.crewProfileEditRequest.update({
        where: { id },
        data: { status: 'approved', reviewedByAdminId: adminId, reviewedAt: new Date() },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType: 'profile_edit_approved',
          targetEntityType: 'crew_profile_edit_request',
          targetEntityId: id,
          details: { crewId: request.crewId, changedFields: request.changedFields },
        },
      });
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'profile_edit_approved',
      referenceEntityType: 'crew_profile_edit_request',
      referenceEntityId: id,
      metadata: { crewId: request.crewId },
    });

    return this.getEditRequest(id);
  }

  async rejectEditRequest(id, adminId, reason) {
    const request = await prisma.crewProfileEditRequest.findUnique({ where: { id } });
    if (!request) throw ApiError.notFound('Edit request not found', { code: 'EDIT_REQUEST_NOT_FOUND' });
    if (request.status !== 'pending') {
      throw ApiError.conflict('Edit request has already been reviewed', { code: 'ALREADY_REVIEWED' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.crewProfileEditRequest.update({
        where: { id },
        data: { status: 'rejected', reviewedByAdminId: adminId, reviewedAt: new Date() },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType: 'profile_edit_rejected',
          targetEntityType: 'crew_profile_edit_request',
          targetEntityId: id,
          details: { crewId: request.crewId, reason: reason || null },
        },
      });
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'profile_edit_rejected',
      referenceEntityType: 'crew_profile_edit_request',
      referenceEntityId: id,
      metadata: { crewId: request.crewId, reason },
    });

    return this.getEditRequest(id);
  }

  async listUsers(query) {
    const { page, limit, search, isActive } = query;
    const where = { deletedAt: null };
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { _count: { select: { bookings: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        phoneNumber: u.phoneNumber,
        email: u.email,
        profilePhotoUrl: u.profilePhotoUrl,
        authProvider: u.authProvider,
        isActive: u.isActive,
        bookingCount: u._count.bookings,
        createdAt: u.createdAt,
      })),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async getUser(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: { createdAt: 'desc' } },
        _count: { select: { bookings: true, reviews: true } },
      },
    });
    if (!user || user.deletedAt) throw ApiError.notFound('User not found', { code: 'USER_NOT_FOUND' });

    return {
      id: user.id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      email: user.email,
      profilePhotoUrl: user.profilePhotoUrl,
      authProvider: user.authProvider,
      isActive: user.isActive,
      locationAccessEnabled: user.locationAccessEnabled,
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      marketingOptIn: user.marketingOptIn,
      bookingCount: user._count.bookings,
      reviewCount: user._count.reviews,
      createdAt: user.createdAt,
      addresses: user.addresses.map((a) => ({
        id: a.id,
        houseFlatNumber: a.houseFlatNumber,
        pincode: a.pincode,
        apartmentBuilding: a.apartmentBuilding,
        contactNumber: a.contactNumber,
        floorNumber: a.floorNumber,
        landmark: a.landmark,
        addressType: a.addressType,
        latitude: decimal(a.latitude),
        longitude: decimal(a.longitude),
        isDefault: a.isDefault,
      })),
    };
  }

  async setUserActive(id, adminId, isActive) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw ApiError.notFound('User not found', { code: 'USER_NOT_FOUND' });

    await prisma.user.update({ where: { id }, data: { isActive } });
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        actionType: 'other',
        targetEntityType: 'user',
        targetEntityId: id,
        details: { isActive },
      },
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: isActive ? 'user_activated' : 'user_suspended',
      referenceEntityType: 'user',
      referenceEntityId: id,
    });

    return this.getUser(id);
  }

  async listBookings(query) {
    const { page, limit, search, status, eventDateFrom, eventDateTo } = query;
    const where = {};
    if (status) where.status = status;
    if (eventDateFrom || eventDateTo) {
      where.eventDate = {};
      if (eventDateFrom) where.eventDate.gte = new Date(eventDateFrom);
      if (eventDateTo) where.eventDate.lte = new Date(eventDateTo);
    }
    if (search) {
      where.OR = [
        { bookingReference: { contains: search, mode: 'insensitive' } },
        { venueName: { contains: search, mode: 'insensitive' } },
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { user: { phoneNumber: { contains: search } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, phoneNumber: true, email: true } },
          crewRequirements: true,
          assignments: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items: rows.map(serializeBooking), meta: paginationMeta({ page, limit, total }) };
  }

  async getBooking(id) {
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, phoneNumber: true, email: true, profilePhotoUrl: true } },
        crewRequirements: true,
        assignments: {
          include: {
            crew: {
              select: {
                id: true,
                fullName: true,
                phoneNumber: true,
                profilePhotoUrl: true,
                primaryRole: true,
              },
            },
            assignedByAdmin: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        refunds: { orderBy: { createdAt: 'desc' } },
        coupon: true,
      },
    });
    if (!booking) throw ApiError.notFound('Booking not found', { code: 'BOOKING_NOT_FOUND' });

    return {
      ...serializeBooking(booking),
      foodServiceType: booking.foodServiceType,
      foodItemsCount: booking.foodItemsCount,
      additionalInstructions: booking.additionalInstructions,
      venueLatitude: decimal(booking.venueLatitude),
      venueLongitude: decimal(booking.venueLongitude),
      subtotal: decimal(booking.subtotal),
      gstAmount: decimal(booking.gstAmount),
      discountAmount: decimal(booking.discountAmount),
      coupon: booking.coupon
        ? {
            id: booking.coupon.id,
            code: booking.coupon.code,
            discountType: booking.coupon.discountType,
            discountValue: decimal(booking.coupon.discountValue),
          }
        : null,
      advancePaidPct: decimal(booking.advancePaidPct),
      cancelledAt: booking.cancelledAt,
      cancellationReason: booking.cancellationReason,
      crewRequirements: booking.crewRequirements.map((r) => {
        const rate = decimal(r.rate);
        const countRequired = r.countRequired;
        return {
          id: r.id,
          role: r.role,
          countRequired,
          rate,
          amount: rate == null ? null : Math.round((countRequired * rate + Number.EPSILON) * 100) / 100,
        };
      }),
      assignments: booking.assignments.map((a) => ({
        id: a.id,
        crewId: a.crewId,
        role: a.role,
        assignmentMethod: a.assignmentMethod,
        status: a.status,
        earningsAmount: decimal(a.earningsAmount),
        performanceBonus: decimal(a.performanceBonus),
        shiftStartedAt: a.shiftStartedAt,
        shiftCompletedAt: a.shiftCompletedAt,
        createdAt: a.createdAt,
        crew: a.crew,
        assignedByAdmin: a.assignedByAdmin,
      })),
      payments: booking.payments.map((p) => ({
        id: p.id,
        paymentType: p.paymentType,
        amount: decimal(p.amount),
        status: p.status,
        paymentGatewayRef: p.paymentGatewayRef,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      refunds: booking.refunds.map((r) => ({
        id: r.id,
        paymentId: r.paymentId,
        refundAmount: decimal(r.refundAmount),
        refundPctApplied: decimal(r.refundPctApplied),
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  async listAuditLogs(query) {
    const { page, limit, actionType, adminId } = query;
    const where = {};
    if (actionType) where.actionType = actionType;
    if (adminId) where.adminId = adminId;

    const [total, rows] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({
        where,
        include: { admin: { select: { id: true, fullName: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        adminId: row.adminId,
        actionType: row.actionType,
        targetEntityType: row.targetEntityType,
        targetEntityId: row.targetEntityId,
        details: row.details,
        createdAt: row.createdAt,
        admin: row.admin,
      })),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async listActivityLogs(query) {
    const { page, limit, category, monthBucket, actorType } = query;
    const where = {};
    if (category) where.category = category;
    if (monthBucket) where.monthBucket = monthBucket;
    if (actorType) where.actorType = actorType;

    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        category: row.category,
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        referenceEntityType: row.referenceEntityType,
        referenceEntityId: row.referenceEntityId,
        metadata: row.metadata,
        monthBucket: row.monthBucket,
        createdAt: row.createdAt,
      })),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async listAdmins(query) {
    const { page, limit, search, isActive } = query;
    const where = {};
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.admin.count({ where }),
      prisma.admin.findMany({
        where,
        select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { items: rows, meta: paginationMeta({ page, limit, total }) };
  }

  async createAdmin(actorId, data) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const admin = await prisma.admin.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role || 'ops_admin',
      },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    });

    await prisma.adminAuditLog.create({
      data: {
        adminId: actorId,
        actionType: 'other',
        targetEntityType: 'admin',
        targetEntityId: admin.id,
        details: { createdEmail: admin.email, role: admin.role },
      },
    });

    return admin;
  }

  async updateAdmin(id, actorId, data) {
    const existing = await prisma.admin.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Admin not found', { code: 'ADMIN_NOT_FOUND' });

    if (id === actorId && data.isActive === false) {
      throw ApiError.badRequest('You cannot deactivate your own account', { code: 'CANNOT_DEACTIVATE_SELF' });
    }

    const payload = {};
    if (data.fullName !== undefined) payload.fullName = data.fullName;
    if (data.role !== undefined) payload.role = data.role;
    if (data.isActive !== undefined) payload.isActive = data.isActive;
    if (data.password) payload.passwordHash = await bcrypt.hash(data.password, 10);

    const admin = await prisma.admin.update({
      where: { id },
      data: payload,
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    });

    await prisma.adminAuditLog.create({
      data: {
        adminId: actorId,
        actionType: 'other',
        targetEntityType: 'admin',
        targetEntityId: id,
        details: { updated: Object.keys(data).filter((k) => k !== 'password') },
      },
    });

    return admin;
  }
}

export default new AdminService();
