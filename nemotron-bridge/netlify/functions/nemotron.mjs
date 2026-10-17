// ASTRA Ω — Netlify server-side bridge to NVIDIA Nemotron.
const NVIDIA_ENDPOINT='https://integrate.api.nvidia.com/v1/chat/completions';
const DEMO_IMAGE='https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg';
const MODEL='nvidia/nemotron-3.5-super-vl-120b-a12b';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200)=>Response.json(data,{status,headers});
export const config={path:'/api/nemotron',rateLimit:{action:'rate_limit',aggregateBy:'ip',to:'/429',windowSize:60,windowLimit:6}};
export default async function handler(request){
 if(request.method==='GET')return json({service:'ASTRA Ω Nemotron Bridge',status:'ready',source:'netlify',model:MODEL,image:'fixed_nvidia_demo',credentials:'not_stored_on_client'});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return json({error:'ORIGIN_NOT_ALLOWED'},403);
 if(Number(request.headers.get('content-length'))>4096)return json({error:'REQUEST_TOO_LARGE'},413);
 let body;try{const raw=await request.text();if(raw.length>4096)return json({error:'REQUEST_TOO_LARGE'},413);body=JSON.parse(raw);}catch{return json({error:'INVALID_JSON'},400);}
 const submitted=typeof body.apiKey==='string'?body.apiKey.trim():'';
 const serviceKey=typeof Netlify!=='undefined'&&Netlify.env?Netlify.env.get('NVIDIA_API_KEY'):'';
 const access=typeof Netlify!=='undefined'&&Netlify.env?Netlify.env.get('ASTRA_ACCESS_CODE'):'';
 const authorizedEnvironmentKey=!!(serviceKey&&access&&request.headers.get('x-astra-access-code')===access);
 const key=submitted||(authorizedEnvironmentKey?serviceKey:'');
 if(!key||!/^nvapi-[A-Za-z0-9_-]{12,}$/.test(key))return json({error:'NVIDIA_KEY_REQUIRED'},401);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),55000);
 try{
  const upstream=await fetch(NVIDIA_ENDPOINT,{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({
    model:MODEL,messages:[{role:'user',content:[
      {type:'text',text:'Read the traffic sign in this image. What does it say, and what color is the sign?'},
      {type:'image_url',image_url:{url:DEMO_IMAGE}}
    ]}],stream:true,temperature:1,top_p:0.95,max_tokens:3072,seed:42,chat_template_kwargs:{enable_thinking:true}
  })});
  if(!upstream.ok)return json({error:'NVIDIA_UPSTREAM_ERROR',status:upstream.status},502);
  if(!upstream.body)return json({error:'NVIDIA_STREAM_UNAVAILABLE'},502);
  return new Response(upstream.body,{status:200,headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'}});
 }catch{return json({error:'NVIDIA_TIMEOUT_OR_NETWORK_ERROR'},502);}finally{clearTimeout(timeout);}
}
