// Workspace draft preparation only. No Gemini/Veo generation or paid endpoint.
// Existing Academy Google login does not grant Drive/Slides scopes.
async function google(token,path,{method='GET',body,fetchImpl=fetch}={}){
 if(!token){const e=new Error('GOOGLE_WORKSPACE_CONNECTION_REQUIRED');e.statusCode=409;throw e;}
 const r=await fetchImpl('https://'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!r.ok){const e=new Error('GOOGLE_WORKSPACE_HTTP_'+r.status);e.statusCode=502;throw e;}return r.json();
}
async function createSlides({token,package:p,fetchImpl=fetch}){
 const request=(path,options={})=>google(token,path,{...options,fetchImpl});
 const created=await request('slides.googleapis.com/v1/presentations',{method:'POST',body:{title:'C0 DRAFT · '+p.title}}),id=created.presentationId;
 const requests=[];
 const color=hex=>({red:parseInt(hex.slice(1,3),16)/255,green:parseInt(hex.slice(3,5),16)/255,blue:parseInt(hex.slice(5,7),16)/255});
 p.scenes.forEach((scene,i)=>{const slideId='c0_scene_'+i,textId='c0_copy_'+i;requests.push({createSlide:{objectId:slideId,slideLayoutReference:{predefinedLayout:'BLANK'}}},{updatePageProperties:{objectId:slideId,pageProperties:{pageBackgroundFill:{solidFill:{color:{rgbColor:color(p.visual.tokens.black)},alpha:1}}},fields:'pageBackgroundFill'}},{createShape:{objectId:textId,shapeType:'TEXT_BOX',elementProperties:{pageObjectId:slideId,size:{width:{magnitude:620,unit:'PT'},height:{magnitude:320,unit:'PT'}},transform:{scaleX:1,scaleY:1,translateX:50,translateY:40,unit:'PT'}}}},{insertText:{objectId:textId,text:scene.screen,insertionIndex:0}},{updateTextStyle:{objectId:textId,textRange:{type:'ALL'},style:{fontFamily:'Arial',bold:true,foregroundColor:{opaqueColor:{rgbColor:color(p.visual.tokens.white)}},fontSize:{magnitude:28,unit:'PT'}},fields:'fontFamily,fontSize,bold,foregroundColor'}});});
 await request(`slides.googleapis.com/v1/presentations/${id}:batchUpdate`,{method:'POST',body:{requests}});
 const presentation=await request(`slides.googleapis.com/v1/presentations/${id}?fields=slides(objectId,slideProperties(notesPage(notesProperties(speakerNotesObjectId))))`);
 const notes=presentation.slides.map((s,i)=>({insertText:{objectId:s.slideProperties.notesPage.notesProperties.speakerNotesObjectId,text:p.scenes[i].narration,insertionIndex:0}}));
 await request(`slides.googleapis.com/v1/presentations/${id}:batchUpdate`,{method:'POST',body:{requests:notes}});
 return {presentationId:id,url:`https://docs.google.com/presentation/d/${id}/edit`,status:'SLIDES_DRAFT_CREATED',next:'Import these slides in Google Vids. Verify portrait framing and exact timings; choose only already-authorized audio. Vids timeline assembly remains interactive.'};
}
async function requestVidsDownload({token,fileId,fetchImpl=fetch}){
 if(!/^[a-zA-Z0-9_-]{10,150}$/.test(fileId)){const e=new Error('INVALID_GOOGLE_FILE_ID');e.statusCode=400;throw e;}
 const metadata=await google(token,`www.googleapis.com/drive/v3/files/${fileId}?fields=id,mimeType`,{fetchImpl});
 if(metadata.mimeType!=='application/vnd.google-apps.vid'){const e=new Error('GOOGLE_VIDS_FILE_REQUIRED');e.statusCode=400;throw e;}
 return google(token,`www.googleapis.com/drive/v3/files/${fileId}/download?mimeType=video/mp4`,{method:'POST',fetchImpl});
}
module.exports={createSlides,requestVidsDownload};

