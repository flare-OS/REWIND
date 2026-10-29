import { handlerError, sql } from '../_lib/core.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const excerpt=(post)=>String(post.summary||post.content).replace(/\s+/g,' ').trim().slice(0,240);

export default async function handler(req,res) {
  try {
    if (req.method!=='GET') {
      res.statusCode=405;
      res.setHeader('Allow','GET');
      res.end('Method not allowed');
      return;
    }
    const id=new URL(req.url,'http://local').searchParams.get('id')||'';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.statusCode=400;
      res.end('A valid news post ID is required.');
      return;
    }
    const [post]=await sql()`SELECT id,title,summary,content,published_at FROM news_posts WHERE id=${id} AND published_at IS NOT NULL`;
    if (!post) {
      res.statusCode=404;
      res.end('News post not found.');
      return;
    }
    const title=escapeHtml(post.title),description=escapeHtml(excerpt(post)),content=escapeHtml(post.content);
    const frontendUrl=`https://rwd.2bd.net/news/?id=${encodeURIComponent(post.id)}`;
    const shareUrl=`${process.env.API_PUBLIC_URL||'https://api.rwd.2bd.net'}/api/news/share?id=${encodeURIComponent(post.id)}`;
    res.statusCode=200;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=300');
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · REWIND</title><meta name="description" content="${description}"><meta property="og:site_name" content="REWIND"><meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${shareUrl}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta http-equiv="refresh" content="0;url=${frontendUrl}"><link rel="canonical" href="${frontendUrl}"><style>body{margin:0;background:#11131a;color:#f2f1f8;font:16px/1.7 system-ui,sans-serif}.wrap{max-width:760px;margin:12vh auto;padding:32px}.brand{color:#b8a9ff;font-size:12px;letter-spacing:.18em;font-weight:700}h1{font-size:clamp(30px,7vw,52px);line-height:1.08;letter-spacing:-.04em}p{white-space:pre-wrap;color:#c1c2ce}a{color:#b8a9ff}</style></head><body><main class="wrap"><span class="brand">REWIND</span><h1>${title}</h1><p>${content}</p><a href="${frontendUrl}">Read this news post on REWIND</a></main></body></html>`);
  } catch(error) { return handlerError(res,error); }
}
