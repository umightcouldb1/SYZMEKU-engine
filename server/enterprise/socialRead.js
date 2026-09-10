const {decryptToken}=require('../social/tokenCrypto');
const NAMES={post_impressions:'impressions',post_impressions_unique:'reach',post_clicks:'clicks',post_reactions_like_total:'likes',post_comments:'comments',post_shares:'shares',impressions:'impressions',views:'views',reach:'reach',likes:'likes',comments:'comments',saved:'saves',shares:'shares'};
function normalize(raw,provider){
  const metrics={};
  if(provider==='youtube'){
    const stats=raw.items?.[0]?.statistics||{};
    for(const [key,name] of Object.entries({viewCount:'views',likeCount:'likes',commentCount:'comments'}))if(stats[key]!==undefined&&Number.isFinite(Number(stats[key])))metrics[name]=Number(stats[key]);
  }else for(const row of raw.data||[]){const name=NAMES[row.name],value=row.total_value?.value??row.values?.[0]?.value;if(name&&typeof value==='number'&&Number.isFinite(value))metrics[name]=value;}
  return metrics;
}
async function readSocial({db,userId,posts,fetchImpl=fetch,env=process.env}){
  const output=[];
  for(const p of posts.filter(p=>p.publishStatus==='published').slice(0,20)){
    const row={postId:String(p._id),provider:p.provider,metrics:{},status:'UNAVAILABLE',observedAt:new Date().toISOString(),period:'provider lifetime snapshot; not unique cross-platform people'};
    output.push(row);
    const connection=await db.collection('socialconnections').findOne({_id:p.connectedAccountId,userId,active:true},{projection:{accountType:1,encryptedAccessToken:1,tokenExpiresAt:1}});
    if(!connection){row.reason='NO_ACTIVE_OWNED_CONNECTION';continue;}
    if(connection.tokenExpiresAt&&connection.tokenExpiresAt<new Date()){row.reason='ACCESS_TOKEN_EXPIRED_NO_REFRESH_PERFORMED';continue;}
    try{
      const token=decryptToken(connection.encryptedAccessToken);let url;
      if(p.provider==='youtube'){url=new URL('https://www.googleapis.com/youtube/v3/videos');url.searchParams.set('id',p.providerPostId);url.searchParams.set('part','statistics');}
      else if(p.provider==='meta'){
        const version=/^v\d+\.0$/.test(env.META_GRAPH_VERSION||'')?env.META_GRAPH_VERSION:'v24.0';
        if(!/^[0-9_]+$/.test(p.providerPostId))throw Error('Invalid identifier');
        url=new URL(`https://graph.facebook.com/${version}/${p.providerPostId}/insights`);
        url.searchParams.set('metric',connection.accountType==='instagram_professional'?'views,reach,likes,comments,saved,shares':'post_impressions,post_impressions_unique,post_clicks');
      }else{row.reason='PROVIDER_UNAVAILABLE';continue;}
      const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!response.ok){const error=(await response.json().catch(()=>({}))).error||{};row.reason='PROVIDER_HTTP_'+response.status;row.providerCode=Number.isInteger(error.code)?error.code:null;row.classification=/permission|scope/i.test(error.message||'')?'PERMISSION_REQUIRED':/metric/i.test(error.message||'')?'METRIC_UNSUPPORTED':/token/i.test(error.message||'')?'TOKEN_REJECTED':'PROVIDER_REJECTED';continue;}
      const raw=await response.json();row.metrics=normalize(raw,p.provider);row.status=Object.keys(row.metrics).length?'MEASURED':'UNAVAILABLE';
      if(row.status==='UNAVAILABLE')row.reason='NO_RECOGNIZED_METRICS';
    }catch{row.reason='ANALYTICS_READ_FAILED';}
  }
  return output;
}
module.exports={readSocial,normalize};
