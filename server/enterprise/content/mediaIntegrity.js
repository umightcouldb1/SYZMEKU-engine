const crypto=require('node:crypto');
async function verifyMediaBytes(media,{fetchImpl=fetch}={}){
 const error=code=>{const e=new Error(code);e.statusCode=409;throw e;};
 if(!media?.url||!media.sha256)error('C0_MEDIA_PROOF_REQUIRED');
 const r=await fetchImpl(media.url,{redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!r.ok||!r.body)error('C0_MEDIA_UNAVAILABLE');
 const limit=256*1024*1024;if(Number(r.headers?.get('content-length')||0)>limit){await r.body.cancel();error('C0_MEDIA_TOO_LARGE');}
 const digest=crypto.createHash('sha256');let size=0;for await(const part of r.body){size+=part.length;if(size>limit)error('C0_MEDIA_TOO_LARGE');digest.update(part);}
 if(digest.digest('hex')!==media.sha256)error('C0_MEDIA_CHANGED');return {verified:true,bytes:size};
}
module.exports={verifyMediaBytes};
