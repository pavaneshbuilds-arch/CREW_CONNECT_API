import Joi from 'joi';
import { EVENT_TYPES, FOOD_SERVICE_TYPES } from '../config/pricing.js';

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

const idParam = {
  params: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),
};

const crewCounts = Joi.object({
  waiter: Joi.number().integer().min(0).max(200).default(0),
  supervisor: Joi.number().integer().min(0).max(50).default(0),
  bouncer: Joi.number().integer().min(0).max(50).default(0),
}).custom((value, helpers) => {
  if ((value.waiter || 0) + (value.supervisor || 0) + (value.bouncer || 0) < 1) {
    return helpers.message('Select at least one crew member');
  }
  return value;
}, 'at least one crew member');

export const crewSuggestion = {
  query: Joi.object({
    guestCount: Joi.number().integer().min(1).max(10000).required(),
    foodItemsCount: Joi.number().integer().min(0).max(500),
  }),
};

export const upsertSummary = {
  body: Joi.object({
    id: Joi.number().integer().positive(),
    eventType: Joi.string()
      .valid(...EVENT_TYPES)
      .required(),
    guestCount: Joi.number().integer().min(1).max(10000).required(),
    foodServiceType: Joi.string()
      .valid(...FOOD_SERVICE_TYPES)
      .required(),
    foodItemsCount: Joi.number().integer().min(0).max(500).required(),
    eventDate: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .messages({ 'string.pattern.base': 'eventDate must be YYYY-MM-DD' }),
    eventStartTime: Joi.string()
      .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
      .required()
      .messages({ 'string.pattern.base': 'eventStartTime must be HH:mm' }),
    expectedDurationHours: Joi.number().min(1).max(24).precision(1).required(),
    crew: crewCounts.required(),
    venueName: Joi.string().trim().max(200).required(),
    venueAddress: Joi.string().trim().max(2000).required(),
    venueLatitude: Joi.number().min(-90).max(90).allow(null),
    venueLongitude: Joi.number().min(-180).max(180).allow(null),
    additionalInstructions: Joi.string().max(2000).allow('', null),
  }),
};

export const applyCoupon = {
  ...idParam,
  body: Joi.object({
    code: Joi.string().trim().min(2).max(30).required(),
  }),
};

export const bookingParam = idParam;

export const listBookings = {
  query: Joi.object({
    ...pagination,
    tab: Joi.string().valid('current', 'past').default('current'),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
  }).and('latitude', 'longitude'),
};

export const cancelBooking = {
  ...idParam,
  body: Joi.object({
    reason: Joi.string().max(500).allow('', null),
  }).default({}),
};

export const createReview = {
  ...idParam,
  body: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    wouldRecommend: Joi.boolean(),
    reviewText: Joi.string().max(2000).allow('', null),
  }),
};
