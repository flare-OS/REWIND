import { randomBytes, randomUUID, createHash, pbkdf2 as pbkdf2Callback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';

const pbkdf2 = promisify(pbkdf2Callback);
let sqlClient;
export function sql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured on the API host.');
  return sqlClient ||= neon(process.env.DATABASE_URL);
}
export const uid = () => randomUUID();
export const hashToken = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = await pbkdf2(password, salt, 310000, 32, 'sha256');
  return `pbkdf2-sha256$310000$${salt}$${digest.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [scheme, rounds, salt, expected] = String(encoded).split('$');
  if (scheme !== 'pbkdf2-sha256' || !expected) return false;
  const actual = await pbkdf2(password, salt, Number(rounds), 32, 'sha256');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && timingSafeEqual(actual, target);
}
export function json(res, status, value) {
  res.statusCode = status;
  if (res.setHeader) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}
export function fail(res, status, error) { return json(res, status, { error }); }
export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.rawBody || '{}'); } catch { return {}; }
}
export function method(req, res, allowed) {
  if (allowed.includes(req.method)) return false;
  if (res.setHeader) res.setHeader('Allow', allowed.join(', '));
  fail(res, 405, 'Method not allowed'); return true;
}
function cookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map(x => x.trim().split(/=(.*)/s).slice(0, 2)).filter(([k,v]) => k && v !== undefined).map(([k,v]) => [k, decodeURIComponent(v)]));
}
export async function currentUser(req) {
  const token = cookies(req).rewind_session;
  if (!token) return null;
  const [user] = await sql()`SELECT u.id, u.username, u.role, u.avatar FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hashToken(token)} AND s.expires_at>NOW() LIMIT 1`;
  return user || null;
}
export async function requireUser(req, res, roles = null) {
  const user = await currentUser(req);
  if (!user) { fail(res, 401, 'Log in to continue.'); return null; }
  const [ageCheck]=await sql()`SELECT date_of_birth IS NOT NULL AS has_birth_date, EXTRACT(YEAR FROM AGE(CURRENT_DATE,date_of_birth))::int AS age FROM users WHERE id=${user.id}`;
  if (!ageCheck?.has_birth_date) { fail(res, 403, 'Add your date of birth in Family supervision before using account features.'); return null; }
  if (ageCheck.age<13) { fail(res, 403, 'REWIND accounts require an age of at least 13.'); return null; }
  if (roles && !roles.includes(user.role)) { fail(res, 403, 'You do not have permission to do that.'); return null; }
  return user;
}
export function setSession(res, token, clear = false) {
  const maxAge = clear ? 'Max-Age=0' : `Max-Age=${60 * 60 * 24 * 30}`;
  const domain = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : '';
  const production = process.env.NODE_ENV === 'production';
  const secure = production ? '; Secure' : '';
  res.setHeader('Set-Cookie', `rewind_session=${clear ? '' : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${production ? 'None' : 'Lax'}; ${maxAge}${domain}${secure}`);
}
export function applyCors(req, res) {
  const origin = req.headers?.origin;
  const allowed = String(process.env.CORS_ORIGINS || 'http://localhost:8080').split(',').map(x => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}
export async function createSession(userId, res) {
  const token = randomBytes(32).toString('base64url');
  await sql()`INSERT INTO sessions (id,user_id,token_hash,expires_at) VALUES (${uid()},${userId},${hashToken(token)},NOW()+INTERVAL '30 days')`;
  setSession(res, token);
}
export async function handlerError(res, error) {
  console.error(error);
  return fail(res, 500, process.env.NODE_ENV === 'production' ? 'The API could not complete that request.' : error.message);
}
