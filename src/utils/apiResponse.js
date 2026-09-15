/**
 * Uniform success envelope so all three clients (user app, crew app, admin web)
 * can rely on a consistent response shape.
 */
export function success(res, data = null, { status = 200, message, meta } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data, opts = {}) {
  return success(res, data, { ...opts, status: 201 });
}
