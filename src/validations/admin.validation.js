import Joi from 'joi';

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

export const idParam = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
};

export const listCrew = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().max(150).allow(''),
    verificationStatus: Joi.string().valid('pending', 'approved', 'rejected'),
    primaryRole: Joi.string().valid('waiter', 'supervisor', 'bouncer'),
    isActive: Joi.boolean(),
    isOnline: Joi.boolean(),
    ready: Joi.boolean(),
  }),
};

export const rejectCrew = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    reason: Joi.string().min(3).max(500).required(),
  }),
};

export const setActive = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    isActive: Joi.boolean().required(),
  }),
};

export const listEditRequests = {
  query: Joi.object({
    ...pagination,
    status: Joi.string().valid('pending', 'approved', 'rejected'),
    crewId: Joi.number().integer().positive(),
  }),
};

export const rejectEditRequest = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    reason: Joi.string().max(500).allow('', null),
  }),
};

export const listUsers = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().max(150).allow(''),
    isActive: Joi.boolean(),
  }),
};

export const listBookings = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().max(150).allow(''),
    status: Joi.string().valid(
      'pending_payment',
      'confirmed',
      'crew_assigned',
      'in_progress',
      'completed',
      'cancelled'
    ),
    eventDateFrom: Joi.date().iso(),
    eventDateTo: Joi.date().iso(),
  }),
};

export const listAuditLogs = {
  query: Joi.object({
    ...pagination,
    actionType: Joi.string().valid(
      'crew_verified',
      'crew_rejected',
      'crew_assigned_manually',
      'crew_reassigned',
      'crew_removed',
      'profile_edit_approved',
      'profile_edit_rejected',
      'rate_updated',
      'supervisor_ranges_updated',
      'coupon_created',
      'coupon_updated',
      'coupon_deleted',
      'other'
    ),
    adminId: Joi.number().integer().positive(),
  }),
};

export const listActivityLogs = {
  query: Joi.object({
    ...pagination,
    category: Joi.string().valid(
      'login',
      'admin_action',
      'payment',
      'crew_redemption',
      'crew_earning',
      'penalty'
    ),
    monthBucket: Joi.string().pattern(/^\d{4}-\d{2}$/),
    actorType: Joi.string().valid('user', 'crew', 'admin', 'system'),
  }),
};

export const listAdmins = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().max(150).allow(''),
    isActive: Joi.boolean(),
  }),
};

export const createAdmin = {
  body: Joi.object({
    email: Joi.string().email({ tlds: { allow: false } }).max(255).required(),
    password: Joi.string().min(8).max(128).required(),
    fullName: Joi.string().max(150).required(),
    role: Joi.string().valid('super_admin', 'ops_admin').default('ops_admin'),
  }),
};

export const updateAdmin = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object({
    fullName: Joi.string().max(150),
    role: Joi.string().valid('super_admin', 'ops_admin'),
    isActive: Joi.boolean(),
    password: Joi.string().min(8).max(128),
  }).min(1),
};

const rateValue = Joi.number().min(1).max(100000).precision(2);

export const updateRates = {
  body: Joi.object({
    waiter: rateValue,
    supervisor: rateValue,
    bouncer: rateValue,
    note: Joi.string().max(500).allow('', null),
  })
    .or('waiter', 'supervisor', 'bouncer')
    .messages({ 'object.missing': 'Provide at least one of waiter, supervisor, bouncer' }),
};

export const listRateLogs = {
  query: Joi.object({
    ...pagination,
    role: Joi.string().valid('waiter', 'supervisor', 'bouncer'),
  }),
};

export const replaceSupervisorRanges = {
  body: Joi.object({
    ranges: Joi.array()
      .items(
        Joi.object({
          minWaiters: Joi.number().integer().min(1).max(10000).required(),
          maxWaiters: Joi.number().integer().min(1).max(10000).allow(null),
          supervisorCount: Joi.number().integer().min(0).max(500).required(),
        })
      )
      .max(100)
      .required(),
  }),
};

const couponCode = Joi.string().trim().uppercase().min(2).max(30).pattern(/^[A-Z0-9_-]+$/);
const money = Joi.number().min(0).max(100000).precision(2).allow(null);
const positiveMoney = Joi.number().positive().max(100000).precision(2).allow(null);

const couponFields = {
  code: couponCode,
  description: Joi.string().trim().max(200).allow('', null),
  discountType: Joi.string().valid('flat', 'percentage'),
  discountValue: Joi.number().positive().max(100000).precision(2),
  minSpend: money,
  maxDiscountAmount: positiveMoney,
  maxUses: Joi.number().integer().min(1).max(1000000).allow(null),
  maxUsesPerUser: Joi.number().integer().min(1).max(1000).allow(null),
  validFrom: Joi.date().iso().allow(null),
  validUntil: Joi.date().iso().allow(null),
  isActive: Joi.boolean(),
};

export const listCoupons = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().max(150).allow(''),
    isActive: Joi.boolean(),
    discountType: Joi.string().valid('flat', 'percentage'),
  }),
};

export const createCoupon = {
  body: Joi.object({
    ...couponFields,
    code: couponCode.required(),
    discountType: Joi.string().valid('flat', 'percentage').required(),
    discountValue: Joi.when('discountType', {
      is: 'percentage',
      then: Joi.number().positive().max(100).precision(2).required(),
      otherwise: Joi.number().positive().max(100000).precision(2).required(),
    }),
    isActive: Joi.boolean().default(true),
  }),
};

export const updateCoupon = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object(couponFields).min(1),
};
