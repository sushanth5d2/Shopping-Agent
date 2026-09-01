from datetime import datetime,timedelta,timezone
import uuid,hashlib,re
from urllib.parse import urlparse
from fastapi import FastAPI,Depends,HTTPException,Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel,Field,EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import select,func
from .db import get_db,Base,engine
from .models import *
from .config import settings
from .security import *
from .services import *
from .connectors import connector_for,ProductDiscoveryProvider,validate_public_url,ProductObservation
from .checkout import ManualHandoffCheckoutAdapter
from .notifications import telegram
app=FastAPI(title='ShopAgent API',version='3.0.0')
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(',') if x.strip()],allow_credentials=True,allow_methods=['GET','POST','PATCH','PUT','DELETE','OPTIONS'],allow_headers=['Authorization','Content-Type','Idempotency-Key'])
class Register(BaseModel):email:EmailStr;password:str=Field(min_length=10,max_length=128)
class Login(BaseModel):email:EmailStr;password:str
class Refresh(BaseModel):refresh_token:str
class Intent(BaseModel):text:str=Field(min_length=1,max_length=2000)
class ItemIn(BaseModel):name:str=Field(min_length=1,max_length=255);quantity:int=Field(1,ge=1,le=100);target_price:float|None=None;max_price:float|None=None;mode:str='BUY_NOW';purchase_mode:str='ASK'
class ItemUpdate(BaseModel):name:str|None=None;quantity:int|None=None;target_price:float|None=None;max_price:float|None=None;mode:str|None=None;purchase_mode:str|None=None;status:str|None=None
class PrefIn(BaseModel):preferred_brands:str='';avoided_brands:str='';preferred_stores:str='';min_seller_rating:float=Field(4,ge=0,le=5);warranty_required:bool=False;global_auto_buy:bool=False;global_max_order:float=Field(5000,ge=0);monthly_max:float=Field(20000,ge=0);emergency_stop:bool=False
class UrlIn(BaseModel):url:str
class UrlCompareIn(BaseModel):
 url:str
 monitor:bool=False
 target_price:float|None=None
 max_price:float|None=None
 purchase_mode:str='ASK'

class BatchUrl(BaseModel):
 url:str=Field(min_length=8,max_length=2000)
 monitor:bool=False
 target_price:float|None=None
 max_price:float|None=None
 purchase_mode:str='ASK'

class BatchIn(BaseModel):
 urls:list[BatchUrl]=Field(default_factory=list,max_length=20)
 todo_items:list[str]=Field(default_factory=list,max_length=50)
class RuleIn(BaseModel):scope:str;category:str|None=None;product_id:int|None=None;max_price:float|None=None;purchase_mode:str='ASK';enabled:bool=True
class InventoryIn(BaseModel):name:str;remaining_percent:float=Field(100,ge=0,le=100);quantity_text:str=''
class FamilyIn(BaseModel):name:str;role:str='Member'

def user_list(db,u):return db.query(ShoppingList).filter_by(user_id=u.id).first()
def log(db,u,kind,msg):db.add(AgentEvent(user_id=u.id,kind=kind,message=msg))
def item_obj(db,i):
 current=None;decision_obj=None
 if i.product_id:
  ls=db.query(StoreListing).filter_by(product_id=i.product_id).all(); totals=[true_total(x.price,x.delivery,x.tax,x.fees,x.coupon,x.cashback) for x in ls if x.stock]
  if totals:
   current=min(totals); hist=[s.total for x in ls for s in db.query(PriceSnapshot).filter_by(listing_id=x.id).all()];decision_obj=decision(current,i.target_price,hist)
 return {'id':i.id,'name':i.name,'quantity':i.quantity,'target_price':i.target_price,'max_price':i.max_price,'mode':i.mode,'purchase_mode':i.purchase_mode,'status':i.status,'product_id':i.product_id,'current_price':current,'decision':decision_obj}
