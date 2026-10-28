import { applyCors, body, fail, handlerError, json, method, requireUser, sql } from '../_lib/core.js';
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    const user=await requireUser(req,res,['owner','asset_mod']); if (!user) return;
    if (req.method==='GET') {
      const [counts]=await sql()`SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM places) AS places,(SELECT COUNT(*) FROM assets WHERE status='pending') AS pending_assets`;
      const assets=await sql()`SELECT a.id,a.asset_type,a.name,a.description,a.public_url,a.mime_type,a.byte_size,a.status,a.created_at,u.username AS owner_username FROM assets a JOIN users u ON u.id=a.owner_id ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,a.created_at DESC LIMIT 100`;
      const users=user.role==='owner' ? await sql()`SELECT id,username,role,created_at FROM users ORDER BY created_at DESC LIMIT 100` : [];
      return json(res,200,{counts,assets,users,viewer:{username:user.username,role:user.role}});
    }
    if (req.method==='PATCH') {
      const data=body(req), id=String(data.id||''), action=String(data.action||'');
      if (action==='review_asset') {
        if (!['approved','rejected'].includes(data.status)) return fail(res,400,'Asset status must be approved or rejected.');
        const [asset]=await sql()`UPDATE assets SET status=${data.status},reviewed_by=${user.id},reviewed_at=NOW() WHERE id=${id} RETURNING id,status`;
        return asset ? json(res,200,{asset}) : fail(res,404,'Asset not found.');
      }
      if (action==='set_role') {
        if (user.role!=='owner') return fail(res,403,'Only the owner can change account roles.');
        if (!['user','asset_mod','owner'].includes(data.role)) return fail(res,400,'Unknown role.');
        const [target]=await sql()`SELECT id,username,role FROM users WHERE id=${id} LIMIT 1`;
        if (!target) return fail(res,404,'User not found.');
        if (target.role==='owner' && data.role!=='owner') {
          const [{count}]=await sql()`SELECT COUNT(*)::int AS count FROM users WHERE role='owner'`;
          if (count<=1) return fail(res,409,'Keep at least one owner account.');
        }
        const [updated]=await sql()`UPDATE users SET role=${data.role} WHERE id=${id} RETURNING id,username,role`;
        return json(res,200,{user:updated});
      }
      return fail(res,400,'Unknown admin action.');
    }
    return method(req,res,['GET','PATCH']);
  } catch(error) { return handlerError(res,error); }
}
