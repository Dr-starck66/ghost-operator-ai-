'use strict';
const out=document.getElementById('out'),status=document.getElementById('status'),btn=document.getElementById('run');
fetch('/api/nemotron').then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();status.textContent='Serveur : '+j.status+' · '+j.model;}).catch(()=>{status.textContent='Serveur non vérifié / indisponible';});
btn.addEventListener('click',async()=>{
 const field=document.getElementById('key'),key=field.value.trim();
 if(!/^nvapi-[A-Za-z0-9_-]{12,}$/.test(key)){out.textContent='Une clé NVIDIA commençant par nvapi- est nécessaire.';return;}
 btn.disabled=true;out.textContent='Interrogation NVIDIA en cours…';status.textContent='Appel serveur en cours';
 try{
  const res=await fetch('/api/nemotron',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:key})});
  if(!res.ok){const e=await res.json().catch(()=>({error:'ERREUR'}));throw Error(e.error+' (HTTP '+res.status+(e.status?', amont '+e.status:'')+')');}
  const reader=res.body.getReader(),decoder=new TextDecoder();let s='',done=false,finish='',answer='',reasoned=false;
  out.textContent='';
  const parse=(data)=>{if(data==='[DONE]'){done=true;return;}const ev=JSON.parse(data),c=ev.choices?.[0];if(!c)return;if(c.finish_reason)finish=c.finish_reason;if(c.delta?.reasoning_content)reasoned=true;if(typeof c.delta?.content==='string'){answer+=c.delta.content;out.textContent=answer;}};
  while(true){const {value,done:ended}=await reader.read();if(ended)break;s+=decoder.decode(value,{stream:true});s=s.replace(/\r\n/g,'\n');let p;while((p=s.indexOf('\n\n'))>=0){const frame=s.slice(0,p).replace(/\r/g,'');s=s.slice(p+2);const lines=frame.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart());if(lines.length)parse(lines.join('\n'));}}
  if(!done||finish!=='stop'||!answer.trim())throw Error('Réponse incomplète ou invalide, pas de PASS');
  status.textContent='PASS — réponse NVIDIA complète reçue'+(reasoned?' (raisonnement détecté)':'');
 }catch(err){status.textContent='FAIL — inférence non validée';out.textContent=(out.textContent||'')+'\nErreur : '+err.message;}finally{field.value='';btn.disabled=false;}
});
