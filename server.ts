import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Task Queue Database
interface Task {
  id: string;
  url: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  logs: string[];
  result?: any;
}

const tasks: Record<string, Task> = {};

app.post('/api/tasks', (req, res) => {
  const { url, goal } = req.body;
  if (!url || !goal) {
    res.status(400).json({ error: 'URL and goal are required' });
    return;
  }

  const taskId = `task_${Math.random().toString(36).substring(2, 9)}`;
  tasks[taskId] = {
    id: taskId,
    url,
    goal,
    status: 'pending',
    createdAt: Date.now(),
    logs: ['Task registered.'],
  };

  res.json({ taskId, status: 'pending' });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks[req.params.id];
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(task);
});

app.get('/api/tasks', (req, res) => {
  const allTasks = Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt);
  res.json(allTasks);
});

app.put('/api/tasks/:id', (req, res) => {
  const task = tasks[req.params.id];
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const { status, result, logMessage } = req.body;
  
  if (status) task.status = status;
  if (result) task.result = result;
  if (logMessage) {
    task.logs.push(`${new Date().toISOString()} - ${logMessage}`);
  }
  
  res.json(task);
});

app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract links before removing elements
    const links: string[] = [];
    $('a').each((_, el) => {
      let href = $(el).attr('href');
      if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:')) {
         try {
           const absoluteUrl = new URL(href, url).href;
           links.push(absoluteUrl);
         } catch (e) {
           // ignore invalid URLs
         }
      }
    });

    // Clean up HTML to reduce token usage
    $('script, style, link, img, svg, iframe, noscript').remove();
    
    // Inject hrefs into the text content so the LLM can see the actual URLs
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !href.startsWith('mailto:')) {
         try {
           const absoluteUrl = new URL(href, url).href;
           $(el).append(` [URL: ${absoluteUrl}] `);
         } catch (e) {}
      }
    });

    let textContent = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Truncate to avoid massive payloads
    if (textContent.length > 50000) {
      textContent = textContent.substring(0, 50000) + '... (truncated)';
    }
    
    res.json({ textContent, links: [...new Set(links)] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

async function startServerInner() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ghost Operator AI Runtime listening on http://localhost:${PORT}`);
  });
}

startServerInner();
