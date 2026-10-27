import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { HttpError } from '../utils/httpError.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function userFromRequest(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  // Load from the database so deleted users or changed roles take effect immediately.
  const { rows } = await db.query('SELECT id, email, name, role FROM users WHERE id = $1', [Number(payload.sub)]);
  if (!rows.length) throw new HttpError(401, 'Account not found.');
  return rows[0];
}

export function requireAuth(req, res, next) {
  userFromRequest(req)
    .then((user) => {
      if (!user) throw new HttpError(401, 'Please sign in to continue.');
      req.user = user;
      next();
    })
    .catch(next);
}

export function optionalAuth(req, res, next) {
  userFromRequest(req)
    .then((user) => { req.user = user; next(); })
    .catch(() => { req.user = null; next(); });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have access to this area.'));
    return next();
  };
}
