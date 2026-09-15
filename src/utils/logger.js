/**
 * Minimal structured logger. Kept dependency-free so it can be used from the
 * config layer (which loads before anything else). Swap for pino/winston later
 * without changing call sites.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const threshold = LEVELS[activeLevel] ?? LEVELS.debug;

function emit(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
  };
  if (meta !== undefined) entry.meta = meta;
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};

export default logger;
