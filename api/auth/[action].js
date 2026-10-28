import { applyCors, body, createSession, fail, handlerError, hashPassword, json, method, setSession, sql, uid, verifyPassword } from '../_lib/core.js';
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  const action = req.query?.action || new URL(req.url,'http://local').pathname.split('/').pop();
  if (action === 'signup') {
    if (method(req,res,['POST'])) return;
    try {
      const { username, email, password, dateOfBirth, supervisorUsername, acceptTerms, ackPrivacy, confirmAge } = body(req);
      const clean = String(username || '').trim();
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(clean)) return fail(res,400,'Username must be 3–24 letters, numbers, or underscores.');
      if (typeof password !== 'string' || password.length < 10 || password.length > 128) return fail(res,400,'Password must be at least 10 characters.');
      if (acceptTerms!==true || ackPrivacy!==true || confirmAge!==true) return fail(res,400,'Confirm the age requirement, accept the Terms, and acknowledge the Privacy Policy.');
      const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(String(dateOfBirth||'')) ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null;
      if (!birthDate || Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0,10)!==dateOfBirth) return fail(res,400,'Enter a valid date of birth.');
      const today = new Date(), birthYear=birthDate.getUTCFullYear(), birthMonth=birthDate.getUTCMonth(), birthDay=birthDate.getUTCDate();
      let age=today.getUTCFullYear()-birthYear; if (today.getUTCMonth()<birthMonth || (today.getUTCMonth()===birthMonth && today.getUTCDate()<birthDay)) age--;
      if (age < 13) return fail(res,403,'You must be at least 13 years old to create a REWIND account.');
      const normalized = clean.toLowerCase();
      let supervisor = null;
      if (age < 15) {
        const supervisorKey=String(supervisorUsername||'').trim().toLowerCase();
        if (!supervisorKey) return fail(res,400,'If you are under 15, enter the username of your 15+ parent or authorized supervisor account.');
        [supervisor]=await sql()`SELECT id, date_of_birth FROM users WHERE username_key=${supervisorKey} LIMIT 1`;
        if (!supervisor?.date_of_birth) return fail(res,400,'That supervisor account is missing its age information. Ask its owner to update the account.');
        const supervisorBirth=new Date(supervisor.date_of_birth), todayDate=new Date();
        let supervisorAge=todayDate.getUTCFullYear()-supervisorBirth.getUTCFullYear();
        if (todayDate.getUTCMonth()<supervisorBirth.getUTCMonth() || (todayDate.getUTCMonth()===supervisorBirth.getUTCMonth() && todayDate.getUTCDate()<supervisorBirth.getUTCDate())) supervisorAge--;
        if (supervisorAge < 15) return fail(res,400,'The supervisor account must belong to someone who is at least 15.');
      }
      const cleanEmail=String(email||'').trim().toLowerCase();
      if (cleanEmail && (cleanEmail.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) return fail(res,400,'Enter a valid email address.');
      const [existing] = await sql()`SELECT id FROM users WHERE username_key=${normalized} LIMIT 1`;
      if (existing) return fail(res,409,'That username is already taken.');
      if (cleanEmail) { const [emailExists]=await sql()`SELECT id FROM users WHERE email=${cleanEmail} LIMIT 1`; if (emailExists) return fail(res,409,'That email is already in use.'); }
      const id = uid(), role = 'user';
      const passwordHash = await hashPassword(password);
      const [user] = await sql()`INSERT INTO users (id,username,username_key,email,password_hash,role,date_of_birth,terms_accepted_at,terms_version,privacy_acknowledged_at) VALUES (${id},${clean},${normalized},${cleanEmail || null},${passwordHash},${role},${dateOfBirth},NOW(),'2026-10-28-v1',NOW()) RETURNING id,username,role,avatar`;
      if (supervisor) await sql()`INSERT INTO supervision_links (id,child_user_id,supervisor_user_id,supervisor_attested) VALUES (${uid()},${user.id},${supervisor.id},FALSE)`;
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