def product_summary(db,pid):
 p=db.get(Product,pid)
 if not p:raise HTTPException(404,'Product not found')
 out=[]
 for l in db.query(StoreListing).filter_by(product_id=pid).all():
  st=db.get(Store,l.store_id);seller=db.get(Seller,l.seller_id) if l.seller_id else None; total=true_total(l.price,l.delivery,l.tax,l.fees,l.coupon,l.cashback)
  out.append({'listing_id':l.id,'store':st.name,'product':p.name,'url':l.url,'match_score':100,'price':l.price,'delivery':l.delivery,'discounts':l.coupon,'cashback':l.cashback,'true_total':total,'seller':seller.name if seller else 'Unknown','seller_rating':seller.rating if seller else 0,'warranty':l.warranty,'returns':l.returns,'delivery_days':l.delivery_days,'stock':l.stock,'condition':l.condition,'observed_at':l.observed_at,'live':True})
 if not out:raise HTTPException(404,'No live listings available for this product')
 return {'product_id':pid,'product':p.name,'brand':p.brand,'model':p.model,'variant':p.variant,'listings':sorted(out,key=lambda x:x['true_total']),'best':min(out,key=lambda x:x['true_total'])}
@app.get('/api/health')
def health():return {'status':'ok','version':'3.0.0','environment':'production'}
@app.post('/api/auth/register')
def register(p:Register,db:Session=Depends(get_db)):
 email=p.email.lower()
 if db.query(User).filter_by(email=email).first():raise HTTPException(409,'Email already registered')
 u=User(email=email,password_hash=hash_password(p.password));db.add(u);db.flush();db.add(UserPreference(user_id=u.id));db.add(ShoppingList(user_id=u.id));raw,h,exp=refresh_token(u.id);db.add(RefreshToken(user_id=u.id,token_hash=h,expires_at=exp));db.commit();return {'access_token':access_token(u.id),'refresh_token':raw,'user':{'id':u.id,'email':u.email}}
@app.post('/api/auth/login')
def login(p:Login,db:Session=Depends(get_db)):
 u=db.query(User).filter_by(email=p.email.lower()).first()
 if not u or not verify_password(u.password_hash,p.password):raise HTTPException(401,'Invalid credentials')
 raw,h,exp=refresh_token(u.id);db.add(RefreshToken(user_id=u.id,token_hash=h,expires_at=exp));db.commit();return {'access_token':access_token(u.id),'refresh_token':raw,'user':{'id':u.id,'email':u.email}}
@app.post('/api/auth/refresh')
def refresh(p:Refresh,db:Session=Depends(get_db)):
 h=hashlib.sha256(p.refresh_token.encode()).hexdigest();r=db.query(RefreshToken).filter_by(token_hash=h,revoked=False).first()
 if not r or r.expires_at<datetime.now(timezone.utc):raise HTTPException(401,'Invalid refresh token')
 r.revoked=True;raw,nh,exp=refresh_token(r.user_id);db.add(RefreshToken(user_id=r.user_id,token_hash=nh,expires_at=exp));db.commit();return {'access_token':access_token(r.user_id),'refresh_token':raw}
@app.post('/api/auth/logout')
def logout(p:Refresh,db:Session=Depends(get_db)):
 h=hashlib.sha256(p.refresh_token.encode()).hexdigest();r=db.query(RefreshToken).filter_by(token_hash=h).first()
 if r:r.revoked=True;db.commit()
 return {'ok':True}
@app.get('/api/me')
def me(u=Depends(current_user)):return {'id':u.id,'email':u.email}
@app.get('/api/dashboard')
def dashboard(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u); rows=db.query(ShoppingItem).filter_by(list_id=sl.id).all(); orders=db.query(Order).filter_by(user_id=u.id).all();mon=db.query(MonitoringTask).join(ShoppingItem).filter(ShoppingItem.list_id==sl.id).count();alerts=db.query(PriceAlert).join(ShoppingItem).filter(ShoppingItem.list_id==sl.id,PriceAlert.read==False).count()
 return {'todo':[item_obj(db,x) for x in rows if x.status=='TODO'],'completed':[item_obj(db,x) for x in rows if x.status=='COMPLETED'],'stats':{'monitored':mon,'targets':alerts,'verified_savings':round(sum(x.savings for x in orders),2),'completed':sum(x.status=='COMPLETED' for x in rows)}}
