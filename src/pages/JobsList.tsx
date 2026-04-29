import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Activity, CheckCircle2, CircleDashed, ServerCrash, Clock, Database, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

interface Task {
  id: string;
  url: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
}

export default function JobsList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const res = await axios.get('/api/tasks');
      setTasks(res.data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'running': return <Activity className="w-4 h-4 text-blue-600 status-pulse" />;
      case 'failed': return <ServerCrash className="w-4 h-4 text-red-600" />;
      default: return <CircleDashed className="w-4 h-4 text-gray-400 animate-spin" />;
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full text-gray-900">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" /> Active Deployments
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Monitor running tasks and extracted data intelligence.</p>
        </div>
        <Link 
          to="/dashboard/build" 
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded hover:bg-blue-700 transition-colors"
        >
          New Deployment
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col flex-1 shadow-sm">
        {loading && tasks.length === 0 ? (
           <div className="p-8 text-center text-gray-500 text-sm mono">Loading telemetry...</div>
        ) : tasks.length === 0 ? (
           <div className="p-16 text-center">
             <Globe className="w-12 h-12 text-gray-400 mx-auto mb-4" />
             <p className="text-gray-500 mb-4 text-sm mono">No agents currently deployed.</p>
             <Link to="/dashboard/build" className="text-blue-600 font-medium hover:underline text-sm">Deploy an agent &rarr;</Link>
           </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wider text-gray-500 font-bold bg-gray-50">
                <th className="px-6 py-4 rounded-tl-xl">Status</th>
                <th className="px-6 py-4">Target Array</th>
                <th className="px-6 py-4">Objective</th>
                <th className="px-6 py-4">Uptime</th>
                <th className="px-6 py-4 text-right rounded-tr-xl">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {tasks.map(task => (
                <tr key={task.id} className="hover:bg-gray-50 transition-colors group cursor-pointer" onClick={() => window.location.href = `/dashboard/jobs/${task.id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-mono text-[11px] font-bold">
                      {getStatusIcon(task.status)}
                      <span className={cn(
                        task.status === 'completed' && "text-green-600",
                        task.status === 'running' && "text-blue-600",
                        task.status === 'failed' && "text-red-600",
                        task.status === 'pending' && "text-gray-400"
                      )}>{task.status.toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-[11px] text-gray-600 truncate max-w-[200px]" title={task.url}>{task.url}</td>
                  <td className="px-6 py-4 truncate max-w-[300px] text-gray-500 text-xs" title={task.goal}>{task.goal}</td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-[10px] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {(Date.now() - task.createdAt) > 60000 ? Math.floor((Date.now() - task.createdAt)/60000) + 'm' : '< 1m'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/dashboard/jobs/${task.id}`} className="text-blue-600 hover:text-blue-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity text-xs">
                      View Logs &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
