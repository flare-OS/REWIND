import { applyCors, body, fail, handlerError, json, method, requireUser, sql } from './_lib/core.js';
export default async function handler(req,res){if(applyCors(req,res))return;try{const user=await requireUser(req,res);if(!user)return;
 if(req.method==='GET'){
  const placeId=new URL(req.url,'http://local').searchParams.get('placeId');if(!placeId)return fail(res,400,'Place ID required.');
  const [place]=await sql()`SELECT p.id,p.owner_id,p.published,u.plan FROM places p JOIN users u ON u.id=p.owner_id WHERE p.id=${placeId}`;
  if(!place||(!place.published&&place.owner_id!==user.id))return fail(res,404,'Place not found.');
  if(place.plan==='neptune'){const [runtime]=await sql()`SELECT seconds FROM experience_runtime WHERE place_id=${place.id}`;if((runtime?.seconds||0)>=18000)return fail(res,403,'This Neptune experience reached its 5 hour runtime limit.');}
  await sql()`INSERT INTO place_sessions(id,place_id,user_id,last_seen_at) VALUES(gen_random_uuid(),${place.id},${user.id},NOW()) ON CONFLICT(place_id,user_id) DO UPDATE SET last_seen_at=NOW()`;
  const [count]=await sql()`SELECT COUNT(*)::int AS players FROM place_sessions WHERE place_id=${place.id} AND last_seen_at>NOW()-INTERVAL '90 seconds'`;
  const playerList=await sql()`SELECT u.id,u.username AS name,s.last_seen_at FROM place_sessions s JOIN users u ON u.id=s.user_id WHERE s.place_id=${place.id} AND s.last_seen_at>NOW()-INTERVAL '90 seconds' ORDER BY s.last_seen_at DESC`;
  const scripts=place.owner_id===user.id?await sql()`SELECT name,script_type,source,updated_at FROM place_scripts WHERE place_id=${place.id} ORDER BY script_type,name`:[];
  return json(res,200,{players:count.players,playerList,limit:place.plan==='free'?100:place.plan==='neptune'?250:place.plan==='pluto'?500:null,scripts});
 }
 if(req.method==='POST'){
  const data=body(req),action=String(data.action||''),placeId=String(data.placeId||'');
  const [place]=await sql()`SELECT p.id,p.owner_id,p.published,u.plan FROM places p JOIN users u ON u.id=p.owner_id WHERE p.id=${placeId}`;
  if(!place)return fail(res,404,'Place not found.');
  if(!place.published&&place.owner_id!==user.id)return fail(res,404,'Place not found.');
  if(action==='heartbeat'){
   if(!place.published&&place.owner_id!==user.id)return fail(res,404,'Place not found.');
   const [active]=await sql()`INSERT INTO place_sessions(id,place_id,user_id,last_seen_at) VALUES(gen_random_uuid(),${place.id},${user.id},NOW()) ON CONFLICT(place_id,user_id) DO UPDATE SET last_seen_at=NOW() WHERE place_sessions.last_seen_at<NOW()-INTERVAL '25 seconds' RETURNING id`;
   if(active){if(place.plan==='neptune'){const [runtime]=await sql()`INSERT INTO experience_runtime(place_id,seconds) VALUES(${place.id},30) ON CONFLICT(place_id) DO UPDATE SET seconds=experience_runtime.seconds+30 RETURNING seconds`;if(runtime.seconds>18000)return fail(res,403,'This Neptune experience reached its 5 hour runtime limit.');}await sql()`UPDATE users SET play_seconds=play_seconds+30 WHERE id=${user.id}`;}
   const [count]=await sql()`SELECT COUNT(*)::int AS players FROM place_sessions WHERE place_id=${place.id} AND last_seen_at>NOW()-INTERVAL '90 seconds'`;
   return json(res,200,{players:count.players});
  }
  if(action==='save_script'){
   if(place.owner_id!==user.id)return fail(res,403,'Only the place owner can edit server scripts.');
   const name=String(data.name||'ServerScript').trim(),type=String(data.scriptType||'server'),source=String(data.source||'');
   if(!['server','client'].includes(type)||!name||name.length>80||source.length>50000)return fail(res,400,'Invalid script name, type, or source size.');
   await sql()`INSERT INTO place_scripts(id,place_id,name,script_type,source) VALUES(gen_random_uuid(),${place.id},${name},${type},${source}) ON CONFLICT(place_id,name,script_type) DO UPDATE SET source=EXCLUDED.source,updated_at=NOW()`;
   await sql()`INSERT INTO place_activity(id,place_id,actor_id,action,summary) VALUES(gen_random_uuid(),${place.id},${user.id},'script_saved',${'Saved '+type+' '+name})`;
   return json(res,200,{saved:true,execution:'Server scripts are stored only. They require an isolated server runtime before they can execute.'});
  }
  if(action==='get'){
   if(place.owner_id!==user.id)return fail(res,403,'Experience data stores are server-only in this prototype.');
   const name=String(data.name||''),store=String(data.store||'default');if(!name||name.length>120||store.length>80)return fail(res,400,'Invalid data key.');
   const [row]=await sql()`SELECT value FROM place_datastore WHERE place_id=${place.id} AND store_name=${store} AND data_key=${name}`;
   return json(res,200,{value:row?.value??null});
  }
  if(action==='set'){
   if(place.owner_id!==user.id)return fail(res,403,'Only place owners can write experience data in this prototype.');
   const name=String(data.name||''),store=String(data.store||'default'),value=JSON.stringify(data.value);
   if(!name||name.length>120||store.length>80||typeof value!=='string'||value.length>10000)return fail(res,400,'Data value too large or key invalid.');
   await sql()`INSERT INTO place_datastore(place_id,store_name,data_key,value) VALUES(${place.id},${store},${name},${value}::jsonb) ON CONFLICT(place_id,store_name,data_key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`;
   return json(res,200,{saved:true});
  }
  if(['update','remove','increment'].includes(action)){
   if(place.owner_id!==user.id)return fail(res,403,'Experience data stores are server-only in this prototype.');const name=String(data.name||''),store=String(data.store||'default');if(!name||name.length>120||store.length>80)return fail(res,400,'Invalid data key.');
   if(action==='remove'){await sql()`DELETE FROM place_datastore WHERE place_id=${place.id} AND store_name=${store} AND data_key=${name}`;return json(res,200,{removed:true})}
   if(action==='increment'){const amount=Math.floor(Number(data.amount));if(!Number.isSafeInteger(amount)||Math.abs(amount)>100000000)return fail(res,400,'Invalid increment amount.');const [row]=await sql()`INSERT INTO place_datastore(place_id,store_name,data_key,value) VALUES(${place.id},${store},${name},to_jsonb(${amount})) ON CONFLICT(place_id,store_name,data_key) DO UPDATE SET value=to_jsonb(COALESCE((place_datastore.value#>>'{}')::bigint,0)+${amount}),updated_at=NOW() RETURNING value`;return json(res,200,{value:row.value})}
   const value=JSON.stringify(data.value);if(value.length>10000)return fail(res,400,'Data value is too large.');const [row]=await sql()`INSERT INTO place_datastore(place_id,store_name,data_key,value) VALUES(${place.id},${store},${name},${value}::jsonb) ON CONFLICT(place_id,store_name,data_key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW() RETURNING value`;return json(res,200,{value:row.value});
  }
  return fail(res,400,'Unknown multiplayer action.');
 }
 return method(req,res,['GET','POST']);
 }catch(e){return handlerError(res,e)}}
