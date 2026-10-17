import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createTaskStore({ filePath, execute, autoStart = true }) {
  if (!filePath || typeof execute !== 'function') throw new Error('Task store requires a durable path and executor');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let tasks = Object.create(null);
  if (fs.existsSync(filePath)) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
      throw new Error('Invalid persisted task database. Refusing to overwrite');
    }
    for (const task of parsed.tasks) {
      if (task && typeof task.id === 'string') {
        tasks[task.id] = task;
        if (task.status === 'running') {
          task.status = 'pending';
          task.logs.push('Recovered interrupted task after server restart');
        }
      }
    }
  }
  const save = () => {
    const temp = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify({ version: 1, tasks: Object.values(tasks) }, null, 2), { mode: 0o600 });
      fs.renameSync(temp, filePath);
    } finally {
      if (fs.existsSync(temp)) fs.rmSync(temp);
    }
  };
  save();
  let executing = false;
  let scheduled = false;
  let closed = false;
  const list = () => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt).map(t => structuredClone(t));
  const get = id => tasks[id] ? structuredClone(tasks[id]) : null;
  const update = (id, patch, note) => {
    const task = tasks[id];
    if (!task) throw new Error('Task does not exist');
    Object.assign(task, patch);
    if (note) task.logs.push(new Date().toISOString() + ' ' + note);
    if (task.logs.length > 200) task.logs.splice(0, task.logs.length - 200);
    task.updatedAt = Date.now();
    save();
  };
  const drain = async () => {
    scheduled = false;
    if (closed || executing) return;
    const task = Object.values(tasks).filter(t => t.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!task) return;
    executing = true;
    try {
      update(task.id, { status: 'running', startedAt: Date.now() }, 'Started in server worker');
      const result = await execute(structuredClone(task), note => update(task.id, {}, note));
      update(task.id, { status: 'completed', finishedAt: Date.now(), result }, 'Finished with actual execution result');
    } catch (error) {
      update(task.id, { status: 'failed', finishedAt: Date.now(), error: String(error?.message || error) }, 'Execution failed (no false PASS)');
    } finally {
      executing = false;
      schedule();
    }
  };
  function schedule() {
    if (!closed && !scheduled && !executing) {
      scheduled = true;
      setImmediate(drain);
    }
  }
  const add = (rawUrl, rawGoal, workflow = 'web_research') => {
    const url = new URL(rawUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public HTTP(S) URLs are allowed');
    if (typeof rawGoal !== 'string' || !rawGoal.trim() || rawGoal.length > 2000) throw new Error('Invalid goal');
    if (!['site_audit', 'lead_research', 'web_research'].includes(workflow)) throw new Error('Unsupported workflow');
    if (Object.keys(tasks).length >= 2000) throw new Error('Queue capacity reached');
    const id = 'task_' + randomUUID();
    tasks[id] = { id, url: url.href, goal: rawGoal.trim(), workflow, status: 'pending', logs: ['Task persisted on server'], createdAt: Date.now() };
    try { save(); } catch (error) { delete tasks[id]; throw error; }
    schedule();
    return get(id);
  };
  if (autoStart) schedule();
  return { add, get, list, resume: schedule, close: () => { closed = true; }, status: () => ({ total: Object.keys(tasks).length, executing, pending: Object.values(tasks).filter(x => x.status === 'pending').length, durablePath: filePath }) };
}
