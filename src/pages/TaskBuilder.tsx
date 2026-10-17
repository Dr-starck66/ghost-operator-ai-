import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Target, Link as LinkIcon, Cpu, Zap, ArrowRight, CornerDownRight, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

export default function TaskBuilder() {
  const [url, setUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [workflow, setWorkflow] = useState<'site_audit' | 'lead_research' | 'web_research'>('site_audit');
  const [error, setError] = useState('');
  const [token, setToken] = useState(() => sessionStorage.getItem('ghost_admin_token') || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleDeploy = async () => {
    if(!url || !goal || !token) return;
    setIsSubmitting(true);
    setError('');
    try {
       sessionStorage.setItem('ghost_admin_token', token);
       const res = await axios.post('/api/tasks', { url, goal, workflow }, { headers: { 'x-ghost-token': token } });
       navigate(`/dashboard/jobs/${res.data.taskId}`);
    } catch (e) {
       setError(axios.isAxiosError(e) ? (e.response?.data?.error || e.message) : String(e));
       setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto h-full text-gray-900">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 tracking-tight">
          <Cpu className="w-5 h-5 text-blue-600" /> ASTRA Ω — Missions autonomes
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Choisissez une mission : collecte HTTP, analyse, qualification et rapport conservé sur le serveur.</p>
      </div>

      <div className="space-y-8 glass p-8 rounded-xl shadow-sm border border-gray-200">
        
        <div className="space-y-3">
          <label htmlFor="workflow" className="text-xs font-bold text-gray-500 uppercase tracking-wider">Type de mission</label>
          <select id="workflow" value={workflow} onChange={e => setWorkflow(e.target.value as typeof workflow)}
            className="w-full border border-gray-300 bg-white rounded px-4 py-3 text-sm">
            <option value="site_audit">Audit SEO d'un site</option>
            <option value="lead_research">Recherche et qualification de prospects publics</option>
            <option value="web_research">Recherche web sourcée</option>
          </select>
          <p className="text-xs text-gray-500">Aucune action commerciale ni envoi d'email sans votre accord. Jusqu'à 5 pages pour un audit et 3 sites candidats inspectés par mission.</p>
        </div>

        <div className="space-y-3">
          <label htmlFor="admin-token" className="text-xs font-bold text-gray-500 uppercase tracking-wider">Clé privée de votre agent</label>
          <input id="admin-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
            placeholder="Jeton administrateur ASTRA" className="w-full bg-white border border-gray-300 rounded px-4 py-3 text-sm" />
          <p className="text-xs text-gray-500">Stockée uniquement dans cet onglet. Protège les missions et leurs résultats contre les accès publics.</p>
        </div>
        {/* Entry Point */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-2 uppercase tracking-wider">
            <LinkIcon className="w-4 h-4" /> URL de départ
          </label>
          <input 
            type="url" 
            placeholder="https://news.ycombinator.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-4 py-3 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm placeholder:text-gray-400 text-gray-900 shadow-sm"
          />
        </div>

        {/* Brain */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-2 uppercase tracking-wider">
            <Target className="w-4 h-4" /> Objectif de mission
          </label>
          <div className="relative">
            <textarea 
              rows={4}
              placeholder="Ex. : Auditer le référencement de ce site ou rechercher des importateurs de vin d'Occitanie"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded p-4 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm placeholder:text-gray-400 resize-none text-gray-900 shadow-sm"
            />
            <div className="absolute right-3 bottom-3 text-[10px] bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-500 font-mono flex items-center gap-1 uppercase font-bold">
              Instructions <CornerDownRight className="w-3 h-3"/>
            </div>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-700">Erreur : {error}</p>}
        {/* Deploy */}
        <div className="pt-4 flex justify-end border-t border-gray-200">
          <button 
            disabled={!url || !goal || !token || isSubmitting}
            onClick={handleDeploy}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded text-xs font-semibold transition-colors shadow-sm uppercase tracking-wider",
              (!url || !goal || !token || isSubmitting) 
                ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200" 
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin"/> Lancement...</span>
            ) : (
              <span className="flex items-center gap-2"><Zap className="w-4 h-4"/> Démarrer la mission</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
