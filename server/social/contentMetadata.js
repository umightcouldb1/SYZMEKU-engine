function hashtags(values){return [...new Set((Array.isArray(values)?values:[]).map(v=>String(v).trim().replace(/^#+/,'')).filter(v=>/^[\p{L}\p{N}_]+$/u.test(v)))].map(v=>'#'+v);}
function captionWithTags(caption,values){const text=String(caption||'');const existing=new Set((text.match(/#[\p{L}\p{N}_]+/gu)||[]).map(v=>v.toLowerCase()));const tags=hashtags(values).filter(t=>!existing.has(t.toLowerCase()));return [text,tags.join(' ')].filter(Boolean).join('\n\n');}
module.exports={hashtags,captionWithTags};
