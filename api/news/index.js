import { applyCors, body, fail, handlerError, json, method, requireUser, sql, uid } from '../_lib/core.js';

export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method==='GET') {
      const params=new URL(req.url,'http://local').searchParams;
      if (params.get('admin')==='true') {
        const user=await requireUser(req,res,['owner','asset_mod']);
        if (!user) return;
        const posts=await sql()`SELECT n.id,n.title,n.summary,n.content,n.created_at,n.published_at,u.username AS author FROM news_posts n JOIN users u ON u.id=n.author_id ORDER BY n.created_at DESC LIMIT 100`;
        return json(res,200,{posts});
      }
      const id=params.get('id');
      if (id) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail(res,400,'A valid news post ID is required.');
        const [post]=await sql()`SELECT n.id,n.title,n.summary,n.content,n.created_at,n.published_at,u.username AS author FROM news_posts n JOIN users u ON u.id=n.author_id WHERE n.id=${id} AND n.published_at IS NOT NULL`;
        return post?json(res,200,{post}):fail(res,404,'News post not found.');
      }
      const posts=await sql()`SELECT n.id,n.title,n.summary,n.content,n.created_at,n.published_at,u.username AS author FROM news_posts n JOIN users u ON u.id=n.author_id WHERE n.published_at IS NOT NULL ORDER BY n.published_at DESC LIMIT 100`;
      return json(res,200,{posts});
    }
    if (req.method==='POST') {
      const user=await requireUser(req,res,['owner','asset_mod']);
      if (!user) return;
      const data=body(req),title=String(data.title||'').trim(),summary=String(data.summary||'').trim(),content=String(data.content||'').trim();
      if (!title||title.length>120) return fail(res,400,'Enter a title up to 120 characters.');
      if (!content||content.length>20000) return fail(res,400,'Enter news content up to 20,000 characters.');
      if (summary.length>300) return fail(res,400,'The news description must be 300 characters or fewer.');
      const [post]=await sql()`INSERT INTO news_posts (id,author_id,title,summary,content,published_at) VALUES (${uid()},${user.id},${title},${summary},${content},NOW()) RETURNING id,title,summary,content,created_at,published_at`;
      return json(res,201,{post});
    }
    if (req.method==='DELETE') {
      const user=await requireUser(req,res,['owner','asset_mod']);
      if (!user) return;
      const id=new URL(req.url,'http://local').searchParams.get('id')||'';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return fail(res,400,'A valid news post ID is required.');
      const [post]=await sql()`DELETE FROM news_posts WHERE id=${id} RETURNING id`;
      return post?json(res,200,{deleted:true}):fail(res,404,'News post not found.');
    }
    return method(req,res,['GET','POST','DELETE']);
  } catch(error) { return handlerError(res,error); }
}
