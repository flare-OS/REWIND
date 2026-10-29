import { applyCors, body, currentUser, fail, handlerError, json, method, requireUser, sql, uid } from '../_lib/core.js';
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method === 'GET') {
      const published = new URL(req.url,'http://local').searchParams.get('published') === 'true';
      if (published) {
        const viewer=await currentUser(req);
        let supervisionAllowed=false;
        if (viewer) { const [access]=await sql()`SELECT (EXTRACT(YEAR FROM AGE(CURRENT_DATE,u.date_of_birth))>=15 OR EXISTS (SELECT 1 FROM supervision_links l WHERE l.child_user_id=u.id AND l.status='approved' AND l.supervisor_attested=true)) AS allowed FROM users u WHERE u.id=${viewer.id}`; supervisionAllowed=Boolean(access?.allowed); }
        const places = await sql()`SELECT p.id,p.owner_id,p.name,p.description,p.genre,p.published,p.privacy,p.requires_supervision,p.created_at,u.username AS owner_username,a.public_url AS icon_url FROM places p JOIN users u ON u.id=p.owner_id LEFT JOIN assets a ON a.id=p.icon_asset_id WHERE p.published=true AND (p.privacy='public' OR (p.privacy='friends' AND EXISTS(SELECT 1 FROM friendships f WHERE f.user_id=p.owner_id AND f.friend_id=${viewer?.id||null} AND f.status='accepted'))) AND (a.id IS NULL OR a.status='approved') AND (p.requires_supervision=false OR ${supervisionAllowed}) ORDER BY p.published_at DESC NULLS LAST LIMIT 48`;
        return json(res,200,{places});
      }
      const user=await requireUser(req,res); if (!user) return;
      const places=await sql()`SELECT p.id,p.name,p.description,p.genre,p.published,p.privacy,p.requires_supervision,p.scene,p.icon_asset_id,p.thumbnail_asset_id,p.created_at,p.updated_at,a.public_url AS icon_url,t.public_url AS thumbnail_url FROM places p LEFT JOIN assets a ON a.id=p.icon_asset_id LEFT JOIN assets t ON t.id=p.thumbnail_asset_id WHERE p.owner_id=${user.id} ORDER BY p.updated_at DESC`;
      return json(res,200,{places});
    }
    if (req.method === 'POST') {
      const user=await requireUser(req,res); if (!user) return;
      const [[account]]=await Promise.all([sql()`SELECT plan,created_at FROM users WHERE id=${user.id}`]);
      if(account.plan==='free'&&new Date(account.created_at).getTime()+86400000>Date.now())return fail(res,403,'Free accounts must wait 1 day after signup before creating a place.');
      const data=body(req), name=String(data.name||'').trim();
      if (name.length < 1 || name.length > 60) return fail(res,400,'Place name must be 1–60 characters.');
      const description=String(data.description||'').slice(0,2000), genre=String(data.genre||'All').slice(0,40);
      const privacy=['public','private','friends'].includes(data.privacy)?data.privacy:'private';
      const scene=data.scene && typeof data.scene==='object' ? JSON.stringify(data.scene) : '{}';
      const iconId=data.iconAssetId||null, thumbnailId=data.thumbnailAssetId||null;
      if (iconId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${iconId} AND owner_id=${user.id} AND asset_type='game_icon'`; if (!ok) return fail(res,400,'The selected icon does not belong to this account.'); }
      if (thumbnailId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${thumbnailId} AND owner_id=${user.id} AND asset_type='game_thumbnail'`; if (!ok) return fail(res,400,'The selected thumbnail does not belong to this account.'); }
      const [place]=await sql()`INSERT INTO places (id,owner_id,name,description,genre,scene,icon_asset_id,thumbnail_asset_id,requires_supervision,privacy) VALUES (${uid()},${user.id},${name},${description},${genre},${scene}::jsonb,${iconId},${thumbnailId},${Boolean(data.requiresSupervision)},${privacy}) RETURNING id,name,description,genre,requires_supervision,privacy,published,created_at,updated_at`;
      await sql()`INSERT INTO place_activity(id,place_id,actor_id,action,summary) VALUES(${uid()},${place.id},${user.id},'created','Created experience')`;
      return json(res,201,{place});
    }
    if (req.method === 'PUT') {
      const user=await requireUser(req,res); if (!user) return;
      const data=body(req), id=String(data.id||'');
      const name=String(data.name||'').trim();
      if (!id || name.length < 1 || name.length > 60) return fail(res,400,'A place ID and valid name are required.');
      const description=String(data.description||'').slice(0,2000), genre=String(data.genre||'All').slice(0,40);
      const privacy=['public','private','friends'].includes(data.privacy)?data.privacy:'private';
      const listed=privacy!=='private';
      const scene=data.scene && typeof data.scene==='object' ? JSON.stringify(data.scene) : '{}';
      const iconId=data.iconAssetId||null, thumbnailId=data.thumbnailAssetId||null;
      if (iconId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${iconId} AND owner_id=${user.id} AND asset_type='game_icon'`; if (!ok) return fail(res,400,'The selected icon does not belong to this account.'); }
      if (thumbnailId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${thumbnailId} AND owner_id=${user.id} AND asset_type='game_thumbnail'`; if (!ok) return fail(res,400,'The selected thumbnail does not belong to this account.'); }
      const [place]=await sql()`UPDATE places SET name=${name},description=${description},genre=${genre},scene=${scene}::jsonb,icon_asset_id=${iconId},thumbnail_asset_id=${thumbnailId},requires_supervision=${Boolean(data.requiresSupervision)},privacy=${privacy},published=${listed},published_at=CASE WHEN ${listed} THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=${id} AND owner_id=${user.id} RETURNING id,name,description,genre,requires_supervision,privacy,published,updated_at`;
      if(place)await sql()`INSERT INTO place_activity(id,place_id,actor_id,action,summary) VALUES(${uid()},${id},${user.id},'updated','Updated experience settings')`;
      return place ? json(res,200,{place}) : fail(res,404,'Place not found.');
    }
    if (req.method === 'PATCH') {
      const user=await requireUser(req,res); if (!user) return;
      const data=body(req), id=String(data.id||'');
      const privacy=['public','private','friends'].includes(data.privacy)?data.privacy:(Boolean(data.published)?'public':'private');
      const [place]=await sql()`UPDATE places SET privacy=${privacy},published=${privacy!=='private'},published_at=CASE WHEN ${privacy!=='private'} THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=${id} AND owner_id=${user.id} RETURNING id,name,published,privacy`;
      if(place)await sql()`INSERT INTO place_activity(id,place_id,actor_id,action,summary) VALUES(${uid()},${id},${user.id},'visibility',${'Changed visibility to '+privacy})`;
      return place ? json(res,200,{place}) : fail(res,404,'Place not found.');
    }
    return method(req,res,['GET','POST','PUT','PATCH']);
  } catch(error) { return handlerError(res,error); }
}
