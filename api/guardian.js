import { applyCors, body, currentUser, fail, handlerError, json, method, sql, uid } from './_lib/core.js';

export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    const user=await currentUser(req);
    if (!user) return fail(res,401,'Log in to manage supervised accounts.');
    if (req.method==='GET') {
      const [self]=await sql()`SELECT date_of_birth FROM users WHERE id=${user.id}`;
      const today=new Date(); let age=self?.date_of_birth ? today.getUTCFullYear()-new Date(self.date_of_birth).getUTCFullYear() : 0;
      if (self?.date_of_birth && (today.getUTCMonth()<new Date(self.date_of_birth).getUTCMonth() || (today.getUTCMonth()===new Date(self.date_of_birth).getUTCMonth() && today.getUTCDate()<new Date(self.date_of_birth).getUTCDate()))) age--;
      const [link]=await sql()`SELECT l.id,l.status,l.requested_at,l.responded_at,l.child_user_id,l.supervisor_user_id,c.username AS child_username,s.username AS supervisor_username FROM supervision_links l JOIN users c ON c.id=l.child_user_id JOIN users s ON s.id=l.supervisor_user_id WHERE l.child_user_id=${user.id} OR l.supervisor_user_id=${user.id} ORDER BY l.requested_at DESC LIMIT 1`;
      const requests=age>=15 ? await sql()`SELECT l.id,l.child_user_id,l.requested_at,c.username AS child_username FROM supervision_links l JOIN users c ON c.id=l.child_user_id WHERE l.supervisor_user_id=${user.id} AND l.status='pending' ORDER BY l.requested_at` : [];
      return json(res,200,{age,hasBirthDate:Boolean(self?.date_of_birth),link,requests,viewerId:user.id});
    }
    if (req.method==='PATCH') {
      const data=body(req), id=String(data.id||''), status=String(data.status||'');
      if (data.action==='set_age') {
        if (data.acceptTerms!==true||data.ackPrivacy!==true) return fail(res,400,'Accept the current Terms and acknowledge the Privacy Policy to continue.');
        const raw=String(data.dateOfBirth||''), birthDate=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(`${raw}T00:00:00.000Z`):null;
        if (!birthDate||Number.isNaN(birthDate.getTime())||birthDate.toISOString().slice(0,10)!==raw) return fail(res,400,'Enter a valid date of birth.');
        const today=new Date();let age=today.getUTCFullYear()-birthDate.getUTCFullYear();
        if (today.getUTCMonth()<birthDate.getUTCMonth()||(today.getUTCMonth()===birthDate.getUTCMonth()&&today.getUTCDate()<birthDate.getUTCDate())) age--;
        if (age<13) return fail(res,403,'You must be at least 13 years old to use a REWIND account.');
        let supervisor=null;
        if(age<15){const key=String(data.supervisorUsername||'').trim().toLowerCase();if(!key)return fail(res,400,'Enter a 15+ parent or authorized supervisor username.');[supervisor]=await sql()`SELECT id,date_of_birth FROM users WHERE username_key=${key} AND id<>${user.id} LIMIT 1`;if(!supervisor?.date_of_birth)return fail(res,400,'The supervisor account needs an age on file.');let supervisorAge=today.getUTCFullYear()-new Date(supervisor.date_of_birth).getUTCFullYear();if(today.getUTCMonth()<new Date(supervisor.date_of_birth).getUTCMonth()||(today.getUTCMonth()===new Date(supervisor.date_of_birth).getUTCMonth()&&today.getUTCDate()<new Date(supervisor.date_of_birth).getUTCDate()))supervisorAge--;if(supervisorAge<15)return fail(res,400,'The supervisor account must belong to someone aged 15 or older.');}
        const [existing]=await sql()`SELECT date_of_birth FROM users WHERE id=${user.id}`;
        if(existing?.date_of_birth)return fail(res,409,'A date of birth is already set. Contact REWIND support if it is incorrect.');
        await sql()`UPDATE users SET date_of_birth=${raw},terms_accepted_at=NOW(),terms_version='2026-10-28-v1',privacy_acknowledged_at=NOW() WHERE id=${user.id}`;
        if(supervisor)await sql()`INSERT INTO supervision_links (id,child_user_id,supervisor_user_id,supervisor_attested) VALUES (${uid()},${user.id},${supervisor.id},FALSE)`;
        return json(res,200,{ok:true,age});
      }
      if (!['approved','rejected'].includes(status)) return fail(res,400,'Choose approve or reject.');
      const [self]=await sql()`SELECT date_of_birth FROM users WHERE id=${user.id}`;
      if (!self?.date_of_birth) return fail(res,403,'Add your date of birth before supervising an account.');
      const today=new Date();let age=today.getUTCFullYear()-new Date(self.date_of_birth).getUTCFullYear();
      if (today.getUTCMonth()<new Date(self.date_of_birth).getUTCMonth() || (today.getUTCMonth()===new Date(self.date_of_birth).getUTCMonth() && today.getUTCDate()<new Date(self.date_of_birth).getUTCDate())) age--;
      if (age<15) return fail(res,403,'The supervising account must belong to someone who is at least 15.');
      if (status==='approved' && data.attestAuthority!==true) return fail(res,400,'Confirm that you are the child’s parent/legal guardian or have their authorization.');
      const [link]=await sql()`UPDATE supervision_links SET status=${status},responded_at=NOW(),supervisor_attested=${status==='approved'} WHERE id=${id} AND supervisor_user_id=${user.id} AND status='pending' RETURNING id,status`;
      return link ? json(res,200,{link}) : fail(res,404,'No pending supervision request found.');
    }
    return method(req,res,['GET','PATCH']);
  } catch(error) { return handlerError(res,error); }
}
