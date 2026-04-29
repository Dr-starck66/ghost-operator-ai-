import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, Code, Download, TerminalSquare, Activity, CheckCircle2, ServerCrash } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { cn } from '../lib/utils';

function DataRenderer({ data }: { data: any }) {
  if (data === null || data === undefined) return <span className="text-gray-400 italic">null</span>;
  
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) {
      return (
        <a href={data} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-500 hover:underline break-all">
          {data}
        </a>
      );
    }
    return <span className="text-gray-700">{data}</span>;
  }
  
  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span className="text-emerald-600">{String(data)}</span>;
  }
  
  if (Array.isArray(data)) {
    return (
      <div className="flex flex-col gap-3 w-full mt-1 mb-2">
        {data.map((item, idx) => (
          <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
             <DataRenderer data={item} />
          </div>
        ))}
      </div>
    );
  }
  
  if (typeof data === 'object') {
    return (
      <div className="flex flex-col gap-2 w-full">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 w-full border-b border-gray-100 last:border-0 pb-2 last:pb-0">
             <div className="text-gray-500 min-w-32 text-xs uppercase tracking-wider font-semibold mt-0.5">{key}</div>
             <div className="flex-1 break-words text-sm">{value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value) ? <div className="mt-2"><DataRenderer data={value} /></div> : <DataRenderer data={value} />}</div>
          </div>
        ))}
      </div>
    );
  }
  
  return null;
}

