/* ShopAgent local AI model manager.
 * Browser models execute locally through Transformers.js/ONNX Runtime.
 * No AI API key is required. Models can be cached in the browser.
 */
import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = true;

export type BrowserModel = {
  id: string;
  name: string;
  size: string;
  task: string;
  device: 'webgpu' | 'wasm';
  dtype: string;
  source: string;
};

// Only models with documented Transformers.js/ONNX browser support are listed here.
export const BROWSER_MODELS: BrowserModel[] = [
  { id:'onnx-community/Qwen3-0.6B-ONNX', name:'Qwen3 0.6B', size:'~0.6B', task:'text-generation', device:'webgpu', dtype:'q4f16', source:'Hugging Face / ONNX Community' },
  { id:'onnx-community/granite-4.0-350m-ONNX-web', name:'Granite 4.0 350M', size:'350M', task:'text-generation', device:'webgpu', dtype:'q4f16', source:'Hugging Face / ONNX Community' },
  { id:'Xenova/LaMini-Flan-T5-77M', name:'LaMini-Flan-T5 77M', size:'77M', task:'text2text-generation', device:'wasm', dtype:'q4', source:'Hugging Face / Xenova' },
];

let generator: any = null;
let loading: Promise<any> | null = null;
let activeModel = typeof window !== 'undefined' ? localStorage.getItem('shopagent_local_model') || BROWSER_MODELS[0].id : BROWSER_MODELS[0].id;

export function getBrowserModels(){ return BROWSER_MODELS; }
export function getSelectedBrowserModel(){ return activeModel; }
export function setSelectedBrowserModel(id:string){
  if (!BROWSER_MODELS.some(m=>m.id===id)) throw new Error('Unsupported browser model');
  activeModel=id; generator=null; loading=null;
  if(typeof window!=='undefined') localStorage.setItem('shopagent_local_model',id);
}

export async function localAIStatus() {
  const model=BROWSER_MODELS.find(m=>m.id===activeModel) || BROWSER_MODELS[0];
  return { provider:'embedded-local', model:model.id, name:model.name, no_api_key:true, browser_inference:true, device:model.device, dtype:model.dtype, catalog:BROWSER_MODELS };
}

async function getGenerator() {
  if (generator) return generator;
  if (!loading) {
    const model=BROWSER_MODELS.find(m=>m.id===activeModel) || BROWSER_MODELS[0];
    const task=model.task as any;
    const opts:any={ dtype:model.dtype };
    if(model.device==='webgpu' && typeof navigator!=='undefined' && 'gpu' in navigator) opts.device='webgpu';
    else opts.device='wasm';
    loading=pipeline(task, model.id, opts).then(x=>(generator=x));
  }
  return loading;
}

export async function localAI(prompt:string,maxNewTokens=180):Promise<string>{
  const pipe=await getGenerator();
  const model=BROWSER_MODELS.find(m=>m.id===activeModel) || BROWSER_MODELS[0];
  const out=await pipe(prompt,{max_new_tokens:maxNewTokens,do_sample:false});
  return String(out?.[0]?.generated_text || out?.[0]?.text || '').trim();
}

export async function localShoppingIntent(text:string){
  const prompt=`Normalize this shopping request. Preserve every explicit product, URL, quantity and constraint. Do not invent prices, brands, URLs or facts. Return concise plain text only. Request: ${text}`;
  return localAI(prompt,160);
}
