import { applyCors, body, currentUser, fail, handlerError, json, method, requireUser, sql } from './_lib/core.js';
const plans={free:{daily:0,friends:100},neptune:{daily:20,friends:250,experienceHours:5,gamepasses:true,assets:true},pluto:{daily:50,friends:500,unlimitedPlaces:true,starcode:true,gamepasses:true,assets:true},supernova:{daily:125,friends:null,unlimited:true,starcode:true,gamepasses:true,assets:true}};
const choices={neptune:{orbs:5,seconds:600},pluto:{orbs:15,seconds:7200},supernova:{orbs:40,seconds:18000}};
export default async function handler(req,res){if(applyCors(req,res))return;try{
 const u=await requireUser(req,res);if(!u)return;
 if(req.method==='GET'){
  // First authenticated visit per UTC day grants the 5 Orb sign-in bonus and plan allowance.
  const [state]=await sql()`UPDATE users SET orbs=orbs+5+CASE plan WHEN 'neptune' THEN 20 WHEN 'pluto' THEN 50 WHEN 'supernova' THEN 125 ELSE 0 END,last_orb_claim=CURRENT_DATE WHERE id=${u.id} AND (last_orb_claim IS NULL OR last_orb_claim<CURRENT_DATE) RETURNING plan,orbs,play_seconds,starcode`;
  const [current]=state?[state]:await sql()`SELECT plan,orbs,play_seconds,starcode FROM users WHERE id=${u.id}`;
  return json(res,200,{account:current,entitlements:plans[current.plan]||plans.free,plans,choices});
 }
 if(req.method==='POST'){
  const data=body(req),action=String(data.action||'');
  if(action==='upgrade'){
   const plan=String(data.plan||''),choice=choices[plan];if(!choice)return fail(res,400,'Choose Neptune, Pluto, or Supernova.');
   const [updated]=await sql()`UPDATE users SET plan=${plan},orbs=CASE WHEN ${String(data.method)}='orbs' THEN orbs-${choice.orbs} ELSE orbs END,starcode=CASE WHEN ${plan} IN ('pluto','supernova') AND starcode IS NULL THEN UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text,'-',''),1,8)) ELSE starcode END WHERE id=${u.id} AND (CASE plan WHEN 'free' THEN 0 WHEN 'neptune' THEN 1 WHEN 'pluto' THEN 2 ELSE 3 END)<(CASE ${plan} WHEN 'neptune' THEN 1 WHEN 'pluto' THEN 2 ELSE 3 END) AND ((${String(data.method)}='orbs' AND orbs>=${choice.orbs}) OR (${String(data.method)}='playtime' AND play_seconds>=${choice.seconds})) RETURNING plan,orbs,play_seconds,starcode`;
   return updated?json(res,200,{account:updated,entitlements:plans[plan]}):fail(res,409,'Not enough Orbs or playtime for this plan, or you already have a higher plan.');
  }
  if(action==='playtime'){
   const seconds=Math.max(0,Math.min(60,Math.floor(Number(data.seconds)||0)));
   const [updated]=await sql()`UPDATE users SET play_seconds=play_seconds+${seconds} WHERE id=${u.id} RETURNING play_seconds`;
   return json(res,200,{playSeconds:updated.play_seconds});
  }
  if(action==='report'){
   const type=String(data.targetType||''),id=String(data.targetId||''),reason=String(data.reason||'').trim(),details=String(data.details||'').trim();
   if(!['user','place','asset'].includes(type)||! /^[0-9a-f-]{36}$/i.test(id)||reason.length<3||reason.length>120||details.length>2000)return fail(res,400,'Provide a valid target, reason, and details under 2,000 characters.');
   const [exists]= type==='user'?await sql()`SELECT id FROM users WHERE id=${id}`:type==='place'?await sql()`SELECT id FROM places WHERE id=${id}`:await sql()`SELECT id FROM assets WHERE id=${id}`;
   if(!exists)return fail(res,404,'Report target not found.');
   const [{id:reportId}]=await sql()`INSERT INTO reports(id,reporter_id,target_type,target_id,reason,details) VALUES(gen_random_uuid(),${u.id},${type},${id}::uuid,${reason},${details}) RETURNING id`;
   return json(res,201,{reportId});
  }
  return fail(res,400,'Unknown account action.');
 }
 return method(req,res,['GET','POST']);
 }catch(e){return handlerError(res,e)}}
