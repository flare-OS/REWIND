import { applyCors, body, createSession, fail, handlerError, hashPassword, json, method, setSession, sql, uid, verifyPassword } from '../_lib/core.js';
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  const action = req.query?.action || new URL(req.url,'http://local').pathname.split('/').pop();
  if (action === 'signup') {
    if (method(req,res,['POST'])) return;
    try {
      const { username, email, password, bootstrapToken } = body(req);
      const clean = String(username || '').trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) return fail(res,400,'Username must be 3–24 letters, numbers, or underscores.');
      if (typeof password !== 'string' || password.length < 10 || password.length > 128) return fail(res,400,'Password must be at least 10 characters.');
      const normalized = clean.toLowerCase();
      const ownerName = String(process.env.OWNER_USERNAME || 'lunastral').toLowerCase();
      if (normalized === ownerName && (!process.env.OWNER_BOOTSTRAP_TOKEN || bootstrapToken !== process.env.OWNER_BOOTSTRAP_TOKEN)) return fail(res,403,'This username is reserved for the configured owner account.');
      if (normalized !== ownerName && bootstrapToken) return fail(res,400,'Owner setup token is only accepted for the configured owner username.');
      const cleanEmail=String(email||'').trim().toLowerCase();
      if (cleanEmail && (cleanEmail.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) return fail(res,400,'Enter a valid email address.');
      const [existing] = await sql()`SELECT id FROM users WHERE username_key=${normalized} LIMIT 1`;
      if (existing) return fail(res,409,'That username is already taken.');
      if (cleanEmail) { const [emailExists]=await sql()`SELECT id FROM users WHERE email=${cleanEmail} LIMIT 1`; if (emailExists) return fail(res,409,'That email is already in use.'); }
      const id = uid(), role = normalized === ownerName ? 'owner' : 'user';
      const passwordHash = await hashPassword(password);
      const [user] = await sql()`INSERT INTO users (id,username,username_key,email,password_hash,role) VALUES (${id},${clean},${normalized},${cleanEmail || null},${passwordHash},${role}) RETURNING id,username,role,avatar`;
      await createSession(user.id,res); return json(res,201,{user});
    } catch(error) { return handlerError(res,error); }
  }
  if (action === 'login') {
    if (method(req,res,['POST'])) return;
    try {
      const { username, password } = body(req), key=String(username||'').trim().toLowerCase();
      const [record] = await sql()`SELECT id,username,role,avatar,password_hash FROM users WHERE username_key=${key} LIMIT 1`;
      if (!record || !await verifyPassword(String(password||''),record.password_hash)) return fail(res,401,'Username or password is incorrect.');
      await createSession(record.id,res); delete record.password_hash;
      return json(res,200,{user:record});
    } catch(error) { return handlerError(res,error); }
  }
  if (action === 'logout') {
    if (method(req,res,['POST'])) return;
    try {
      const raw=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('rewind_session='));
      if (raw) { const { hashToken }=await import('../_lib/core.js'); await sql()`DELETE FROM sessions WHERE token_hash=${hashToken(decodeURIComponent(raw.slice('rewind_session='.length)))}`; }
      setSession(res,'',true); return json(res,200,{ok:true});
    } catch(error) { return handlerError(res,error); }
  }
  if (action === 'me') {
    if (method(req,res,['GET'])) return;
    try { const { currentUser }=await import('../_lib/core.js'); const user=await currentUser(req); return user ? json(res,200,{user}) : fail(res,401,'Not logged in.'); }
    catch(error) { return handlerError(res,error); }
  }
  return fail(res,404,'Unknown auth action.');
}
