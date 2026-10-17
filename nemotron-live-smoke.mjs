// Manual live smoke (NOT run by npm test). NVIDIA_API_KEY required. Never print the key.
import { NVIDIA_MODEL, NVIDIA_URL } from './nemotron-adapter.mjs';
const key=process.env.NVIDIA_API_KEY;
if(!key){console.error('UNVERIFIED: NVIDIA_API_KEY is not configured.');process.exitCode=2;}
else {
  const samples=[{name:'text',content:[{type:'text',text:'Reply with ASTRA_NEMOTRON_READY.'}]}];
  if(process.env.NVIDIA_LIVE_VISION==='1') samples.push({name:'image',content:[
    {type:'text',text:'Describe the traffic sign in this image with one sentence.'},
    {type:'image_url',image_url:{url:'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg'}}
  ]});
  for(const sample of samples){
    const start=performance.now();
    try{
      const response=await fetch(NVIDIA_URL,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({model:NVIDIA_MODEL,messages:[{role:'user',content:sample.content}],max_tokens:4096,temperature:0.6,top_p:0.95,stream:false,chat_template_kwargs:{enable_thinking:false}}),
        signal:AbortSignal.timeout(60000)});
      if(!response.ok){console.log(JSON.stringify({case:sample.name,status:'FAIL',http:response.status}));process.exitCode=1;continue;}
      const payload=await response.json(),content=payload?.choices?.[0]?.message?.content;
      if(typeof content!=='string'||!content.trim()){console.log(JSON.stringify({case:sample.name,status:'FAIL',reason:'no final text'}));process.exitCode=1;continue;}
      console.log(JSON.stringify({case:sample.name,status:'PASS',elapsed_ms:Math.round(performance.now()-start),output:content.slice(0,300),tokens:payload?.usage?.total_tokens??null}));
    }catch{console.log(JSON.stringify({case:sample.name,status:'FAIL',reason:'timeout or network error'}));process.exitCode=1;}
  }
}
