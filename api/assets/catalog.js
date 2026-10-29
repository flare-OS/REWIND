import { applyCors, handlerError, method } from '../_lib/core.js';
import { catalogHandler } from './index.js';

export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method!=='GET') return method(req,res,['GET']);
    return await catalogHandler(req,res);
  } catch(error) {
    return handlerError(res,error);
  }
}
