import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import axios from 'axios';

type Campaign = {id:string;name:string;reviewStatus:string;discoveryTaskId:string;approved:boolean;
  contacts:number;prospects:number;drafts:number;seedUrl:string;category:string;maxCandidates:number};
type Prospect = {id:string;campaignId:string;website:string;title:string;verdict:string;score:number;sourceUrl:string;reviewStatus:string};
type Dashboard = {status:string;campaigns:Campaign[];prospects:Prospect[];contacts:any[];drafts:any[];queue:any;outboundEnabled:boolean};

const headers=()=>({'x-ghost-token':sessionStorage.getItem('ghost_admin_token')||''});
export default function Campaigns(){
 const [data,setData]=useState<Dashboard|null>(null);
 const [selected,setSelected]=useState('');
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [name,setName]=useState('WINE ELSE — importateurs USA');
 const [seedUrl,setSeedUrl]=useState('');
 const [goal,setGoal]=useState('French wine importers and distributors interested in Occitanie wines');
 const [category,setCategory]=useState('wine');
 const [sector,setSector]=useState('wine');
 const [subject,setSubject]=useState('Partenariat commercial — {{company}} / WINE ELSE');
 const [body,setBody]=useState('Bonjour,\n\nJe vous contacte dans le cadre de WINE ELSE, projet mettant en relation des domaines viticoles d’Occitanie avec des partenaires américains.\n\nUne collaboration pourrait-elle intéresser {{company}} ?\n\nBien cordialement');
 const [senderName,setSenderName]=useState('WINE ELSE');
 const [maxCandidates,setMaxCandidates]=useState(10);
 const [contactJson,setContactJson]=useState('[]');
 const [previews,setPreviews]=useState<any[]>([]);
 const [suppressionEmail,setSuppressionEmail]=useState('');
 const [eventLeadId,setEventLeadId]=useState('');
 const [eventType,setEventType]=useState('reply');
 async function refresh(){
   try{const r=await axios.get('/api/prospect/campaigns',{headers:headers()});setData(r.data);setError('');}
   catch(e:any){setError(e.response?.status===401?'Clé privée requise : ouvrez « Build Agent » pour la saisir.':e.response?.data?.error||'Lecture impossible');}
 }
 useEffect(()=>{refresh();const id=setInterval(refresh,15000);return ()=>clearInterval(id)},[]);
 async function submit(action:()=>Promise<any>,message:string){
   setLoading(true);setError('');
   try{const result=await action();setNotice(message+' '+JSON.stringify(result.data).slice(0,800));await refresh();}
   catch(e:any){setError(e.response?.data?.error||e.message||String(e));}
   finally{setLoading(false);}
 }
 const post=(url:string,body:any={})=>axios.post(url,body,{headers:headers()});
 const current=data?.campaigns.find(c=>c.id===selected);
 const candidates=data?.prospects.filter(p=>p.campaignId===selected)||[];
 const contacts=data?.contacts.filter(c=>c.campaignId===selected)||[];
 return <main className="p-5 md:p-8 max-w-6xl mx-auto space-y-6 text-gray-900">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <div><h1 className="text-xl font-bold">ASTRA Ω — Prospection B2B</h1>
       <p className="text-sm text-gray-600">Recherche → preuves → contacts contrôlés → brouillons → validation explicite</p></div>
     <Link to="/dashboard/build" className="text-blue-700 underline text-sm">Revenir aux missions</Link>
   </div>
   <p className="border p-3 rounded-lg text-amber-800 bg-amber-50 text-sm"><b>Envoi désactivé.</b> Aucun email n’est envoyé par ce module, même après approbation des brouillons. Les adresses doivent être documentées, dédoublonnées et vérifiées séparément.</p>
   {error&&<p role="alert" className="text-red-700 border p-3 rounded-lg">{error}</p>}
   {notice&&<p role="status" className="text-green-800 border p-3 rounded-lg break-words">{notice}</p>}
   <section className="bg-white rounded-xl border p-5 space-y-4">
     <h2 className="font-bold">1. Créer une campagne de prospection</h2>
     <div className="grid md:grid-cols-2 gap-3 text-sm">
       <label>Nom de campagne<input className="w-full border rounded p-2" value={name} onChange={e=>setName(e.target.value)}/></label>
       <label>URL publique de départ<input className="w-full border rounded p-2" type="url" value={seedUrl} onChange={e=>setSeedUrl(e.target.value)} placeholder="https://site-repertoire-professionnel.example"/></label>
       <label>Catégorie<select className="w-full border rounded p-2" value={category} onChange={e=>setCategory(e.target.value)}>
         {['wine','marketing','domains','partnerships','news'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
       <label>Secteur<input className="w-full border rounded p-2" value={sector} onChange={e=>setSector(e.target.value)}/></label>
       <label>Sites candidats (max 25)<input type="number" min="1" max="25" className="w-full border rounded p-2" value={maxCandidates} onChange={e=>setMaxCandidates(Number(e.target.value))}/></label>
       <label>Signature<input className="w-full border rounded p-2" value={senderName} onChange={e=>setSenderName(e.target.value)}/></label>
     </div>
     <label className="block text-sm">Objectif de recherche<textarea className="w-full border rounded p-2" rows={2} value={goal} onChange={e=>setGoal(e.target.value)}/></label>
     <label className="block text-sm">Objet du brouillon<input className="w-full border rounded p-2" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
     <label className="block text-sm">Texte du brouillon<textarea className="w-full border rounded p-2" rows={5} value={body} onChange={e=>setBody(e.target.value)}/></label>
     <button disabled={loading||!seedUrl} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-40"
       onClick={()=>submit(async()=>{const r=await post('/api/prospect/campaigns',{name,seedUrl,goal,category,sector,subject,body,senderName,maxCandidates});setSelected(r.data.campaign.id);return r},'Recherche démarrée :')}>Créer et lancer la recherche</button>
   </section>
   <section className="bg-white rounded-xl border p-5 space-y-3">
     <h2 className="font-bold">2. Campagnes et qualification</h2>
     <select className="w-full border rounded p-3" value={selected} onChange={e=>{setSelected(e.target.value);setPreviews([])}}>
       <option value="">Sélectionnez une campagne</option>
       {data?.campaigns.map(c=><option value={c.id} key={c.id}>{c.name} — {c.reviewStatus} — {c.prospects} sites / {c.contacts} contacts / {c.drafts} brouillons</option>)}
     </select>
     {current&&<div className="space-y-3 text-sm">
       <p>Recherche : <Link className="underline text-blue-700" to={'/dashboard/jobs/'+current.discoveryTaskId}>{current.discoveryTaskId}</Link></p>
       <p>Prospects : {current.prospects} · Contacts : {current.contacts} · Brouillons : {current.drafts} · Statut : <b>{current.reviewStatus}</b></p>
       <button disabled={loading} className="px-3 py-2 bg-blue-600 text-white rounded" onClick={()=>submit(()=>post('/api/prospect/campaigns/'+selected+'/sync'),'Découverte importée :')}>Récupérer les sites analysés</button>
       <div className="overflow-auto border rounded">
         <table className="min-w-full text-left text-sm">
           <thead><tr className="bg-gray-50"><th className="p-2">Site</th><th className="p-2">Statut</th><th className="p-2">Preuve</th></tr></thead>
           <tbody>{candidates.map(p=><tr key={p.id} className="border-t"><td className="p-2"><a className="text-blue-700 underline" href={p.website} target="_blank" rel="noopener noreferrer">{p.title||p.website}</a></td><td className="p-2">{p.verdict}</td><td className="p-2 break-all">{p.sourceUrl}</td></tr>)}</tbody>
         </table>
       </div>
       <h3 className="font-semibold">Importer des contacts professionnels avec provenance</h3>
       <p className="text-gray-600">JSON de 1 à 100 contacts. Champs requis : email, company, sourceUrl (source originale). Pour préparer un brouillon, renseigner aussi un consentement documenté ou une date d'information et une justification de pertinence professionnelle. L'importation ne prouve pas l'autorisation d'envoi.</p>
       <textarea aria-label="Contacts au format JSON" className="w-full p-3 border rounded font-mono text-xs" value={contactJson} rows={4} onChange={e=>setContactJson(e.target.value)}/>
       <div className="flex flex-wrap gap-2">
         <button disabled={loading} className="px-3 py-2 border rounded" onClick={()=>submit(()=>post('/api/prospect/campaigns/'+selected+'/contacts',{contacts:JSON.parse(contactJson)}),'Contrôle des contacts :')}>Contrôler et importer</button>
         <button disabled={loading} className="px-3 py-2 border rounded" onClick={()=>submit(()=>post('/api/prospect/campaigns/'+selected+'/prepare'),'Brouillons :')}>Préparer les brouillons</button>
         <button disabled={loading} className="px-3 py-2 border rounded" onClick={()=>submit(()=>post('/api/prospect/campaigns/'+selected+'/approve',{confirmation:'APPROVE_DRAFTS_ONLY'}),'Brouillons approuvés, envoi toujours désactivé :')}>Approuver les brouillons</button>
         <button disabled={loading} className="px-3 py-2 border rounded" onClick={()=>submit(async()=>{const r=await axios.get('/api/prospect/campaigns/'+selected+'/drafts',{headers:headers()});setPreviews(r.data.drafts);return r},'Aperçu :')}>Afficher les brouillons</button>
       </div>
       <div className="flex flex-wrap gap-2 items-end border rounded p-3">
         <label className="text-xs">Exclure une adresse partout<input type="email" className="block border p-2 rounded" value={suppressionEmail} onChange={e=>setSuppressionEmail(e.target.value)} placeholder="contact@entreprise.com"/></label>
         <button disabled={loading||!suppressionEmail} className="border px-3 py-2 rounded text-red-700" onClick={()=>submit(()=>post('/api/prospect/campaigns/'+selected+'/suppress',{email:suppressionEmail}),'Exclusion enregistrée :')}>Exclure et annuler les brouillons</button>
       </div>
       {previews.length>0&&<button className="border rounded px-3 py-2 text-sm" onClick={()=>{const blob=new Blob([JSON.stringify({campaign:current,drafts:previews},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='astra-campaign-review-'+selected+'.json';a.click();URL.revokeObjectURL(u)}}>Exporter les brouillons validables (JSON)</button>}
       {previews.map(d=><div key={d.id} className="p-3 bg-gray-50 border rounded"><b>{d.subject}</b><p>Destinataire : {d.recipient} — {d.status}</p><p>Consentement vérifié : {String(d.consent?.verified)} · Envoi autorisé : non</p><pre className="whitespace-pre-wrap text-xs">{d.body}</pre></div>)}
       <h3 className="font-semibold">Suivi des réponses et incidents</h3>
       <div className="flex flex-wrap items-end gap-2 text-sm">
         <label>Contact<select value={eventLeadId} onChange={e=>setEventLeadId(e.target.value)} className="block border rounded p-2"><option value="">Choisir un contact</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.company} — {c.email}</option>)}</select></label>
         <label>Événement<select value={eventType} onChange={e=>setEventType(e.target.value)} className="block border rounded p-2">{['reply','qualified','meeting','won','lost','bounce','unsubscribe'].map(t=><option key={t} value={t}>{t}</option>)}</select></label>
         <button disabled={loading||!eventLeadId} className="px-3 py-2 border rounded" onClick={()=>submit(()=>post('/api/prospect/campaigns/'+selected+'/events',{leadId:eventLeadId,type:eventType}),'Événement conservé ; séquence mise à jour :')}>Enregistrer</button>
       </div>
       <h3 className="font-semibold">Contacts contrôlés ({contacts.length})</h3>
       <p className="text-gray-600">{contacts.length?contacts.map(c=>c.company+' ('+c.email+')').slice(0,15).join(' · '):'Aucun contact nominatif automatiquement inventé.'}</p>
     </div>}
   </section>
 </main>;
}
