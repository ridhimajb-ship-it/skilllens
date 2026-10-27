import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { asyncHandler, HttpError } from '../utils/httpError.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  // Admin accounts cannot be self-registered; they are provisioned from environment variables.
  role: z.enum(['student', 'professional']).default('student'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const publicUser =(u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.valid.body;
  const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rows.length) throw new HttpError(409, 'An account with this email already exists.');
  const hash = await bcrypt.hash(password, 10);
  const { rows: [user] } = await db.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role',
    [email, hash, name, role],
  );
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.valid.body;
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Same message for unknown email and wrong password (no account enumeration).
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password.');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
