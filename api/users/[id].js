import { applyCors, fail, handlerError, json, method, sql } from '../_lib/core.js';

export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method==='GET') {
      const id=decodeURIComponent(new URL(req.url,'http://local').pathname.split('/').filter(Boolean).at(-1)||'');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail(res,400,'A valid user ID is required.');
      const [user]=await sql()`SELECT id,username,role,avatar,created_at FROM users WHERE id=${id}`;
      if (!user) return fail(res,404,'User profile not found.');
      const places=await sql()`SELECT p.id,p.name,p.description,p.genre,p.published_at,a.public_url AS icon_url FROM places p LEFT JOIN assets a ON a.id=p.icon_asset_id WHERE p.owner_id=${id} AND p.published=true AND p.privacy='public' AND p.requires_supervision=false AND (a.id IS NULL OR a.status='approved') ORDER BY p.published_at DESC NULLS LAST LIMIT 24`;
      return json(res,200,{user,places});
    }
    return method(req,res,['GET']);
  } catch(error) { return handlerError(res,error); }
}
