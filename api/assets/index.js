import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { applyCors, body, fail, handlerError, json, method, requireUser, sql, uid } from '../_lib/core.js';
const limits={game_icon:5*1024*1024,game_thumbnail:8*1024*1024,decal:5*1024*1024,audio:25*1024*1024,model:20*1024*1024};
const types={game_icon:['image/png','image/jpeg','image/webp'],game_thumbnail:['image/png','image/jpeg','image/webp'],decal:['image/png','image/jpeg','image/webp'],audio:['audio/mpeg','audio/ogg','audio/wav','audio/webm'],model:['model/gltf-binary','model/gltf+json','application/octet-stream']};
let s3Client;
function storageConfig() {
  const endpoint=process.env.S3_ENDPOINT||process.env.AWS_ENDPOINT_URL_S3;
  const region=process.env.S3_REGION||process.env.AWS_REGION;
  const bucket=process.env.S3_BUCKET;
  const accessKeyId=process.env.S3_ACCESS_KEY_ID||process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey=process.env.S3_SECRET_ACCESS_KEY||process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint||!region||!bucket||!accessKeyId||!secretAccessKey) return null;
  s3Client ||= new S3Client({region,endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
  return {client:s3Client,bucket};
}
export async function catalogHandler(req,res) {
  const params=new URL(req.url,'http://local').searchParams;
  const offsetValue=Number(params.get('offset')||0),offset=Number.isSafeInteger(offsetValue)?Math.max(0,offsetValue):0;
  const type=['image','audio','model'].includes(params.get('type'))?params.get('type'):'all';
  const search=String(params.get('search')||'').trim().slice(0,100),pattern=`%${search}%`;
  const rows=await sql()`SELECT a.id,a.owner_id,a.asset_type,a.name,a.description,a.object_key,a.public_url,a.mime_type,a.byte_size,a.created_at,u.username AS owner_username FROM assets a JOIN users u ON u.id=a.owner_id WHERE a.status='approved' AND (a.public_url IS NOT NULL OR a.object_key IS NOT NULL) AND a.asset_type IN ('game_icon','game_thumbnail','model','audio','decal') AND (${type==='all'} OR (${type==='image'} AND a.asset_type IN ('game_icon','game_thumbnail','decal')) OR a.asset_type=${type}) AND (${search==='' } OR a.name ILIKE ${pattern} OR a.description ILIKE ${pattern}) ORDER BY a.created_at DESC,a.id DESC LIMIT 101 OFFSET ${offset}`;
  const page=rows.slice(0,100);
  const needsSignedUrl=page.some(asset=>!asset.public_url);
  const storage=needsSignedUrl?storageConfig():null;
  if (needsSignedUrl&&!storage) return fail(res,503,'Private catalog assets need S3-compatible read credentials configured on the API host.');
  const assets=await Promise.all(page.map(async asset=>{
    const {object_key,...publicAsset}=asset;
    const public_url=asset.public_url||await getSignedUrl(storage.client,new GetObjectCommand({Bucket:storage.bucket,Key:object_key}),{expiresIn:3600});
    return {...publicAsset,public_url};
  }));
  return json(res,200,{assets,hasMore:rows.length>100});
}
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method==='GET') {
      const params=new URL(req.url,'http://local').searchParams;
      const assetId=params.get('id');
      if(assetId){
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId))return fail(res,400,'A valid asset ID is required.');
        const [asset]=await sql()`SELECT id,asset_type,name,public_url,object_key,mime_type FROM assets WHERE id=${assetId} AND status='approved' AND (public_url IS NOT NULL OR object_key IS NOT NULL)`;
        if(!asset)return fail(res,404,'Approved asset not found.');
        const {object_key,...publicAsset}=asset;
        if(!publicAsset.public_url){
          const storage=storageConfig();
          if(!storage)return fail(res,503,'Private asset previews need S3-compatible read credentials configured on the API host.');
          publicAsset.public_url=await getSignedUrl(storage.client,new GetObjectCommand({Bucket:storage.bucket,Key:object_key}),{expiresIn:3600});
        }
        return json(res,200,{asset:publicAsset});
      }
      if (params.has('type') || params.get('catalog')==='true') return catalogHandler(req,res);
      const user=await requireUser(req,res); if (!user) return;
      const assets=await sql()`SELECT id,asset_type,name,description,public_url,mime_type,byte_size,status,created_at FROM assets WHERE owner_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
      return json(res,200,{assets});
    }
    if (req.method==='POST') {
      const user=await requireUser(req,res), data=body(req); if (!user) return;
      if(user.role==='user'){const [account]=await sql()`SELECT plan FROM users WHERE id=${user.id}`;if(!['neptune','pluto','supernova'].includes(account?.plan))return fail(res,403,'Uploading community assets requires the Neptune plan or above.');}
      const type=String(data.assetType||''), name=String(data.name||'').trim(), mime=String(data.mimeType||''), size=Number(data.byteSize);
      if (!limits[type] || !name || name.length>100 || !(types[type]||[]).includes(mime) || !Number.isSafeInteger(size) || size<1 || size>limits[type]) return fail(res,400,'That file type or size is not allowed.');
      const storage=storageConfig();
      if (!storage) return fail(res,503,'Bucket storage is not configured. Add S3-compatible credentials to the API environment.');
      const id=uid(), objectKey=`${user.id}/${type}/${randomUUID()}`;
      const uploadUrl=await getSignedUrl(storage.client,new PutObjectCommand({Bucket:storage.bucket,Key:objectKey,ContentType:mime,ContentLength:size}),{expiresIn:300});
      const publicUrl=process.env.S3_PUBLIC_BASE_URL ? `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/,'')}/${objectKey}` : null;
      await sql()`INSERT INTO assets (id,owner_id,asset_type,name,description,object_key,public_url,mime_type,byte_size,status) VALUES (${id},${user.id},${type},${name},${String(data.description||'').slice(0,500)},${objectKey},${publicUrl},${mime},${size},'pending')`;
      return json(res,201,{asset:{id,name,asset_type:type,status:'pending',public_url:publicUrl},uploadUrl,uploadHeaders:{'Content-Type':mime},expiresIn:300});
    }
    return method(req,res,['GET','POST']);
  } catch(error) { return handlerError(res,error); }
}
