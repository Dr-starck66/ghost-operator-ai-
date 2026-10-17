import { useEffect, useState } from 'react';
import axios from 'axios';
import { Bot, Send, ShieldCheck, Image as ImageIcon } from 'lucide-react';

type Probe = { provider: string; model: string; configured: boolean; status: string; checkedAt: string | null; httpStatus: number | null; proofId: string | null };
type Answer = { status: string; answer: string; model: string; modality: string; missionId: string; proofSha256: string; persisted: boolean };

export default function Nemotron() {
  const [token, setToken] = useState(() => sessionStorage.getItem('ghost_admin_token') || '');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [probe, setProbe] = useState<Probe | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    axios.get('/api/astra/nemotron/status').then(r => { if (alive) setProbe(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  async function send() {
    if (!token || !prompt.trim() || working) return;
    setWorking(true);
    setError('');
    setAnswer(null);
    sessionStorage.setItem('ghost_admin_token', token);
    try {
      const r = await axios.post('/api/astra/nemotron', { prompt, ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}) },
        { headers: { 'x-ghost-token': token }, timeout: 55000 });
      setAnswer(r.data);
      const p = await axios.get('/api/astra/nemotron/status');
      setProbe(p.data);
    } catch (cause) {
      setError(axios.isAxiosError(cause) ? String(cause.response?.data?.error || cause.message) : String(cause));
    } finally { setWorking(false); }
  }
  return <div className="p-8 max-w-4xl mx-auto text-gray-900 space-y-6">
    <header className="space-y-2">
      <h1 className="font-bold text-xl flex gap-2 items-center"><Bot className="w-6 h-6 text-blue-600" /> ASTRA Nemotron Ω — moteur NVIDIA</h1>
      <p className="text-sm text-gray-600">Inférence texte et image exécutée par Ghost Operator sur Railway. Le secret NVIDIA reste sur le serveur ; les résultats sont conservés dans le volume persistant.</p>
    </header>
    <section className="bg-white border rounded-xl p-4 text-sm">
      <div className="flex gap-2 items-center font-semibold"><ShieldCheck className="w-4 h-4" /> État serveur : {probe?.status || 'UNVERIFIED'}</div>
      <p>Clé NVIDIA configurée : {probe?.configured ? 'oui' : 'non'} · Dernière preuve : {probe?.checkedAt || 'non disponible'} · HTTP : {probe?.httpStatus || '—'}</p>
      <p className="text-xs text-gray-500">Preuve enregistrée : {probe?.proofId || 'aucune'}. L'état n'est PASS que si une véritable réponse NVIDIA a été obtenue.</p>
    </section>
    <section className="bg-white border rounded-xl p-6 space-y-4">
      <label className="block text-sm font-semibold">Jeton administrateur Ghost Operator
        <input type="password" autoComplete="off" className="mt-2 w-full border rounded px-3 py-2 font-normal"
          value={token} onChange={e => setToken(e.target.value)} placeholder="Même jeton que pour les missions" />
      </label>
      <label className="block text-sm font-semibold">Instruction
        <textarea rows={5} maxLength={6000} className="mt-2 w-full border rounded px-3 py-2 font-normal"
          value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Analyse ce document ou réponds à cette question…" />
      </label>
      <label className="block text-sm font-semibold flex gap-2 items-center"><ImageIcon className="w-4 h-4" /> Image distante (HTTPS, facultative)</label>
      <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="https://exemple.fr/photo.jpg" />
      <button type="button" onClick={send} disabled={!token || !prompt.trim() || working || !probe?.configured}
        className="inline-flex gap-2 items-center bg-blue-600 text-white px-5 py-2 rounded disabled:bg-gray-300">
        <Send className="w-4 h-4" /> {working ? 'Inférence NVIDIA…' : 'Exécuter sur le serveur'}
      </button>
      {error && <p role="alert" className="text-red-700 text-sm">Échec : {error}</p>}
    </section>
    {answer && <section className="bg-white border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold">Réponse NVIDIA vérifiée</h2>
      <pre className="whitespace-pre-wrap break-words text-sm font-sans">{answer.answer}</pre>
      <p className="text-xs text-gray-500">Modèle : {answer.model} · Mission : {answer.missionId} · Sauvegardé : {String(answer.persisted)}</p>
      <p className="text-xs text-gray-400 font-mono break-all">SHA-256 : {answer.proofSha256}</p>
    </section>}
  </div>;
}
