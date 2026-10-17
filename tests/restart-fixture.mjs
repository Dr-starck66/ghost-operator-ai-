import http from 'node:http';
import { createStore, extractSite } from '../operator-core.mjs';

const store = createStore(process.env.GHOST_TEST_STORE);
store.recover();
let busy = false;
async function consume() {
  if (busy) return;
  busy = true;
  try {
    for (const task of store.list().filter(t => t.status === 'pending')) {
      store.patch(task.id, {status:'running'}, 'Server processing task');
      await new Promise(resolve => setTimeout(resolve, Number(process.env.GHOST_TEST_DELAY || 400)));
      const result = await extractSite(task, async url => ({
        title:'Offline integration fixture', textContent:'Public test document',
        links: url === 'https://example.com/' ? ['https://example.com/about','https://public.org/reference'] : [],
      }));
      store.patch(task.id,{status:'completed',result},'Server completed task');
    }
  } finally {busy = false;}
}
const server = http.createServer(async (req,res) => {
  res.setHeader('content-type','application/json');
  if (req.method === 'POST' && req.url === '/api/tasks') {
    const task=store.add('https://example.com/','Extract external links');
    res.statusCode=202;
    res.end(JSON.stringify({taskId:task.id}));
    void consume();
    return;
  }
  const match=req.url.match(/^\/api\/tasks\/(task_[-a-z0-9]+)$/);
  if (req.method === 'GET' && match) {
    const task=store.get(match[1]);
    res.statusCode = task ? 200 : 404;
    res.end(JSON.stringify(task||{error:'not found'}));
    return;
  }
  res.statusCode=404;
  res.end(JSON.stringify({error:'not found'}));
});
server.listen(0,'127.0.0.1',()=>{console.log('PORT:'+server.address().port);void consume();});
