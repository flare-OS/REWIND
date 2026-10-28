import { applyCors, body, fail, handlerError, json, method, requireUser, sql } from './_lib/core.js';

function limitFor(plan){return plan==='free'?100:plan==='neptune'?250:plan==='pluto'?500:null}

export default async function handler(req,res){
  if(applyCors(req,res))return;
  try{
    const user=await requireUser(req,res);if(!user)return;
    if(req.method==='GET'){
      const friends=await sql()`SELECT u.id,u.username FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=${user.id} AND f.status='accepted' ORDER BY u.username LIMIT 500`;
      const requests=await sql()`SELECT f.user_id AS id,u.username FROM friendships f JOIN users u ON u.id=f.user_id WHERE f.friend_id=${user.id} AND f.status='pending' ORDER BY f.created_at DESC LIMIT 100`;
      return json(res,200,{friends,requests});
    }
    if(req.method==='POST'){
      const data=body(req),action=String(data.action||'');
      if(action==='request'){
        const key=String(data.username||'').trim().toLowerCase(),[target]=await sql()`SELECT id FROM users WHERE username_key=${key}`;
        if(!target)return fail(res,404,'User not found.');if(target.id===user.id)return fail(res,400,'You cannot friend yourself.');
        const [existing]=await sql()`SELECT status FROM friendships WHERE user_id=${user.id} AND friend_id=${target.id}`;
        if(existing?.status==='accepted')return fail(res,409,'You are already friends.');
        await sql()`INSERT INTO friendships(user_id,friend_id,status) VALUES(${user.id},${target.id},'pending') ON CONFLICT(user_id,friend_id) DO UPDATE SET status='pending',created_at=NOW()`;
        return json(res,201,{requested:true});
      }
      if(action==='accept'){
        const id=String(data.userId||''),[request]=await sql()`SELECT user_id FROM friendships WHERE user_id=${id} AND friend_id=${user.id} AND status='pending'`;
        if(!request)return fail(res,404,'Friend request not found.');
        const counts=await sql()`SELECT u.id,u.plan,(SELECT COUNT(*)::int FROM friendships f WHERE f.user_id=u.id AND f.status='accepted') AS current_count FROM users u WHERE u.id IN (${user.id},${id})`;
        for(const row of counts){const limit=limitFor(row.plan);if(limit!==null&&row.current_count>=limit)return fail(res,403,'One of these accounts has reached its plan friend limit.');}
        await sql()`UPDATE friendships SET status='accepted' WHERE user_id=${id} AND friend_id=${user.id}`;
        await sql()`INSERT INTO friendships(user_id,friend_id,status) VALUES(${user.id},${id},'accepted') ON CONFLICT(user_id,friend_id) DO UPDATE SET status='accepted'`;
        return json(res,200,{accepted:true});
      }
      return fail(res,400,'Unknown friend action.');
    }
    return method(req,res,['GET','POST']);
  }catch(error){return handlerError(res,error)}
}
