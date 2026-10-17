import { useEffect, useState } from 'react';
import axios from 'axios';
import { Network, Play, RefreshCw, ShieldCheck } from 'lucide-react';

type Role = { id: string; role: string; capability: string; enabled: boolean };
type Step = { role: string; status: string; taskId: string; pagesVisited: number; evidenceSha256: string; unverified: number | null; totalIssues: number | null };
type Mission = { id: string; project: string; intent: string; status: string; createdAt: string; plan: string[]; steps: Step[]; taskId: string | null; audit?: { status: string; proofSha256?: string; reason?: string }; ai?: { status: string; answer?: string; answerSha256?: string; reason?: string; model?: string; checkedAt?: string; qualification?: string } };
const presets = [
  { project: 'wine_else', url: 'https://else.wine/', goal: 'Auditer les pages consacrées aux vins d’Occitanie' },
  { project: 'betgpt', url: 'https://betgpt.live/', goal: 'Audit SEO de la page publique et des liens' },
  { project: 'avocat_belgique', url: 'https://avocat-belgique.com/', goal: 'Audit de structure et indexabilité HTML' },
  { project: 'seneque', url: 'https://wyylde-avis.seneque.info/', goal: 'Analyse et audit SEO des pages publiques' }
];

export default function AstraTeam() {
  const [token, setToken] = useState(() => sessionStorage.getItem('ghost_admin_token') || '');
  const [project, setProject] = useState(presets[0].project);
  const [url, setUrl] = useState(presets[0].url);
  const [goal, setGoal] = useState(presets[0].goal);
  const [intent, setIntent] = useState<'seo' | 'prospection' | 'research'>('seo');
  const [roles, setRoles] = useState<Role[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = { 'x-ghost-token': token };
  async function refresh() {
    if (!token) return;
    try {
      const [team, jobs] = await Promise.all([
        axios.get('/api/astra/team', { headers }),
        axios.get('/api/astra/team/missions', { headers })
      ]);
      setRoles(team.data.agents);
      setMissions(jobs.data);
      setError('');
    } catch (e) {
      setError(axios.isAxiosError(e) ? String(e.response?.data?.error || e.message) : String(e));
    }
  }
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [token]);
  async function launch() {
    if (!token || !url || !goal || loading) return;
    setLoading(true); setError('');
    sessionStorage.setItem('ghost_admin_token', token);
    try {
      await axios.post('/api/astra/team/missions', { project, url, goal, intent }, { headers });
      await refresh();
    } catch (e) {
      setError(axios.isAxiosError(e) ? String(e.response?.data?.error || e.message) : String(e));
    } finally { setLoading(false); }
  }
  return <div className="p-8 max-w-5xl mx-auto text-gray-900 space-y-6">
    <header>
      <h1 className="font-bold text-xl flex gap-2 items-center"><Network className="text-blue-600" /> ASTRA MULTI-AGENTS Ω</h1>
      <p className="text-sm text-gray-600">Équipe privée ASTRA : recherche et audit HTML reproductible, puis synthèse NVIDIA Nemotron distincte (au maximum 3 appels IA par jour). Aucun envoi, aucune publication, aucun achat automatique.</p>
    </header>
    <section className="bg-white border rounded-xl p-5 space-y-4">
      <label className="block text-sm font-semibold">Jeton administrateur Ghost Operator
        <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
          className="mt-2 block w-full border rounded p-2 font-normal" placeholder="x-ghost-token" />
      </label>
      <button type="button" onClick={() => { sessionStorage.setItem('ghost_admin_token', token); void refresh(); }}
        className="text-sm border rounded px-3 py-2 flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Actualiser les preuves serveur</button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">Projet
          <select className="block w-full border rounded p-2 mt-1" value={project}
            onChange={e => { const v = e.target.value; setProject(v); const p = presets.find(x => x.project === v); if (p) { setUrl(p.url); setGoal(p.goal); } }}>
            {presets.map(p => <option key={p.project} value={p.project}>{p.project}</option>)}
            <option value="autre_projet">Autre projet ASTRA</option>
          </select>
        </label>
        <label className="text-sm">Équipe / objectif
          <select className="block w-full border rounded p-2 mt-1" value={intent} onChange={e => setIntent(e.target.value as typeof intent)}>
            <option value="seo">Recherche → SEO → audit des preuves</option>
            <option value="prospection">Recherche → qualification → audit des preuves</option>
            <option value="research">Recherche → audit des preuves</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">URL publique de départ
        <input type="url" className="block w-full border rounded p-2 mt-1" value={url} onChange={e => setUrl(e.target.value)} />
      </label>
      <label className="block text-sm">Objectif vérifiable
        <textarea className="block w-full border rounded p-2 mt-1" value={goal} onChange={e => setGoal(e.target.value)} rows={3} maxLength={1600} />
      </label>
      <button type="button" disabled={loading || !token || !url || !goal} onClick={launch}
        className="bg-blue-600 text-white rounded px-4 py-2 flex gap-2 items-center disabled:opacity-50">
        <Play className="w-4 h-4" /> {loading ? 'Enregistrement…' : 'Exécuter en équipe sur le serveur'}
      </button>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    </section>
    <section className="bg-white border rounded-xl p-5">
      <h2 className="font-semibold mb-2">Agents raccordés (sans prétendre aux fonctions non connectées)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        {roles.map(a => <div key={a.id} className="p-2 border rounded"><span className="font-semibold">{a.role}</span>
          <span className={a.enabled ? 'text-green-700 ml-2' : 'text-gray-500 ml-2'}>{a.enabled ? 'RACCORDÉ' : 'NON RACCORDÉ'}</span>
          <p className="text-xs text-gray-500">{a.capability}</p></div>)}
      </div>
    </section>
    <section className="space-y-3">
      <h2 className="font-semibold flex gap-2"><ShieldCheck className="w-5 h-5" /> Missions et preuves persistantes</h2>
      {missions.length === 0 && <p className="text-sm text-gray-500">Aucune mission chargée.</p>}
      {missions.map(m => <article key={m.id} className="bg-white border rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2"><strong>{m.project} / {m.intent}</strong>
          <span className={m.status === 'completed' ? 'text-green-700' : m.status === 'failed' ? 'text-red-700' : 'text-blue-700'}>{m.status.toUpperCase()}</span></div>
        <div className="text-xs text-gray-500 break-all">{m.id} · {m.createdAt}</div>
        <div className="text-xs">{m.plan.join(' → ')} → AUDITOR</div>
        {m.steps.map(s => <div key={s.taskId} className="border-l-2 border-green-600 pl-3">
          <strong>{s.role.toUpperCase()} : {s.status}</strong> · {s.pagesVisited} pages vérifiées
          <p className="font-mono break-all text-xs text-gray-500">Tâche {s.taskId} · SHA {s.evidenceSha256}</p>
          {s.totalIssues !== null && <p>{s.totalIssues} observations techniques</p>}
          {s.unverified !== null && <p>{s.unverified} candidats non vérifiés</p>}
        </div>)}
        {m.audit && <p className={m.audit.status === 'PASS' ? 'text-green-700' : 'text-red-700'}>
          Auditeur : {m.audit.status} {m.audit.reason || ''} · {m.audit.proofSha256 || ''}
        </p>}
        {m.ai && m.ai.status !== 'disabled' && <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
          <h3 className="font-semibold">ASTRA NEMOTRON — Analyse IA : {m.ai.status}</h3>
          <p className="text-xs text-gray-600">Synthèse du modèle distincte des preuves HTTP auditées. Une analyse IA ne valide pas à elle seule un résultat métier.</p>
          {m.ai.answer && <p className="whitespace-pre-wrap break-words">{m.ai.answer}</p>}
          {m.ai.reason && <p className="text-xs text-red-700">{m.ai.reason}</p>}
          {m.ai.answerSha256 && <p className="font-mono text-xs break-all">Empreinte SHA-256 de la synthèse : {m.ai.answerSha256}</p>}
        </div>}
        {m.taskId && <p className="text-xs text-blue-700">Tâche en cours : {m.taskId}</p>
      </article>)}
    </section>
  </div>;
}
