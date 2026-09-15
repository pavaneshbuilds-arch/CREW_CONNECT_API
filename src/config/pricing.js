import config from './env.js';

export const EVENT_TYPES = [
  'Wedding Reception',
  'Wedding',
  'Birthday Party',
  'Corporate Event',
  'Private Party',
  'Engagement',
  'Housewarming',
  'Festival',
  'Other',
];

export const FOOD_SERVICE_TYPES = [
  'Plated Dining',
  'Buffet',
  'Cocktail',
  'Family Style',
  'Live Counter',
];

export const DURATION_PRESETS = [
  { hours: 6, label: '6 Hours' },
  { hours: 8, label: '8 Hours' },
  { hours: 12, label: 'Full Day' },
];

export const DEFAULT_RATES = {
  waiter: 800,
  supervisor: 1000,
  bouncer: 900,
};

export const CREW_ROLES = ['waiter', 'supervisor', 'bouncer'];

export const COVER_RATIO = 20;

export const ROLE_LABELS = {
  waiter: { singular: 'Waiter', plural: 'Waiters' },
  supervisor: { singular: 'Supervisor', plural: 'Supervisors' },
  bouncer: { singular: 'Bouncer', plural: 'Bouncers' },
};

export const DEFAULT_BRIEFING =
  'Please ensure you are at the designated briefing area before starting.';

export const ROLE_REQUIREMENTS = {
  waiter: [
    { title: 'White long-sleeve shirt', description: 'Crisp, ironed, and tucked in.' },
    { title: 'Black trousers', description: 'Formal dress pants only. No jeans.' },
    { title: 'Black polished shoes', description: 'Formal leather shoes with black socks.' },
    { title: 'Clean-shaven appearance', description: 'Groomed hair and professional demeanor.' },
  ],
  supervisor: [
    { title: 'White long-sleeve shirt', description: 'Crisp, ironed, and tucked in.' },
    { title: 'Black formal trousers', description: 'Formal dress pants only. No jeans.' },
    { title: 'Black polished shoes', description: 'Formal leather shoes with black socks.' },
    { title: 'Professional appearance', description: 'Groomed hair and composed demeanor.' },
  ],
  bouncer: [
    { title: 'Black formal shirt', description: 'Plain black, ironed, and tucked in.' },
    { title: 'Black trousers', description: 'Formal dress pants only. No jeans.' },
    { title: 'Black polished shoes', description: 'Closed formal shoes with black socks.' },
    { title: 'Professional appearance', description: 'Groomed hair and composed demeanor.' },
  ],
};

export function getGstPercent() {
  return config.pricing.gstPercent;
}

export const DEFAULT_SUPERVISOR_RANGES = [
  { minWaiters: 5, maxWaiters: 10, supervisorCount: 1 },
  { minWaiters: 11, maxWaiters: 19, supervisorCount: 2 },
  { minWaiters: 20, maxWaiters: 29, supervisorCount: 3 },
  { minWaiters: 30, maxWaiters: 39, supervisorCount: 4 },
  { minWaiters: 40, maxWaiters: null, supervisorCount: 5 },
];

export function supervisorCountForWaiters(waiterCount, ranges = []) {
  const waiters = Math.max(0, Number(waiterCount) || 0);
  if (!ranges.length) return 0;
  const sorted = [...ranges].sort((a, b) => a.minWaiters - b.minWaiters);
  for (const range of sorted) {
    const aboveMin = waiters >= range.minWaiters;
    const belowMax = range.maxWaiters == null || waiters <= range.maxWaiters;
    if (aboveMin && belowMax) return Math.max(0, Number(range.supervisorCount) || 0);
  }
  const last = sorted[sorted.length - 1];
  if (last.maxWaiters != null && waiters > last.maxWaiters) {
    return Math.max(0, Number(last.supervisorCount) || 0);
  }
  return 0;
}

export function suggestCrew(guestCount, ranges = []) {
  const guests = Math.max(1, Number(guestCount) || 1);
  const waiter = Math.max(1, Math.ceil(guests / COVER_RATIO));
  const supervisor = supervisorCountForWaiters(waiter, ranges);
  return {
    waiter,
    supervisor,
    bouncer: 0,
    totalPersonnel: waiter + supervisor,
    coverRatio: `1:${COVER_RATIO}`,
  };
}
