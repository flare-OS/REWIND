import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
await loadEnv(path.join(root,'.env'));
const port = Number(process.env.PORT) || 8080;
const mimeTypes = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.ico':'image/x-icon','.jpeg':'image/jpeg','.jpg':'image/jpeg','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8','.webp':'image/webp' };
async function loadEnv(file) {
  try {
    const text=await readFile(file,'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]]===undefined) process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
    }
  } catch { /* .env is optional for static preview. */ }
}
async function localApi(req,res,pathname) {
  const pieces=pathname.split('/').filter(Boolean);
  let modulePath;
  if (pieces[1]==='auth' && pieces[2]) { modulePath='./api/auth/[action].js'; req.query={action:pieces[2]}; }
  else if (pieces[1]==='places') modulePath='./api/places/index.js';
  else if (pieces[1]==='assets') modulePath='./api/assets/index.js';
  else if (pieces[1]==='admin') modulePath='./api/admin/index.js';
  else if (pieces[1]==='avatar') modulePath='./api/avatar.js';
  else if (pieces[1]==='health') modulePath='./api/health.js';
  if (!modulePath) { res.writeHead(404,{'Content-Type':'application/json'}).end('{"error":"API route not found."}'); return; }
  let rawBody='';
  if (!['GET','HEAD','OPTIONS'].includes(req.method||'')) {
    for await (const chunk of req) { rawBody+=chunk; if (rawBody.length>1024*1024) { res.writeHead(413).end('Request too large'); return; } }
  }
  req.rawBody=rawBody;
  const {default:handler}=await import(modulePath);
  await handler(req,res);
}
const server=createServer(async(req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname.startsWith('/api/')) {
    try { await localApi(req,res,pathname); }
    catch(error) { console.error(error); if (!res.headersSent) res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:error.message})); }
    return;
  }
  if (!['GET','HEAD'].includes(req.method||'')) { res.writeHead(405,{Allow:'GET, HEAD'}).end('Method not allowed'); return; }
  const relativePath=pathname==='/'?'index.html':pathname.slice(1);
  let filePath=path.resolve(root,relativePath), relativeToRoot=path.relative(root,filePath);
  const blocked=['.env','.git','api','certs','db','logs','tools','node_modules','server.js','package.json','package-lock.json','Caddyfile','allow-web-ports.ps1'];
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || blocked.some(item=>relativeToRoot===item||relativeToRoot.startsWith(item+path.sep)) || relativeToRoot.split(path.sep).some(part=>part.startsWith('.'))) { res.writeHead(404).end('Not found'); return; }
  try {
    if ((await stat(filePath)).isDirectory()) filePath=path.join(filePath,'index.html');
    const body=await readFile(filePath);
    res.writeHead(200,{'Content-Type':mimeTypes[path.extname(filePath).toLowerCase()]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:body);
  } catch { res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found'); }
});
const host=process.env.HOST||(process.env.PORT?'0.0.0.0':'127.0.0.1');
server.listen(port,host,()=>console.log(`REWIND server listening on ${host}:${port}`));
