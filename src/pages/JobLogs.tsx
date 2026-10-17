import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Download, Activity, CheckCircle2, ServerCrash } from 'lucide-react';

export default function JobLogs() {
  const { id } = useParams();
  const [task, setTask] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const { data } = await axios.get('/api/tasks/' + encodeURIComponent(id || ''));
        if (active) { setTask(data); setError(''); }
      } catch (e: any) {
        if (active) setError(e.response?.data?.error || String(e.message || e));
      }
    };
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [id]);

  const download = () => {
    if (!task?.result) return;
    const blob = new Blob([JSON.stringify(task.result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ghost-' + task.id + '.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="p-8 max-w-6xl mx-auto space-y-6 text-gray-900">
      <Link to="/dashboard" className="flex items-center gap-2 text-blue-600"><ChevronLeft className="w-4 h-4"/> All tasks</Link>
      <h1 className="text-lg font-bold">Ghost Operator — server-side execution</h1>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!task && !error && <p>Loading persisted task...</p>}
      {task && (
        <>
          <div className="flex items-center gap-3 border rounded-lg p-4">
            {task.status === 'completed' ? <CheckCircle2 className="text-green-600"/> :
             task.status === 'failed' ? <ServerCrash className="text-red-600"/> : <Activity className="text-blue-600"/>}
            <div><b>{task.status.toUpperCase()}</b><p className="font-mono text-xs break-all">{task.id} · {task.url}</p></div>
          </div>
          <p className="text-sm"><b>Goal:</b> {task.goal}</p>
          {task.error && <p role="alert" className="text-red-700">Execution failed: {task.error}</p>}
          <section className="border rounded-xl p-4">
            <h2 className="font-semibold mb-3">Real server execution logs</h2>
            <pre className="font-mono text-xs whitespace-pre-wrap max-h-80 overflow-auto">{(task.logs || []).join('\n')}</pre>
          </section>
          <section className="border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Persisted output</h2>
              <button onClick={download} disabled={!task.result} className="flex items-center gap-2 text-blue-600 disabled:opacity-40"><Download className="w-4 h-4"/> JSON</button>
            </div>
            <pre className="font-mono text-xs whitespace-pre-wrap break-all max-h-[500px] overflow-auto">{task.result ? JSON.stringify(task.result, null, 2) : 'No completed output yet.'}</pre>
          </section>
        </>
      )}
    </main>
  );
}
