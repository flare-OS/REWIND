import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { applyCors, body, fail, handlerError, json, method, requireUser, sql, uid } from '../_lib/core.js';
const limits={game_icon:5*1024*1024,game_thumbnail:8*1024*1024,decal:5*1024*1024,audio:25*1024*1024,model:20*1024*1024};
const types={game_icon:['image/png','image/jpeg','image/webp'],game_thumbnail:['image/png','image/jpeg','image/webp'],decal:['image/png','image/jpeg','image/webp'],audio:['audio/mpeg','audio/ogg','audio/wav','audio/webm'],model:['model/gltf-binary','model/gltf+json','application/octet-stream']};
export default async function handler(req,res) {
  if (applyCors(req,res)) return;
  try {
    if (req.method==='GET') {
      if (new URL(req.url,'http://local').searchParams.get('catalog')==='true') {
        const assets=await sql()`SELECT id,asset_type,name,description,public_url,mime_type,byte_size,created_at FROM assets WHERE status='approved' AND public_url IS NOT NULL AND asset_type IN ('model','audio','decal') ORDER BY created_at DESC LIMIT 100`;
        return json(res,200,{assets});
      }
      const user=await requireUser(req,res); if (!user) return;
      const assets=await sql()`SELECT id,asset_type,name,description,public_url,mime_type,byte_size,status,created_at FROM assets WHERE owner_id=${user.id} ORDER BY created_at DESC LIMIT 100`;
      return json(res,200,{assets});
    }
    if (req.method==='POST') {
      const user=await requireUser(req,res), data=body(req); if (!user) return;
      if(user.role==='user'){const [account]=await sql()`SELECT plan FROM users WHERE id=${user.id}`;if(!['neptune','pluto','supernova'].includes(account?.plan))return fail(res,403,'Uploading community assets requires the Neptune plan or above.');}
      const type=String(data.assetType||''), name=String(data.name||'').trim(), mime=String(data.mimeType||''), size=Number(data.byteSize);
      if (!limits[type] || !name || name.length>100 || !(types[type]||[]).includes(mime) || !Number.isSafeInteger(size) || size<1 || size>limits[type]) return fail(res,400,'That file type or size is not allowed.');
      for (const key of ['S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY']) if (!process.env[key]) return fail(res,503,'Bucket storage is not configured. Add S3-compatible credentials to the API environment.');
      const id=uid(), objectKey=`${user.id}/${type}/${randomUUID()}`, client=new S3Client({region:process.env.S3_REGION,endpoint:process.env.S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}});
      const uploadUrl=await getSignedUrl(client,new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:objectKey,ContentType:mime,ContentLength:size}),{expiresIn:300});
      const publicUrl=process.env.S3_PUBLIC_BASE_URL ? `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/,'')}/${objectKey}` : null;
      await sql()`INSERT INTO assets (id,owner_id,asset_type,name,description,object_key,public_url,mime_type,byte_size,status) VALUES (${id},${user.id},${type},${name},${String(data.description||'').slice(0,500)},${objectKey},${publicUrl},${mime},${size},'pending')`;
      return json(res,201,{asset:{id,name,asset_type:type,status:'pending',public_url:publicUrl},uploadUrl,uploadHeaders:{'Content-Type':mime},expiresIn:300});
    }
    return method(req,res,['GET','POST']);
  } catch(error) { return handlerError(res,error); }
}
