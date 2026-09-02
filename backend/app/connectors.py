from dataclasses import dataclass
from urllib.parse import urlparse
import re,json,ipaddress,socket
from bs4 import BeautifulSoup
from .services import normalize_price
from .config import settings
try:
 from playwright.sync_api import sync_playwright
except Exception: sync_playwright=None

@dataclass
class ProductObservation:
 name:str; brand:str=''; model:str=''; variant:str=''; gtin:str=''; category:str=''; price:float=0; currency:str='INR'; stock:int=0; seller:str=''; seller_rating:float=0; delivery:float=0; tax:float=0; fees:float=0; coupon:float=0; cashback:float=0; delivery_days:int|None=None; warranty:str=''; returns:str=''; condition:str='New'; url:str=''; checkout_supported:bool=False; requires_user_action:bool=True; observed_live:bool=False

class StoreConnector:
 name='abstract'
 def observe_url(self,url)->ProductObservation: raise NotImplementedError

def validate_public_url(url:str)->None:
 u=urlparse(url)
 if u.scheme not in ('http','https') or not u.hostname: raise ValueError('Only http/https product URLs are supported')
 host=u.hostname.lower().rstrip('.')
 if host in {'localhost','127.0.0.1','0.0.0.0','::1'} or host.endswith('.local'): raise ValueError('Private/local hosts are not allowed')
 try:
  infos=socket.getaddrinfo(host,None)
  for x in infos:
   ip=ipaddress.ip_address(x[4][0])
   if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved: raise ValueError('Private network targets are not allowed')
 except socket.gaierror: pass

class JsonLdWebConnector(StoreConnector):
 name='Web Product Connector'
 def observe_url(self,url):
  validate_public_url(url)
  html = ''
  title = ''
  # Fast HTTP fetch attempt first
  try:
   import httpx
   with httpx.Client(timeout=10.0, follow_redirects=True, headers={'User-Agent':'ShopAgent/1.0 (+product-research)'}) as client:
    r = client.get(url)
    if r.status_code == 200:
     html = r.text
  except Exception:
   html = ''

  # If fast HTTP failed or returned minimal content, try Playwright if available
  if (not html or len(html) < 200) and sync_playwright:
   try:
    with sync_playwright() as p:
     browser=p.chromium.launch(headless=settings.playwright_headless)
     context=browser.new_context(user_agent='ShopAgent/1.0 (+product-research)')
     page=context.new_page()
     page.goto(url,wait_until='domcontentloaded',timeout=settings.url_fetch_timeout)
     page.wait_for_timeout(500)
     html=page.content(); title=page.title(); browser.close()
   except Exception:
    pass

  if not html:
   raise ValueError('Unable to retrieve product page content')

  soup=BeautifulSoup(html,'html.parser'); data=[]
  title = title or (soup.title.string if soup.title else '')
  for tag in soup.find_all('script',type='application/ld+json'):
   try:
    obj=json.loads(tag.string or tag.text)
    data += obj if isinstance(obj,list) else [obj]
   except Exception: pass
  prod=next((x for x in data if isinstance(x,dict) and str(x.get('@type','')).lower() in ['product','productgroup']),{})
  offers=prod.get('offers',{}) if isinstance(prod,dict) else {}
  if isinstance(offers,list): offers=offers[0] if offers else {}
  name=prod.get('name') or title
  price=offers.get('price') if isinstance(offers,dict) else None
  if price is None:
   meta=soup.find('meta',property='product:price:amount') or soup.find('meta',attrs={'itemprop':'price'})
   price=meta.get('content') if meta else None
  if price is None:
   # Try finding common price patterns
   price_match = re.search(r'(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)', soup.get_text())
   if price_match:
    price = price_match.group(1)
  if price is None: raise ValueError('No reliable product price found on page')
  availability=str(offers.get('availability','')) if isinstance(offers,dict) else ''
  stock=0 if 'outofstock' in availability.lower() else 1
  brand=prod.get('brand',{}); brand=brand.get('name','') if isinstance(brand,dict) else str(brand or '')
  sku=str(prod.get('sku') or prod.get('mpn') or '')
  model=sku
  variant=str(prod.get('color') or prod.get('size') or prod.get('additionalProperty') or '')
  seller=(offers.get('seller') or {}) if isinstance(offers,dict) else {}
  seller_name=seller.get('name','') if isinstance(seller,dict) else str(seller or '')
  return ProductObservation(name=str(name),brand=brand,model=model,variant=variant,gtin=str(prod.get('gtin13') or prod.get('gtin12') or prod.get('gtin') or ''),price=normalize_price(price),currency=str(offers.get('priceCurrency','INR')),stock=stock,seller=seller_name,url=url,observed_live=True)

def connector_for(url):
 validate_public_url(url)
 return JsonLdWebConnector()

class ProductDiscoveryProvider:
 def search(self, query:str, exclude_hosts:set[str]|None=None, limit:int|None=None)->list[dict]:
  exclude_hosts=exclude_hosts or set(); limit=limit or settings.max_comparison_sources
  if settings.serper_api_key:
   import httpx
   r=httpx.post('https://google.serper.dev/search',headers={'X-API-KEY':settings.serper_api_key,'Content-Type':'application/json'},json={'q':query,'gl':'in','hl':'en','num':min(limit,20)},timeout=15)
   r.raise_for_status(); data=r.json()
   rows=data.get('organic',[])
  elif settings.google_api_key and settings.google_cx:
   import httpx
   r=httpx.get('https://www.googleapis.com/customsearch/v1',params={'key':settings.google_api_key,'cx':settings.google_cx,'q':query,'num':min(limit,10)},timeout=15)
   r.raise_for_status(); rows=[{'title':x.get('title'),'link':x.get('link'),'snippet':x.get('snippet','')} for x in r.json().get('items',[])]
  else:
   return []
  out=[]
  for x in rows:
   url=x.get('link') or ''
   host=(urlparse(url).hostname or '').lower()
   if not url or host in exclude_hosts: continue
   out.append({'title':x.get('title',''),'url':url,'snippet':x.get('snippet','')})
  return out