@app.get('/api/items')
def items(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u);return {'items':[item_obj(db,x) for x in db.query(ShoppingItem).filter_by(list_id=sl.id).order_by(ShoppingItem.created_at.desc()).all()]}
@app.post('/api/items')
def add_item(p:ItemIn,u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u);it=ShoppingItem(list_id=sl.id,**p.model_dump());db.add(it);log(db,u,'Products',f'Added {p.name}.');db.commit();db.refresh(it);return item_obj(db,it)
@app.patch('/api/items/{item_id}')
def update_item(item_id:int,p:ItemUpdate,u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it:raise HTTPException(404,'Item not found')
 for k,v in p.model_dump(exclude_none=True).items():setattr(it,k,v)
 db.commit();return item_obj(db,it)
@app.delete('/api/items/{item_id}')
def delete_item(item_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it:raise HTTPException(404,'Item not found')
 db.delete(it);db.commit();return {'ok':True}
@app.get('/api/ai/status')
def ai_status(u=Depends(current_user)):
    return ai_provider_status()

@app.get('/api/ai/models')
def ai_models(u=Depends(current_user)):
    status=ai_provider_status()
    return {'embedded_local':status['embedded_local']['models'],'ollama_installed':status['ollama'].get('models',[]),'cloud_api':status['api']}

@app.post('/api/intent')
def intent(p:Intent,u=Depends(current_user),db:Session=Depends(get_db)):
 parsed=get_ai_provider().parse(p.text); sl=user_list(db,u); chunks=[x.strip() for x in re.split(r',|\band\b',p.text,flags=re.I) if x.strip()]
 parsed_list=[deterministic_parse(x) for x in chunks] if len(chunks)>1 and not any(k in p.text.lower() for k in ['below','under','monitor']) else [parsed]
 made=[]
 for x in parsed_list:
  it=ShoppingItem(list_id=sl.id,name=x['name'],quantity=x.get('quantity',1),target_price=x.get('target_price'),max_price=x.get('max_price'),mode=x.get('mode','BUY_NOW'),purchase_mode=x.get('purchase_mode','ASK'));db.add(it);db.flush();made.append(item_obj(db,it))
 log(db,u,'Products',f'Parsed shopping intent: {p.text}');db.commit();return {'parsed':parsed,'items':made}
def _upsert_observation(db,u,obs):
 existing=None
 if obs.gtin:
  existing=db.query(Product).filter(Product.gtin==obs.gtin,Product.gtin!='').first()
 if not existing:
  # Conservative identity: same brand + normalized model/name is preferred, otherwise new product.
  candidates=db.query(Product).filter(Product.brand==obs.brand).all() if obs.brand else []
  q=set(re.findall(r'[a-z0-9]+',obs.name.lower()))
  for c in candidates:
   cq=set(re.findall(r'[a-z0-9]+',c.name.lower()))
   if q and len(q&cq)/max(1,len(q|cq))>=0.72:
    existing=c;break
 if not existing:
  existing=Product(name=obs.name,brand=obs.brand,model=obs.model,variant=obs.variant,gtin=obs.gtin,category=obs.category)
  db.add(existing);db.flush()
 host=(urlparse(obs.url).hostname or '').lower()
 store=db.query(Store).filter_by(base_url=host).first()
 if not store:
  store=Store(name=host,base_url=host,price_supported=True,search_supported=True,stock_supported=True,checkout_supported=False)
  db.add(store);db.flush()
 seller=db.query(Seller).filter_by(store_id=store.id,name=obs.seller or 'Unknown').first()
 if not seller:
  seller=Seller(store_id=store.id,name=obs.seller or 'Unknown',rating=obs.seller_rating);db.add(seller);db.flush()
 listing=db.query(StoreListing).filter_by(product_id=existing.id,url=obs.url).first()
 if not listing:
  listing=StoreListing(product_id=existing.id,store_id=store.id,seller_id=seller.id,url=obs.url,currency=obs.currency,price=obs.price,delivery=obs.delivery,tax=obs.tax,fees=obs.fees,coupon=obs.coupon,cashback=obs.cashback,stock=obs.stock,delivery_days=obs.delivery_days,warranty=obs.warranty,returns=obs.returns,condition=obs.condition)
  db.add(listing);db.flush()
 else:
  listing.price=obs.price;listing.stock=obs.stock;listing.observed_at=datetime.now(timezone.utc)
 total=true_total(obs.price,obs.delivery,obs.tax,obs.fees,obs.coupon,obs.cashback)
 db.add(PriceSnapshot(listing_id=listing.id,price=obs.price,delivery=obs.delivery,total=total,stock=obs.stock,seller=obs.seller))
 return existing,listing

def _compare_identity(seed:Product, candidate:ProductObservation)->float:
 a=set(re.findall(r'[a-z0-9]+',seed.name.lower())); b=set(re.findall(r'[a-z0-9]+',candidate.name.lower()))
 name=len(a&b)/max(1,len(a|b)) if a or b else 0
 brand=1.0 if seed.brand and candidate.brand and seed.brand.lower()==candidate.brand.lower() else 0
 model=1.0 if seed.model and candidate.model and seed.model.lower()==candidate.model.lower() else 0
 gtin=1.0 if seed.gtin and candidate.gtin and seed.gtin==candidate.gtin else 0
 return round(100*max(gtin,0.55*name+0.25*brand+0.20*model),1)

@app.post('/api/batch/process')
def batch_process(p:BatchIn,u=Depends(current_user),db:Session=Depends(get_db)):
    """Process multiple product URLs and multiple To-Buy items in one atomic user-scoped batch.
    URL work is deliberately sequential because each browser fetch is isolated and the SQLAlchemy
    session is not shared across worker threads. Failed URLs are reported per item; no fake listing
    is created when a source cannot be verified.
    """
    if not p.urls and not p.todo_items:
        raise HTTPException(400,'Provide at least one product URL or To-Buy item')
    sl=user_list(db,u)
    results=[]
    created_items=[]
    for raw in p.todo_items:
        name=raw.strip()
        if not name: continue
        if len(name)>255: raise HTTPException(422,'To-Buy item is too long')
        x=deterministic_parse(name)
        it=ShoppingItem(list_id=sl.id,name=x['name'],quantity=x.get('quantity',1),target_price=x.get('target_price'),max_price=x.get('max_price'),mode=x.get('mode','BUY_NOW'),purchase_mode=x.get('purchase_mode','ASK'))
        db.add(it);db.flush();created_items.append(item_obj(db,it))
    for uin in p.urls:
        try:
            validate_public_url(uin.url)
            obs=connector_for(uin.url).observe_url(uin.url)
            product,listing=_upsert_observation(db,u,obs)
            it=ShoppingItem(list_id=sl.id,name=product.name,quantity=1,target_price=uin.target_price,max_price=uin.max_price,mode='MONITOR' if uin.monitor else 'BUY_NOW',purchase_mode=uin.purchase_mode,product_id=product.id)
            db.add(it);db.flush()
            if uin.monitor:
                t=MonitoringTask(item_id=it.id,status='WATCHING',last_checked=datetime.now(timezone.utc),next_check=datetime.now(timezone.utc)+timedelta(minutes=360));db.add(t)
            results.append({'ok':True,'item_id':it.id,'product_id':product.id,'name':product.name,'url':uin.url,'monitoring':uin.monitor,'listing':{'price':listing.price,'true_total':true_total(listing.price,listing.delivery,listing.tax,listing.fees,listing.coupon,listing.cashback)}})
        except Exception as exc:
            results.append({'ok':False,'url':uin.url,'error':str(exc)})
    log(db,u,'Products',f'Processed batch: {len(created_items)} To-Buy items and {len(results)} product URLs.')
    db.commit()
    return {'todo_created':created_items,'urls':results,'summary':{'todo_requested':len(p.todo_items),'todo_created':len(created_items),'urls_requested':len(p.urls),'urls_processed':len(results),'urls_succeeded':sum(1 for x in results if x['ok']),'urls_failed':sum(1 for x in results if not x['ok'])}}

@app.post('/api/products/url-analyze')
def url_analyze(p:UrlCompareIn,u=Depends(current_user),db:Session=Depends(get_db)):
 validate_public_url(p.url)
 source=connector_for(p.url).observe_url(p.url)
 product,listing=_upsert_observation(db,u,source)
 sl=user_list(db,u)
 item=ShoppingItem(list_id=sl.id,name=product.name,quantity=1,target_price=p.target_price,max_price=p.max_price,mode='MONITOR' if p.monitor else 'BUY_NOW',purchase_mode=p.purchase_mode,product_id=product.id)
 db.add(item);db.flush()
 # Search the web for exact/near-exact alternatives. We never treat unverified search snippets as a price.
 discovery=ProductDiscoveryProvider()
 hosts={(urlparse(p.url).hostname or '').lower()}
 query='"'+product.name+'" '+(product.brand or '')
 candidates=discovery.search(query,hosts,settings.max_comparison_sources)
 compared=[]
 for c in candidates:
  try:
   obs=connector_for(c['url']).observe_url(c['url'])
   score=_compare_identity(product,obs)
   if score < 78: continue
   cp,cl=_upsert_observation(db,u,obs)
   # Only exact/probable identity candidates join the comparison set.
   compared.append({'product_id':cp.id,'listing_id':cl.id,'url':obs.url,'title':c['title'],'snippet':c['snippet'],'match_score':score,'live':True,'store':(urlparse(obs.url).hostname or '')})
  except Exception as exc:
   compared.append({'url':c['url'],'title':c['title'],'snippet':c['snippet'],'match_score':0,'live':False,'error':str(exc)})
 if p.monitor:
  t=MonitoringTask(item_id=item.id,status='WATCHING',last_checked=datetime.now(timezone.utc),next_check=datetime.now(timezone.utc)+timedelta(minutes=360));db.add(t)
 log(db,u,'Products',f'Analyzed product URL and compared {len(compared)} discovered sources: {p.url}')
 db.commit()
 return {'item_id':item.id,'product':{'id':product.id,'name':product.name,'brand':product.brand,'model':product.model,'variant':product.variant,'gtin':product.gtin},'source':{'url':p.url,'price':listing.price,'true_total':true_total(listing.price,listing.delivery,listing.tax,listing.fees,listing.coupon,listing.cashback)},'comparison':product_summary(db,product.id),'discovered_sources':compared,'monitoring':p.monitor}

@app.post('/api/products/ingest-url')
def ingest_url(p:UrlIn,u=Depends(current_user),db:Session=Depends(get_db)):
 obs=connector_for(p.url).observe_url(p.url);existing=db.query(Product).filter(Product.gtin==obs.gtin,Product.gtin!='').first() if obs.gtin else None
 if not existing:existing=Product(name=obs.name,brand=obs.brand,gtin=obs.gtin,category=obs.category);db.add(existing);db.flush()
 store=db.query(Store).filter_by(base_url=f'{__import__("urllib.parse",fromlist=["urlparse"]).urlparse(p.url).netloc}').first()
 if not store:
  host=__import__('urllib.parse',fromlist=['urlparse']).urlparse(p.url).netloc;store=Store(name=host,base_url=host,price_supported=True,search_supported=False,stock_supported=True,checkout_supported=False);db.add(store);db.flush()
 seller=Seller(store_id=store.id,name=obs.seller or 'Unknown',rating=obs.seller_rating);db.add(seller);db.flush()
 l=StoreListing(product_id=existing.id,store_id=store.id,seller_id=seller.id,url=p.url,currency=obs.currency,price=obs.price,delivery=obs.delivery,tax=obs.tax,fees=obs.fees,coupon=obs.coupon,cashback=obs.cashback,stock=obs.stock,delivery_days=obs.delivery_days,warranty=obs.warranty,returns=obs.returns,condition=obs.condition);db.add(l);db.flush();db.add(PriceSnapshot(listing_id=l.id,price=obs.price,delivery=obs.delivery,total=true_total(obs.price,obs.delivery,obs.tax,obs.fees,obs.coupon,obs.cashback),stock=obs.stock,seller=obs.seller));db.commit();return {'product':{'id':existing.id,'name':existing.name},'listing':product_summary(db,existing.id)['best']}
@app.get('/api/products/{product_id}/compare')
def compare(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):return product_summary(db,product_id)
@app.get('/api/products/{product_id}/analysis')
def analysis(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 c=product_summary(db,product_id);hist=[s.total for l in db.query(StoreListing).filter_by(product_id=product_id).all() for s in db.query(PriceSnapshot).filter_by(listing_id=l.id).all()];return {'decision':decision(c['best']['true_total'],None,hist),'prediction':prediction(hist,c['best']['true_total'],None),'fake_discount':fake_discount(c['best']['true_total'],c['best']['price']*2,hist),'history':hist}
@app.post('/api/items/{item_id}/monitor')
def monitor(item_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it or not it.product_id:raise HTTPException(404,'Item/product not found')
 it.mode='MONITOR';t=db.query(MonitoringTask).filter_by(item_id=it.id).first()
 if not t:t=MonitoringTask(item_id=it.id)
 t.status='WATCHING';t.last_checked=datetime.now(timezone.utc);t.next_check=datetime.now(timezone.utc)+timedelta(minutes=t.interval_minutes);db.add(t);log(db,u,'Monitoring',f'Monitoring started for {it.name}.');db.commit();return {'ok':True}
@app.get('/api/monitoring')
def monitoring(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u);out=[]
 for t in db.query(MonitoringTask).join(ShoppingItem).filter(ShoppingItem.list_id==sl.id).all():
  it=db.get(ShoppingItem,t.item_id);c=product_summary(db,it.product_id) if it.product_id else None;out.append({'id':t.id,'item':item_obj(db,it),'status':t.status,'last_checked':t.last_checked,'next_check':t.next_check,'best':c['best'] if c else None})
 return {'items':out}
@app.get('/api/deals')
def deals(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u);out=[]
 for it in db.query(ShoppingItem).filter_by(list_id=sl.id).all():
  if not it.product_id:continue
  try:c=product_summary(db,it.product_id)
  except HTTPException:continue
  hist=[x.total for l in db.query(StoreListing).filter_by(product_id=it.product_id).all() for x in db.query(PriceSnapshot).filter_by(listing_id=l.id).all()]
  avg=sum(hist)/len(hist) if hist else c['best']['true_total']; drop=round((avg-c['best']['true_total'])/avg*100,1) if avg else 0
  d=decision(c['best']['true_total'],it.target_price,hist)
  out.append({'product':c['product'],'product_id':it.product_id,'price':c['best']['true_total'],'discount_percent':drop,'decision':d['decision'],'reason':d['reason']})
 return {'deals':sorted(out,key=lambda x:x['discount_percent'],reverse=True)}

@app.get('/api/agent/health')
def agent_health(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u); monitors=db.query(MonitoringTask).join(ShoppingItem).filter(ShoppingItem.list_id==sl.id).count(); alerts=db.query(PriceAlert).join(ShoppingItem).filter(ShoppingItem.list_id==sl.id,PriceAlert.read==False).count()
 return {'agent':'Healthy','live_listings':db.query(StoreListing).count(),'monitoring_jobs':monitors,'pending_alerts':alerts,'database':'Healthy'}

@app.get('/api/notifications')
def notifications(u=Depends(current_user),db:Session=Depends(get_db)):
 return [{'id':n.id,'kind':n.kind,'title':n.title,'message':n.message,'read':n.read,'created_at':n.created_at} for n in db.query(Notification).filter_by(user_id=u.id).order_by(Notification.created_at.desc()).limit(100)]
@app.post('/api/items/{item_id}/checkout')
def checkout(item_id:int,idempotency_key:str|None=Header(None,alias='Idempotency-Key'),u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it or not it.product_id:raise HTTPException(404,'Item/product not found')
 if not idempotency_key:idempotency_key=uuid.uuid4().hex
 existing=db.query(Order).filter_by(idempotency_key=idempotency_key).first()
 if existing:return {'status':existing.status,'order_number':existing.order_number,'idempotent_replay':True}
 c=product_summary(db,it.product_id);best=c['best'];pref=db.query(UserPreference).filter_by(user_id=u.id).first();spent=sum(o.price for o in db.query(Order).filter_by(user_id=u.id).all());dup=db.query(Order).filter_by(user_id=u.id,item_id=it.id).filter(Order.status.in_(['PENDING','CONFIRMED','SHIPPED','DELIVERED'])).first() is not None
 listing={'total':best['true_total'],'stock':best['stock'],'seller_rating':best['seller_rating']};policy=PurchasePolicy().authorize(it,listing,pref,spent,dup)
 if not policy.allowed:raise HTTPException(409,policy.reason)
 # A real retailer adapter must be selected by store capability. Unknown/web connectors always use manual handoff.
 result=ManualHandoffCheckoutAdapter().checkout({'item':it,'listing':best})
 if result.status!='SUCCESS':
  db.add(AgentEvent(user_id=u.id,kind='Orders',message=result.message));db.commit();return {'status':result.status,'message':result.message,'product':it.name,'store':best['store'],'url':best['url']}
 raise HTTPException(501,'No approved automated checkout adapter is configured for this store.')
@app.get('/api/orders')
def orders(u=Depends(current_user),db:Session=Depends(get_db)):
 return [{'id':o.id,'product_name':o.product_name,'store':o.store,'price':o.price,'status':o.status,'savings':o.savings,'order_number':o.order_number,'created_at':o.created_at} for o in db.query(Order).filter_by(user_id=u.id).order_by(Order.created_at.desc())]
@app.get('/api/activity')
def activity(u=Depends(current_user),db:Session=Depends(get_db)):
 return [{'id':x.id,'kind':x.kind,'message':x.message,'created_at':x.created_at} for x in db.query(AgentEvent).filter_by(user_id=u.id).order_by(AgentEvent.created_at.desc()).limit(200)]
@app.get('/api/preferences')
def prefs(u=Depends(current_user),db:Session=Depends(get_db)):
 p=db.query(UserPreference).filter_by(user_id=u.id).first();return {k:v for k,v in vars(p).items() if not k.startswith('_') and k not in ['id','user_id']}
@app.put('/api/preferences')
def update_prefs(p:PrefIn,u=Depends(current_user),db:Session=Depends(get_db)):
 row=db.query(UserPreference).filter_by(user_id=u.id).first()
 for k,v in p.model_dump().items():setattr(row,k,v)
 db.commit();return {'ok':True}
@app.get('/api/rules')
def rules(u=Depends(current_user),db:Session=Depends(get_db)):
 return [r.__dict__ for r in db.query(PurchaseRule).filter_by(user_id=u.id).all()]
@app.post('/api/rules')
def add_rule(p:RuleIn,u=Depends(current_user),db:Session=Depends(get_db)):
 r=PurchaseRule(user_id=u.id,**p.model_dump());db.add(r);db.commit();db.refresh(r);return {'id':r.id,**p.model_dump()}
@app.get('/api/inventory')
def inventory(u=Depends(current_user),db:Session=Depends(get_db)):
 return [{'id':x.id,'name':x.name,'remaining_percent':x.remaining_percent,'quantity_text':x.quantity_text} for x in db.query(InventoryItem).filter_by(user_id=u.id).all()]
@app.post('/api/inventory')
def add_inventory(p:InventoryIn,u=Depends(current_user),db:Session=Depends(get_db)):
 x=InventoryItem(user_id=u.id,**p.model_dump());db.add(x);db.commit();db.refresh(x);return {'id':x.id,**p.model_dump()}
@app.get('/api/family/members')
def family(u=Depends(current_user),db:Session=Depends(get_db)):
 return [{'id':x.id,'name':x.name,'role':x.role} for x in db.query(FamilyMember).filter_by(user_id=u.id).all()]
@app.post('/api/family/members')
def add_family(p:FamilyIn,u=Depends(current_user),db:Session=Depends(get_db)):
 x=FamilyMember(user_id=u.id,**p.model_dump());db.add(x);db.commit();db.refresh(x);return {'id':x.id,**p.model_dump()}
@app.get('/api/savings')
def savings(u=Depends(current_user),db:Session=Depends(get_db)):
 o=db.query(Order).filter_by(user_id=u.id).all();return {'verified_savings':round(sum(x.savings for x in o),2),'orders':len(o)}
@app.get('/api/basket')
def get_basket(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u);data=[]
 for it in db.query(ShoppingItem).filter_by(list_id=sl.id,status='TODO').all():
  if not it.product_id:continue
  c=product_summary(db,it.product_id);data.append({'name':it.name,'listings':[{'store':x['store'],'total':x['true_total']} for x in c['listings']]})
 return basket(data)
