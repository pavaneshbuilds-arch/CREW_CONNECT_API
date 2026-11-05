import Joi from 'joi';

const CREW_LIST_STATUSES = ['new_request', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected'];

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

function statusQuery(value, helpers) {
  if (value == null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const statuses = [
    ...new Set(
      raw
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
  if (!statuses.length) return undefined;
  if (statuses.some((item) => !CREW_LIST_STATUSES.includes(item))) {
    return helpers.error('any.invalid');
  }
  return statuses;
}

const coords = {
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
};

export const homeQuery = {
  query: Joi.object({
    ...coords,
  }).and('latitude', 'longitude'),
};

export const listBookings = {
  query: Joi.object({
    ...pagination,
    ...coords,
    tab: Joi.string().valid('requests', 'upcoming', 'active', 'completed', 'rejected').default('requests'),
    status: Joi.any().custom(statusQuery),
  }).and('latitude', 'longitude'),
};

export const bookingParam = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
};

export const bookingParamWithCoords = {
  ...bookingParam,
  query: Joi.object({
    ...coords,
  }).and('latitude', 'longitude'),
};

export const issueTeamOtp = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
    assignmentId: Joi.number().integer().positive().required(),
  }),
};

export const verifyStart = {
  ...bookingParam,
  body: Joi.object({
    code: Joi.string()
      .pattern(/^\d{4}$/)
      .required()
      .messages({ 'string.pattern.base': 'code must be a 4-digit OTP' }),
  }),
};
