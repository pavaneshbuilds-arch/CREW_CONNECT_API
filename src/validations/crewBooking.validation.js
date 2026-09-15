import Joi from 'joi';

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

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
    tab: Joi.string().valid('requests', 'upcoming', 'active', 'completed').default('requests'),
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

export const verifyStart = {
  ...bookingParam,
  body: Joi.object({
    code: Joi.string()
      .pattern(/^\d{4}$/)
      .required()
      .messages({ 'string.pattern.base': 'code must be a 4-digit OTP' }),
  }),
};