export default function JobLogs() {
  const { id } = useParams();
  const [task, setTask] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchTask = async () => {
    try {
      const res = await axios.get(`/api/tasks/${id}`);
      setTask(res.data);
    } catch(e) {
      console.error(e);
    }
  };
  
  const updateTask = async (updates: any) => {
    try {
      await axios.put(`/api/tasks/${id}`, updates);
      fetchTask();
    } catch (e) {
      console.error(e);
    }
  };

  const executeTask = async (currentTask: any) => {
    if (isExecuting) return;
    setIsExecuting(true);
    
    await updateTask({ status: 'running', logMessage: `[INIT] Starting execution for URL: ${currentTask.url}` });
    await updateTask({ logMessage: `[GOAL] ${currentTask.goal}` });
    
    try {
      await updateTask({ logMessage: `[OBSERVE] Crawling site up to 10 pages via proxy worker...` });
      
      const visited = new Set<string>();
      const queue = [currentTask.url];
      const maxPages = 10;
      let allText = "";
      const allLinks = new Set<string>();
      let baseUrl = "";
      try {
        baseUrl = new URL(currentTask.url).origin;
      } catch(e) { /* ignore */ }
      
      while (queue.length > 0 && visited.size < maxPages) {
        const urlToVisit = queue.shift()!;
        if (visited.has(urlToVisit)) continue;
        visited.add(urlToVisit);
        
        await updateTask({ logMessage: `[OBSERVE] Crawling page ${visited.size}/${maxPages}: ${urlToVisit}` });
        
        try {
          const scrapeRes = await axios.post('/api/scrape', { url: urlToVisit });
          allText += `\n\n--- PAGE: ${urlToVisit} ---\n` + scrapeRes.data.textContent.substring(0, 5000);
          
          const pageLinks: string[] = scrapeRes.data.links || [];
          for (const link of pageLinks) {
             allLinks.add(link);
             if (baseUrl && link.startsWith(baseUrl) && !visited.has(link) && !queue.includes(link)) {
                 queue.push(link);
             }
          }
        } catch(e) {
          await updateTask({ logMessage: `[WARNING] Failed to fetch ${urlToVisit}` });
        }
      }
      
      await updateTask({ logMessage: `[OBSERVE] Extracted ${allText.length} characters of text and ${allLinks.size} links across ${visited.size} pages.` });
      
      await updateTask({ logMessage: `[THINK] Analyzing site structure and extracting requested data...` });
      
      const externalLinks = Array.from(allLinks).filter(link => {
          if (!baseUrl) return true;
          if (!link.startsWith(baseUrl)) return true;
          
          // Also include internal tracking/affiliate redirects
          try {
             const path = new URL(link).pathname.toLowerCase();
             if (path.includes('/go/') || path.includes('/out/') || path.includes('/exit/') || path.includes('/visit/') || path.includes('/track/') || path.includes('/redirect/')) {
                 return true;
             }
          } catch(e) {}
          
          return false;
      });
      
      const goalLower = currentTask.goal.toLowerCase();
      const isExtractingLinksOnly = goalLower.includes('liens externes') || goalLower.includes('external links') || goalLower.includes('externals links');
      
      let extractedData: any;

      // Use the free API key provided by AI Studio in the frontend bundle
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      if (isExtractingLinksOnly && externalLinks.length > 5) {
          await updateTask({ logMessage: `[THINK] Large link extraction detected. Grouping ${externalLinks.length} external links by domain to prevent truncation...` });
          
          const linksByDomain: Record<string, string[]> = {};
          externalLinks.forEach((link: string) => {
             try {
                const domain = new URL(link).hostname.replace(/^www\./, '');
                if (!linksByDomain[domain]) linksByDomain[domain] = [];
                if (!linksByDomain[domain].includes(link)) {
                   linksByDomain[domain].push(link);
                }
             } catch(e) {}
          });

          const domains = Object.keys(linksByDomain);
          await updateTask({ logMessage: `[THINK] Found ${domains.length} unique external domains. Asking AI to classify them...` });

          const domainPrompt = `
You are Ghost Operator AI. 
The user's goal is: "${currentTask.goal}"

Classify the following domains into one of these specific categories based on typical internet traffic:
- "Affiliate / Tracking / Ad Networks"
- "Social Media"
- "Reference / External Content"
- "Sponsor / Partner"
- "Other"

DOMAINS:
${domains.join('\n')}

Return ONLY a JSON map where the key is the domain and the value is a JSON object. Provide a 'category', and if it's an affiliate/tracking domain, also provide a 'guess_destination' if you recognize the network.
Do not include markdown blocks. Example:
{
  "facebook.com": {"category": "Social Media"},
  "singlesgetmatched.com": {"category": "Affiliate / Tracking / Ad Networks"}
}
`;
          
          try {
             const result = await ai.models.generateContent({
               model: "gemini-3.1-pro-preview",
               contents: domainPrompt,
               config: { responseMimeType: "application/json" }
             });

             const classification = JSON.parse(result.text || "{}");
             
             // Build final result
             const finalResults = [];
             for (const domain of domains) {
                const links = linksByDomain[domain];
                const catInfo = classification[domain] || { category: "Other" };
                
                finalResults.push({
                   category: catInfo.category,
                   domain: domain,
                   total_links_found: links.length,
                   affiliate_network_info: catInfo.guess_destination,
                   all_urls: links
                });
             }
             
             // Sort by Category to group Affiliates at top usually
             finalResults.sort((a, b) => a.category.localeCompare(b.category));

             extractedData = { 
                "total_unique_external_links": externalLinks.length,
                "categories": finalResults 
             };
             
             await updateTask({ logMessage: `[DECIDE] Successfully classified domains and assembled all ${externalLinks.length} links into structured JSON.` });
          } catch(e: any) {
             await updateTask({ logMessage: `[WARNING] Classification parsing failed: ${e.message}. Returning raw links.` });
             extractedData = { results: externalLinks };
          }
      } else {
        const extractionPrompt = `
You are Ghost Operator AI, an autonomous data extraction agent.
Your goal is to fulfill the user's objective based on the provided website content and links.

GOAL: ${currentTask.goal}

Important Instructions:
- Extract the relevant information requested in the GOAL.
- If the goal involves extracting links, you MUST process the ENTIRE list of "EXTERNAL LINKS IDENTIFIED" below and include EVERY SINGLE MATCHING LINK in your JSON response. DO NOT summarize, skip, or provide just one example.
- For each link, provide the original \`url\`. If the link appears to be an affiliate link or tracking link, do your best to also guess or provide the \`destination_url\` to the affiliate program or final destination if possible. Also provide a \`type\` field (e.g., "affiliate", "social", "reference", etc.).
- Respond with ONLY raw JSON, do not wrap it in a markdown block.
- Format the output as a JSON object containing a single array: { "results": [ ... ] }.

EXTERNAL LINKS IDENTIFIED:
${externalLinks.join('\n')}

WEBSITE CONTENT SUMMARY:
${allText.substring(0, 30000)}
        `;

        const result = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: extractionPrompt,
          config: {
            responseMimeType: "application/json"
          }
        });
        
        await updateTask({ logMessage: `[DECIDE] Data structure parsed successfully.` });
        
        const textResponse = result.text || "";
        try {
          extractedData = JSON.parse(textResponse.trim());
        } catch (e) {
          extractedData = { raw_output: textResponse.trim() };
          await updateTask({ logMessage: `[WARNING] Failed to parse JSON strictly. Raw output captured.` });
        }
      }
      
      await updateTask({ logMessage: `[EXECUTE] Executing data extraction mapping...` });
      
      await updateTask({ 
        status: 'completed', 
        result: extractedData,
        logMessage: `[SUCCESS] Task completed successfully.`
      });

    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || String(error);
      await updateTask({ 
        status: 'failed', 
        logMessage: `[ERROR] Execution failed: ${errorMessage}` 
      });
      await updateTask({ logMessage: `[HEALING] Initiating auto-repair logic... but max retries reached.` });
    }
  };

  useEffect(() => {
    fetchTask();
    const interval = setInterval(() => {
       setTask((currentTask: any) => {
         if (!currentTask || currentTask.status === 'running' || currentTask.status === 'pending') {
           fetchTask();
         }
         return currentTask;
       });
    }, 2000);
    return () => clearInterval(interval);
  }, [id]);
  
  useEffect(() => {
    if (task && task.status === 'pending' && !isExecuting) {
      executeTask(task);
    }
  }, [task, isExecuting]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [task?.logs]);

  if (!task) {
    return <div className="p-8 text-gray-500 font-mono text-sm">Initializing connection...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto h-[calc(100vh-64px)] flex flex-col text-gray-900">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-500 hover:text-gray-900">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 tracking-tight">
              <TerminalSquare className="w-4 h-4 text-blue-600" /> {task.id}
            </h1>
            <p className="text-gray-500 text-[10px] mt-1 truncate max-w-md font-mono">{task.url}</p>
          </div>
        </div>
        <div className="flex gap-3 items-center">
           {task.status === 'running' && <span className="flex items-center gap-2 text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono"><Activity className="w-3 h-3 status-pulse"/> Executing</span>}
           {task.status === 'completed' && <span className="flex items-center gap-2 text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono"><CheckCircle2 className="w-3 h-3"/> Success</span>}
           {task.status === 'failed' && <span className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono"><ServerCrash className="w-3 h-3"/> Failed</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-6">
        {/* Terminal Logs */}
        <div className="flex-1 glass rounded-xl overflow-hidden flex flex-col">
          <div className="h-10 border-b border-gray-200 bg-gray-50 flex items-center px-4">
             <div className="flex gap-1.5">
               <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
               <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
               <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
             </div>
             <div className="mx-auto text-[10px] uppercase font-bold tracking-wider text-gray-500 pl-4">Agent Reasoning</div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-auto p-4 font-mono text-[11px] text-gray-700 space-y-4">
            {task.logs.map((log: string, idx: number) => {
              const isError = log.includes('[ERROR]');
              const isSuccess = log.includes('[SUCCESS]');
              const isWarning = log.includes('[WARNING]');
              const isObserve = log.includes('[OBSERVE]');
              const isThink = log.includes('[THINK]');
              const isDecide = log.includes('[DECIDE]');
              const isExecute = log.includes('[EXECUTE]');
              const timestampMatch = log.match(/^\[(task_[^\]]+)\] (.*)$/);
              let content = log;
              let timestamp = '[LIVE]';
              
              if (timestampMatch) {
                timestamp = `[${new Date().toLocaleTimeString('en-US', { hour12: false })}]`;
                content = timestampMatch[2];
              } else {
                 const generalTimeMatch = log.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) - (.*)$/);
                 if (generalTimeMatch) {
                    timestamp = `[${new Date(generalTimeMatch[1]).toLocaleTimeString('en-US', { hour12: false })}]`;
                    content = generalTimeMatch[2];
                 }
              }

              return (
                <div key={idx} className={cn(
                  "break-all flex flex-col sm:flex-row sm:gap-2",
                  isError ? "text-red-600" : isSuccess ? "text-green-600 font-bold" : isWarning ? "text-yellow-600 bg-yellow-50 border border-yellow-200 p-2 rounded" : "text-gray-500"
                )}>
                  <span className="text-blue-500 shrink-0">{timestamp}</span>
                  <span className={cn(
                       "flex-1", 
                       (isObserve || isThink || isExecute || isDecide) && "text-gray-700"
                  )}>
                      {content.replace(/\[(OBSERVE|THINK|DECIDE|EXECUTE)\]/, (match, group) => {
                          return `<span class="text-gray-900 font-bold">${group}:</span>`;
                      }).split('<span class="text-gray-900 font-bold">').map((part, i) => {
                          if (i === 0) return part;
                          const splitPart = part.split('</span>');
                          return <span key={i}><span className="text-gray-900 font-bold">{splitPart[0]}</span>{splitPart[1]}</span>;
                      })}
                  </span>
                </div>
              );
            })}
            {task.status === 'running' && (
              <div className="animate-pulse text-gray-400">_</div>
            )}
          </div>
        </div>

        {/* Database Output */}
        <div className="w-1/2 glass rounded-xl overflow-hidden flex flex-col pt-0">
           <div className="h-10 border-b border-gray-200 flex items-center justify-between px-4 bg-gray-50">
             <div className="font-bold text-[10px] flex items-center gap-2 text-gray-500 uppercase tracking-wider">Extract Data</div>
             <button disabled={!task.result} onClick={() => {
                const blob = new Blob([JSON.stringify(task.result, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `extraction-${task.id}.json`;
                a.click();
             }} className="disabled:opacity-50 text-blue-600 hover:text-blue-500">
               <Download className="w-3.5 h-3.5" />
             </button>
           </div>
           <div className="flex-1 overflow-auto p-4 bg-white/50 max-w-full">
             {task.result ? (
               <DataRenderer data={task.result} />
             ) : (
               <div className="h-full flex items-center justify-center text-gray-400 text-xs italic mono">
                  Awaiting payload...
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
