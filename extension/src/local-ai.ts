import { pipeline, env } from '@huggingface/transformers';

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.useBrowserCache = true;
const MODEL = 'Xenova/LaMini-Flan-T5-77M';
let pipePromise: Promise<any> | null = null;

async function getPipe() {
  if (!pipePromise) pipePromise = pipeline('text2text-generation', MODEL, { dtype: 'q4' } as any);
  return pipePromise;
}

export async function localAI(prompt: string): Promise<string> {
  const pipe = await getPipe();
  const result = await pipe(prompt, { max_new_tokens: 120, do_sample: false });
  return String(result?.[0]?.generated_text || '').trim();
}
