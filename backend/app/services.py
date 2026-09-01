import re,statistics,math
from dataclasses import dataclass
from typing import Any
from .config import settings
import httpx

def normalize_price(v):
 if isinstance(v,(int,float)): return float(v)
 s=re.sub(r'[^0-9.,-]','',str(v)).replace(',','')
 return float(s)
def true_total(price,delivery=0,tax=0,fees=0,coupon=0,cashback=0): return round(max(0,price+delivery+tax+fees-coupon-cashback),2)
def product_match(a,b):
 def n(x):return re.sub(r'[^a-z0-9]','',str(x or '').lower())
 scores=[]
 for f in ['brand','model','gtin','variant']:
  av,bv=n(a.get(f)),n(b.get(f))
  if av:scores.append(100 if av==bv else 75 if av in bv or bv in av else 0)
 na,nb=n(a.get('name')),n(b.get('name'))
 if na:scores.append(100 if na==nb else 90 if na in nb or nb in na else 0)
 score=round(sum(scores)/len(scores)) if scores else 0
 return {'match_score':score,'exact_match':score>=95,'probable_match':75<=score<95,'not_match':score<75}
def decision(current,target,history):
 if not history:return {'decision':'WAIT','reason':'Not enough historical data.'}
 avg=statistics.mean(history); low=min(history)
 if target is not None and current<=target:return {'decision':'BUY','reason':'Target price reached.'}
 if current<=low*1.02:return {'decision':'BUY','reason':'Current price is historically low.'}
 if current>=avg*1.12:return {'decision':"DON'T BUY",'reason':'Current price is unusually high.'}
 return {'decision':'WAIT','reason':'Price is within the observed range.'}
def prediction(history,current,target):
 if len(history)<5:return {'available':False,'message':'Not enough historical data.'}
 if target is None:return {'available':False,'message':'Set a target price to estimate target probability.'}
 p=sum(x<=target for x in history)/len(history)
 return {'available':True,'probability':round(p*100),'window_days':30,'target':target,'disclaimer':'Historical estimate, not a guarantee.'}
def fake_discount(current,advertised,history):
 if not history or not advertised or advertised<=current:return {'suspected':False,'reason':'Insufficient evidence.'}
 avg=statistics.mean(history); suspected=current>=avg*.98 and advertised>=current*1.5
 return {'suspected':suspected,'reason':'Current price is close to the observed normal price despite a large advertised discount.' if suspected else 'No strong evidence of a misleading discount.'}
def basket(items,mode='CHEAPEST'):
 from itertools import product
 if not items:return {'total':0,'stores':{},'savings':0}
 best=None
 for combo in product(*[x['listings'] for x in items]):
  stores={}
  for x in combo:stores[x['store']]=stores.get(x['store'],0)+x['total']
  score=(sum(stores.values()),len(stores)) if mode!='FEWEST_STORES' else (len(stores),sum(stores.values()))
  if best is None or score<best[0]:best=(score,stores)
 individual=sum(min(x['total'] for x in i['listings']) for i in items)
 total=round(sum(best[1].values()),2);return {'total':total,'stores':best[1],'individual_cheapest':individual,'savings':round(individual-total,2)}

class AIProvider:
    name = 'base'
    def parse(self,text): raise NotImplementedError

class OllamaProvider(AIProvider):
    name = 'ollama'
    def __init__(self, model=None): self.model=model or settings.ollama_model
    def parse(self,text):
        prompt=('Return ONLY valid JSON with keys name,quantity,target_price,max_price,mode,purchase_mode. '
                'mode must be BUY_NOW or MONITOR; purchase_mode must be ASK, AUTO, or MONITOR_ONLY. '
                'Shopping instruction: '+text)
        try:
            r=httpx.post(settings.ollama_base_url.rstrip('/')+'/api/generate',
                json={'model':self.model,'prompt':prompt,'stream':False,'format':'json'},
                timeout=settings.ai_timeout)
            r.raise_for_status()
            data=r.json(); raw=data.get('response','')
            import json
            obj=json.loads(raw)
            if isinstance(obj,dict) and obj.get('name'): return obj
        except Exception:
            pass
        return deterministic_parse(text)

class OpenAICompatibleProvider(AIProvider):
    """Works with OpenAI and compatible hosted APIs. The key stays server-side."""
    name = 'api'
    def parse(self,text):
        if not settings.ai_api_key: return deterministic_parse(text)
        try:
            payload={
                'model':settings.ai_api_model,
                'temperature':0,
                'response_format':{'type':'json_object'},
                'messages':[
                    {'role':'system','content':'Return only JSON with name,quantity,target_price,max_price,mode,purchase_mode. mode is BUY_NOW or MONITOR; purchase_mode is ASK, AUTO, or MONITOR_ONLY.'},
                    {'role':'user','content':text}
                ]}
            r=httpx.post(settings.ai_api_base_url.rstrip('/')+'/chat/completions',
                headers={'Authorization':f'Bearer {settings.ai_api_key}','Content-Type':'application/json'},
                json=payload,timeout=settings.ai_timeout)
            r.raise_for_status(); raw=r.json()['choices'][0]['message']['content']
            import json
            obj=json.loads(raw)
            if isinstance(obj,dict) and obj.get('name'): return obj
        except Exception:
            pass
        return deterministic_parse(text)

