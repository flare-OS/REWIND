import { applyCors, json, handlerError, method, sql } from './_lib/core.js';
export default async function handler(req, res) {
  if (applyCors(req,res)) return;
  if (method(req,res,['GET'])) return;
  try { await sql`SELECT 1`; return json(res,200,{ok:true,service:'REWIND API',database:'connected'}); }
  catch(error) { return handlerError(res,error); }
}
