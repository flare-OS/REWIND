import { applyCors, body, fail, handlerError, json, method, requireUser, sql, uid } from '../_lib/core.js';
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method === 'GET') {
      const published = new URL(req.url,'http://local').searchParams.get('published') === 'true';
      if (published) {
        const places = await sql()`SELECT p.id,p.name,p.description,p.genre,p.published,p.created_at,u.username AS owner_username,a.public_url AS icon_url FROM places p JOIN users u ON u.id=p.owner_id LEFT JOIN assets a ON a.id=p.icon_asset_id WHERE p.published=true AND (a.id IS NULL OR a.status='approved') ORDER BY p.published_at DESC NULLS LAST LIMIT 48`;
        return json(res,200,{places});
      }
      const user=await requireUser(req,res); if (!user) return;
      const places=await sql()`SELECT id,name,description,genre,published,scene,icon_asset_id,thumbnail_asset_id,created_at,updated_at FROM places WHERE owner_id=${user.id} ORDER BY updated_at DESC`;
      return json(res,200,{places});
    }
    if (req.method === 'POST') {
      const user=await requireUser(req,res); if (!user) return;
      const data=body(req), name=String(data.name||'').trim();
      if (name.length < 1 || name.length > 60) return fail(res,400,'Place name must be 1–60 characters.');
      const description=String(data.description||'').slice(0,2000), genre=String(data.genre||'All').slice(0,40);
      const scene=data.scene && typeof data.scene==='object' ? JSON.stringify(data.scene) : '{}';
      const iconId=data.iconAssetId||null, thumbnailId=data.thumbnailAssetId||null;
      if (iconId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${iconId} AND owner_id=${user.id} AND asset_type='game_icon'`; if (!ok) return fail(res,400,'The selected icon does not belong to this account.'); }
      if (thumbnailId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${thumbnailId} AND owner_id=${user.id} AND asset_type='game_thumbnail'`; if (!ok) return fail(res,400,'The selected thumbnail does not belong to this account.'); }
      const [place]=await sql()`INSERT INTO places (id,owner_id,name,description,genre,scene,icon_asset_id,thumbnail_asset_id) VALUES (${uid()},${user.id},${name},${description},${genre},${scene}::jsonb,${iconId},${thumbnailId}) RETURNING id,name,description,genre,published,created_at,updated_at`;
      return json(res,201,{place});
    }
    if (req.method === 'PUT') {
      const user=await requireUser(req,res); if (!user) return;
      const data=body(req), id=String(data.id||'');
      const name=String(data.name||'').trim();
      if (!id || name.length < 1 || name.length > 60) return fail(res,400,'A place ID and valid name are required.');
      const description=String(data.description||'').slice(0,2000), genre=String(data.genre||'All').slice(0,40);
      const scene=data.scene && typeof data.scene==='object' ? JSON.stringify(data.scene) : '{}';
      const iconId=data.iconAssetId||null, thumbnailId=data.thumbnailAssetId||null;
      if (iconId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${iconId} AND owner_id=${user.id} AND asset_type='game_icon'`; if (!ok) return fail(res,400,'The selected icon does not belong to this account.'); }
      if (thumbnailId) { const [ok]=await sql()`SELECT id FROM assets WHERE id=${thumbnailId} AND owner_id=${user.id} AND asset_type='game_thumbnail'`; if (!ok) return fail(res,400,'The selected thumbnail does not belong to this account.'); }
      const [place]=await sql()`UPDATE places SET name=${name},description=${description},genre=${genre},scene=${scene}::jsonb,icon_asset_id=${iconId},thumbnail_asset_id=${thumbnailId},updated_at=NOW() WHERE id=${id} AND owner_id=${user.id} RETURNING id,name,description,genre,published,updated_at`;
      return place ? json(res,200,{place}) : fail(res,404,'Place not found.');
    }
    if (req.method === 'PATCH') {
      const user=await requireUser(req,res); if (!user) return;
      const data=body(req), id=String(data.id||'');
      const [place]=await sql()`UPDATE places SET published=${Boolean(data.published)},published_at=CASE WHEN ${Boolean(data.published)} THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=${id} AND owner_id=${user.id} RETURNING id,name,published`;
      return place ? json(res,200,{place}) : fail(res,404,'Place not found.');
    }
    return method(req,res,['GET','POST','PUT','PATCH']);
  } catch(error) { return handlerError(res,error); }
}