def deterministic_parse(text):
    prices=[float(x.replace(',','')) for x in re.findall(r'(?:₹|Rs\.?|INR\s*)\s*([\d,]+(?:\.\d+)?)',text,re.I)]
    low=text.lower()
    mode='MONITOR' if any(k in low for k in ['monitor','when it falls','below']) else 'BUY_NOW'
    purchase='AUTO' if ('auto' in low or 'automatically' in low) else 'MONITOR_ONLY' if 'monitor only' in low else 'ASK'
    qmatch=re.search(r'\b(\d+)\s*(?:x|units?|items?)\b',low); q=int(qmatch.group(1)) if qmatch else 1
    cleaned=re.sub(r"\b(find|the|cheapest|price|monitor|buy|automatically|auto-buy|auto|when|it|falls|below|under|and|ask|me|before|buying|don't|purchase|anything|for|rs\.?|inr)\b",' ',text,flags=re.I)
    cleaned=re.sub(r'(₹\s*[\d,]+(?:\.\d+)?)',' ',cleaned); cleaned=re.sub(r'\s+',' ',cleaned).strip(' .,-')
    return {'name':cleaned or text,'quantity':q,'target_price':prices[0] if prices else None,'max_price':prices[1] if len(prices)>1 else None,'mode':mode,'purchase_mode':purchase}

def get_ai_provider(name=None):
    provider=(name or settings.ai_provider).strip().lower()
    if provider in {'api','openai','openai-compatible'}: return OpenAICompatibleProvider()
    if provider in {'ollama','local','local-ollama'}: return OllamaProvider()
    return OllamaProvider()

def ai_provider_status():
    browser_models=[
        {'id':'onnx-community/Qwen3-0.6B-ONNX','name':'Qwen3 0.6B','runtime':'Transformers.js/ONNX','api_key_required':False,'device':'WebGPU/WASM'},
        {'id':'onnx-community/granite-4.0-350m-ONNX-web','name':'Granite 4.0 350M','runtime':'Transformers.js/ONNX','api_key_required':False,'device':'WebGPU/WASM'},
        {'id':'Xenova/LaMini-Flan-T5-77M','name':'LaMini-Flan-T5 77M','runtime':'Transformers.js/ONNX','api_key_required':False,'device':'WASM'},
    ]
    result={'configured_provider':settings.ai_provider,'embedded_local':{'available':True,'provider':'transformers.js','api_key_required':False,'inference':'browser-local','models':browser_models},'ollama':{'base_url':settings.ollama_base_url,'model':settings.ollama_model,'available':False,'models':[]},'api':{'base_url':settings.ai_api_base_url,'model':settings.ai_api_model,'configured':bool(settings.ai_api_key)}}
    try:
        r=httpx.get(settings.ollama_base_url.rstrip('/')+'/api/tags',timeout=3)
        result['ollama']['available']=r.is_success
        if r.is_success: result['ollama']['models']=[m.get('name') for m in r.json().get('models',[])]
    except Exception: pass
    return result

@dataclass
class PolicyResult: allowed:bool; reason:str
class PurchasePolicy:
 def authorize(self,item,listing,pref,monthly_spend,duplicate,rule=None):
  if pref.emergency_stop:return PolicyResult(False,'Emergency stop is enabled.')
  if duplicate:return PolicyResult(False,'Duplicate purchase protection blocked this transaction.')
  if listing['stock']<=0:return PolicyResult(False,'Product is out of stock.')
  if item.max_price is not None and listing['total']>item.max_price:return PolicyResult(False,'Final total exceeds maximum price.')
  if listing['seller_rating']<pref.min_seller_rating:return PolicyResult(False,'Seller rating is below the configured minimum.')
  if monthly_spend+listing['total']>pref.monthly_max:return PolicyResult(False,'Monthly spending limit would be exceeded.')
  if listing['total']>pref.global_max_order:return PolicyResult(False,'Global maximum per order exceeded.')
  if item.purchase_mode=='AUTO' and not pref.global_auto_buy:return PolicyResult(False,'Auto checkout is not globally enabled.')
  if rule and rule.max_price is not None and listing['total']>rule.max_price:return PolicyResult(False,'Applicable purchase rule maximum exceeded.')
  return PolicyResult(True,'All deterministic purchase rules passed.')
