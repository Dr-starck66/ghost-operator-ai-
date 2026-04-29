import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Target, Link as LinkIcon, Cpu, Zap, ArrowRight, CornerDownRight, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

export default function TaskBuilder() {
  const [url, setUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleDeploy = async () => {
    if(!url || !goal) return;
    setIsSubmitting(true);
    try {
       const res = await axios.post('/api/tasks', { url, goal });
       navigate(`/dashboard/jobs/${res.data.taskId}`);
    } catch (e) {
       console.error("Failed to deploy task", e);
       setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto h-full text-gray-900">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 tracking-tight">
          <Cpu className="w-5 h-5 text-blue-600" /> Assemble Agent
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Describe the target intelligence you need acquired.</p>
      </div>

      <div className="space-y-8 glass p-8 rounded-xl shadow-sm border border-gray-200">
        
        {/* Entry Point */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-gray-500 flex items-center gap-2 uppercase tracking-wider">
            <LinkIcon className="w-4 h-4" /> Target URL
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
            <Target className="w-4 h-4" /> Extraction Protocol
          </label>
          <div className="relative">
            <textarea 
              rows={4}
              placeholder="e.g. Extract the titles, links, and points for the top 10 articles on the page. Format as an array of JSON objects."
              value={goal}
              onChange={e => setGoal(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded p-4 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm placeholder:text-gray-400 resize-none text-gray-900 shadow-sm"
            />
            <div className="absolute right-3 bottom-3 text-[10px] bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-500 font-mono flex items-center gap-1 uppercase font-bold">
              Natural Language <CornerDownRight className="w-3 h-3"/>
            </div>
          </div>
        </div>

        {/* Deploy */}
        <div className="pt-4 flex justify-end border-t border-gray-200">
          <button 
            disabled={!url || !goal || isSubmitting}
            onClick={handleDeploy}
            className={cn(
              "flex items-center gap-2 px-6 py-2 rounded text-xs font-semibold transition-colors shadow-sm uppercase tracking-wider",
              (!url || !goal || isSubmitting) 
                ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200" 
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin"/> Booting Agent...</span>
            ) : (
              <span className="flex items-center gap-2"><Zap className="w-4 h-4"/> Deploy to Workers</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
