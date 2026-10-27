import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';

export function notFound(req, res, next) {
  next(new HttpError(404, `No API route for ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large (max 8 MB).' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (!config.isTest) console.error('[error]', err);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
}
