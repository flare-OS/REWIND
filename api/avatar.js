import { applyCors, body, handlerError, json, method, requireUser, sql } from './_lib/core.js';
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    const user=await requireUser(req,res); if (!user) return;
    if (req.method==='GET') return json(res,200,{avatar:user.avatar||{}});
    if (req.method==='PUT') {
      const avatar=body(req).avatar;
      if (!avatar || typeof avatar!=='object' || JSON.stringify(avatar).length>20000) return json(res,400,{error:'Avatar data is invalid or too large.'});
      const [row]=await sql()`UPDATE users SET avatar=${JSON.stringify(avatar)}::jsonb WHERE id=${user.id} RETURNING avatar`;
      return json(res,200,{avatar:row.avatar});
    }
    return method(req,res,['GET','PUT']);
  } catch(error) { return handlerError(res,error); }
}
