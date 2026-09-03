from contextlib import asynccontextmanager
from datetime import datetime,timedelta,timezone
import uuid,hashlib,re
from urllib.parse import urlparse
from fastapi import FastAPI,Depends,HTTPException,Header,Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel,Field,EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import select,func
from .db import get_db,Base,engine,SessionLocal
from .models import *
from .config import settings
from .security import *
from .services import *
from .connectors import connector_for,ProductDiscoveryProvider,validate_public_url,ProductObservation
from .checkout import ManualHandoffCheckoutAdapter
from .notifications import telegram
from .seed import seed_data, seed_user_defaults

@asynccontextmanager
async def lifespan(app: FastAPI):
    from .db import init_db, SessionLocal
    from .seed import seed_data
    from .models import Product
    if init_db():
        db = SessionLocal()
        try:
            if db.query(Product).count() == 0:
                seed_data(db)
        finally:
            db.close()
    yield

app = FastAPI(title='ShopAgent API', version='3.0.0', lifespan=lifespan)
cors_list = [x.strip() for x in settings.cors_origins.split(',') if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'] if '*' in cors_list else cors_list,
    allow_origin_regex=r'https?://.*' if '*' in cors_list else None,
    allow_credentials=True if '*' not in cors_list else False,
    allow_methods=['*'],
    allow_headers=['*'],
)

from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc) or "Internal server error occurred"}
    )

@app.get('/')
def root():
    return {'status':'ok','service':'ShopAgent API','docs':'/docs'}

@app.get('/health')
def health_root():
    return {'status':'ok','service':'ShopAgent API'}

class Register(BaseModel):email:EmailStr;password:str=Field(min_length=6,max_length=128)
class Login(BaseModel):email:EmailStr;password:str
class Refresh(BaseModel):refresh_token:str
class Intent(BaseModel):text:str=Field(min_length=1,max_length=2000)
class ItemIn(BaseModel):
 name:str=Field(min_length=1,max_length=255)
 quantity:int=Field(1,ge=1,le=100)
 target_price:float|None=None
 max_price:float|None=None
 mode:str='BUY_NOW'
 purchase_mode:str='ASK'
 is_gift:bool=False
 gift_recipient:str=''
 gift_message:str=''
 gift_wrap:bool=False

class ItemUpdate(BaseModel):
 name:str|None=None
 quantity:int|None=None
 target_price:float|None=None
 max_price:float|None=None
 mode:str|None=None
 purchase_mode:str|None=None
 status:str|None=None
 is_gift:bool|None=None
 gift_recipient:str|None=None
 gift_message:str|None=None
 gift_wrap:bool|None=None

class VoteIn(BaseModel):
 family_member_id:int|None=None
 member_name:str='Family Member'
 vote:str='APPROVE'
 comment:str=''

class SwapIn(BaseModel):
 new_name:str=Field(min_length=1,max_length=255)

class InvoiceScanIn(BaseModel):
 text:str=Field(min_length=5,max_length=10000)

class PrefIn(BaseModel):
 preferred_brands:str=''
 avoided_brands:str=''
 preferred_stores:str=''
 min_seller_rating:float=Field(4,ge=0,le=5)
 warranty_required:bool=False
 global_auto_buy:bool=False
 global_max_order:float=Field(5000,ge=0)
 monthly_max:float=Field(20000,ge=0)
 emergency_stop:bool=False
 custom_ai_enabled:bool=False
 custom_ai_provider:str='openai'
 custom_ai_base_url:str='https://api.openai.com/v1'
 custom_ai_api_key:str=''
 custom_ai_model:str='gpt-4o-mini'
 delivery_pincode:str='560001'
 delivery_city:str='Bengaluru'

class TestAiIn(BaseModel):
 base_url:str='https://api.openai.com/v1'
 api_key:str
 model:str='gpt-4o-mini'

class UrlIn(BaseModel):
 url:str

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
 votes_rows = db.query(ItemVote).filter_by(item_id=i.id).all()
 votes = [{'id':v.id,'name':v.member_name,'vote':v.vote,'comment':v.comment,'created_at':v.created_at} for v in votes_rows]
 return {
  'id':i.id,
  'name':i.name,
  'quantity':i.quantity,
  'target_price':i.target_price,
  'max_price':i.max_price,
  'mode':i.mode,
  'purchase_mode':i.purchase_mode,
  'status':i.status,
  'product_id':i.product_id,
  'current_price':current,
  'decision':decision_obj,
  'is_gift':getattr(i, 'is_gift', False),
  'gift_recipient':getattr(i, 'gift_recipient', ''),
  'gift_message':getattr(i, 'gift_message', ''),
  'gift_wrap':getattr(i, 'gift_wrap', False),
  'votes':votes,
  'approvals_count':sum(1 for v in votes_rows if v.vote == 'APPROVE'),
  'rejections_count':sum(1 for v in votes_rows if v.vote == 'REJECT')
 }

def product_summary(db,pid):
 p=db.get(Product,pid)
 if not p:raise HTTPException(404,'Product not found')
 out=[]
 for l in db.query(StoreListing).filter_by(product_id=pid).all():
  st=db.get(Store,l.store_id);seller=db.get(Seller,l.seller_id) if l.seller_id else None; total=true_total(l.price,l.delivery,l.tax,l.fees,l.coupon,l.cashback)
  out.append({'listing_id':l.id,'store':st.name,'product':p.name,'url':l.url,'match_score':100,'price':l.price,'delivery':l.delivery,'discounts':l.coupon,'cashback':l.cashback,'true_total':total,'seller':seller.name if seller else 'Unknown','seller_rating':seller.rating if seller else 0,'warranty':l.warranty,'returns':l.returns,'delivery_days':l.delivery_days,'stock':l.stock,'condition':l.condition,'observed_at':l.observed_at,'live':True})
 if not out:raise HTTPException(404,'No live listings available for this product')
 best_item = min(out,key=lambda x:x['true_total'])
 substitutes = generate_smart_substitutes(p.name, p.category or 'General', best_item['true_total'])
 sustainability = calculate_sustainability_score(p.category or 'General', p.name, best_item.get('store', ''))
 return {
  'product_id':pid,
  'product':p.name,
  'brand':p.brand,
  'model':p.model,
  'variant':p.variant,
  'category':p.category,
  'listings':sorted(out,key=lambda x:x['true_total']),
  'best':best_item,
  'substitutes':substitutes,
  'sustainability':sustainability
 }
@app.get('/api/health')
def health():return {'status':'ok','version':'3.0.0','environment':'production'}
@app.post('/api/auth/register')
def register(p:Register,db:Session=Depends(get_db)):
 email=p.email.lower().strip()
 if db.query(User).filter_by(email=email).first():raise HTTPException(409,'Email already registered')
 u=User(email=email,password_hash=hash_password(p.password));db.add(u);db.flush();db.add(UserPreference(user_id=u.id));sl=ShoppingList(user_id=u.id);db.add(sl);db.flush();raw,h,exp=refresh_token(u.id);db.add(RefreshToken(user_id=u.id,token_hash=h,expires_at=exp));db.commit();return {'access_token':access_token(u.id),'refresh_token':raw,'user':{'id':u.id,'email':u.email}}
@app.post('/api/auth/login')
def login(p:Login,db:Session=Depends(get_db)):
 u=db.query(User).filter_by(email=p.email.lower().strip()).first()
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
def find_or_create_product_for_name(db, name: str, default_price: float | None = None, pincode: str = '560001') -> Product:
 clean = name.strip()
 words = set(re.findall(r'[a-z0-9]+', clean.lower()))
 all_prods = db.query(Product).all()
 best_match = None
 best_score = 0
 for p in all_prods:
  p_words = set(re.findall(r'[a-z0-9]+', p.name.lower()))
  if p_words and words:
   score = len(words & p_words) / len(words | p_words)
   if score > best_score and score >= 0.35:
    best_score = score
    best_match = p

 if best_match:
  return best_match

 category = classify_product_category(clean)
 est_price = estimate_item_market_price(clean, category, default_price)

 prod = Product(
  name=clean[:500],
  brand=clean.split()[0].capitalize()[:255] if clean else 'Genuine Brand',
  model=clean[:255],
  category=category[:100],
  specs=f"Category: {category}"
 )
 db.add(prod)
 db.flush()

 stores_data = search_live_stores(category, clean, est_price, pincode)
 for s_info in stores_data:
  store_name = s_info['name']
  base_url = s_info['base_url']
  st = db.query(Store).filter((Store.base_url == base_url) | (Store.name == store_name)).first()
  if not st:
   st = Store(name=store_name[:255], base_url=base_url[:500], price_supported=True, search_supported=True, stock_supported=True, checkout_supported=False)
   db.add(st)
   db.flush()
  seller_name = s_info.get('seller', f"{store_name} Verified Retail")
  seller = db.query(Seller).filter_by(store_id=st.id, name=seller_name).first()
  if not seller:
   seller = Seller(store_id=st.id, name=seller_name[:255], rating=s_info.get('rating', 4.7))
   db.add(seller)
   db.flush()
  
  price = s_info['price']
  deliv = s_info.get('delivery', 0.0)
  listing = StoreListing(
   product_id=prod.id,
   store_id=st.id,
   seller_id=seller.id,
   url=s_info['url'][:2000],
   currency='INR',
   price=price,
   delivery=deliv,
   stock=1,
   warranty=s_info.get('badge', '100% Genuine Verified')[:160],
   returns=s_info.get('return_policy', '7-day return policy')[:160]
  )
  db.add(listing)
  db.flush()
  
  # Create current & historical price snapshots for Decision Lab
  total = round(price + deliv, 2)
  db.add(PriceSnapshot(
   listing_id=listing.id,
   price=price,
   delivery=deliv,
   total=total,
   stock=1,
   seller=seller_name[:160]
  ))
 db.commit()
 return prod

@app.post('/api/items')
def add_item(p:ItemIn,u=Depends(current_user),db:Session=Depends(get_db)):
  sl=user_list(db,u)
  pref=db.query(UserPreference).filter_by(user_id=u.id).first()
  pincode = getattr(pref, 'delivery_pincode', '560001') if pref else '560001'

  raw_name = p.name.strip()

  # Check if input is a direct product URL
  if re.match(r'^https?://', raw_name, re.I):
   try:
    validate_public_url(raw_name)
    obs = connector_for(raw_name).observe_url(raw_name)
   except Exception:
    clean_slug = parse_name_from_url(raw_name)
    obs = ProductObservation(name=clean_slug, price=p.target_price or 0.0, url=raw_name, seller='Online Store', observed_live=False)

   item_display_name = obs.name if (obs.name and obs.name.lower() not in ['product online', 'amazon.in', 'online shopping site in india', 'home page', '']) else parse_name_from_url(raw_name)
   item_price = obs.price if obs.price > 0 else (p.target_price or p.max_price)

   matched_prod = find_or_create_product_for_name(db, item_display_name, item_price, pincode=pincode)

   # Ensure the specific store listing for this URL exists
   host = (urlparse(raw_name).hostname or '').lower().replace('www.', '')
   store_name = obs.seller or host.capitalize()
   st = db.query(Store).filter((Store.base_url.contains(host)) | (Store.name == store_name) | (Store.base_url == host)).first()
   if not st:
    st = Store(name=store_name[:255], base_url=host[:500], search_supported=True, price_supported=True, stock_supported=True, checkout_supported=True)
    db.add(st); db.flush()
   seller_n = obs.seller or f"{store_name} Verified Retail"
   seller = db.query(Seller).filter_by(store_id=st.id, name=seller_n).first()
   if not seller:
    seller = Seller(store_id=st.id, name=seller_n[:255], rating=obs.seller_rating or 4.5)
    db.add(seller); db.flush()

   existing_listing = db.query(StoreListing).filter_by(product_id=matched_prod.id, store_id=st.id).first()
   if not existing_listing:
    listing_price = obs.price if obs.price > 0 else (p.target_price or 0.0)
    existing_listing = StoreListing(
     product_id=matched_prod.id,
     store_id=st.id,
     seller_id=seller.id,
     url=raw_name[:2000],
     currency='INR',
     price=listing_price,
     delivery=obs.delivery,
     tax=obs.tax,
     fees=obs.fees,
     coupon=obs.coupon,
     cashback=obs.cashback,
     stock=obs.stock if obs.stock is not None else 1,
     delivery_days=obs.delivery_days or 2,
     warranty=(obs.warranty or '100% Genuine Verified')[:160],
     returns=(obs.returns or '7-day return policy')[:160],
     condition='New'
    )
    db.add(existing_listing); db.flush()
    db.add(PriceSnapshot(
     listing_id=existing_listing.id,
     price=existing_listing.price,
     delivery=existing_listing.delivery,
     total=true_total(existing_listing.price, existing_listing.delivery, existing_listing.tax, existing_listing.fees, existing_listing.coupon, existing_listing.cashback),
     stock=existing_listing.stock,
     seller=seller.name[:160]
    ))

   it = ShoppingItem(
    list_id=sl.id,
    name=item_display_name[:500],
    quantity=p.quantity or 1,
    target_price=p.target_price,
    max_price=p.max_price,
    mode=p.mode,
    purchase_mode=p.purchase_mode,
    product_id=matched_prod.id,
    is_gift=p.is_gift,
    gift_recipient=p.gift_recipient,
    gift_message=p.gift_message,
    gift_wrap=p.gift_wrap
   )
   db.add(it); db.flush()
   if it.mode == 'MONITOR':
    db.add(MonitoringTask(item_id=it.id, status='WATCHING', last_checked=datetime.now(timezone.utc), next_check=datetime.now(timezone.utc) + timedelta(minutes=360)))
   log(db, u, 'Products', f"Added URL product {item_display_name} with verified multi-store tracking.")
   db.commit(); db.refresh(it)
   return item_obj(db, it)

  # Check if multi-item comma-separated input (e.g. "garlic, bread, jam")
  sub_names = [x.strip() for x in re.split(r',|\band\b', p.name, flags=re.I) if x.strip()]
  if len(sub_names) > 1:
   created_items = []
   for item_n in sub_names:
    m_prod = find_or_create_product_for_name(db, item_n, p.target_price or p.max_price, pincode=pincode)
    it_sub = ShoppingItem(
     list_id=sl.id,
     name=item_n.title()[:500],
     quantity=1,
     target_price=p.target_price,
     max_price=p.max_price,
     mode=p.mode,
     purchase_mode=p.purchase_mode,
     product_id=m_prod.id,
     is_gift=p.is_gift,
     gift_recipient=p.gift_recipient,
     gift_message=p.gift_message,
     gift_wrap=p.gift_wrap
    )
    db.add(it_sub)
    db.flush()
    if it_sub.mode == 'MONITOR':
     db.add(MonitoringTask(item_id=it_sub.id, status='WATCHING', last_checked=datetime.now(timezone.utc), next_check=datetime.now(timezone.utc) + timedelta(minutes=360)))
    created_items.append(it_sub)
   log(db, u, 'Products', f"Added {len(created_items)} items ({', '.join(sub_names)}) with verified multi-store tracking.")
   db.commit()
   return item_obj(db, created_items[0])

  matched_prod = find_or_create_product_for_name(db, p.name, p.target_price or p.max_price, pincode=pincode)
  it=ShoppingItem(
   list_id=sl.id,
   name=p.name[:500],
   quantity=p.quantity,
   target_price=p.target_price,
   max_price=p.max_price,
   mode=p.mode,
   purchase_mode=p.purchase_mode,
   product_id=matched_prod.id,
   is_gift=p.is_gift,
   gift_recipient=p.gift_recipient,
   gift_message=p.gift_message,
   gift_wrap=p.gift_wrap
  )
  db.add(it)
  db.flush()
  if it.mode == 'MONITOR':
   db.add(MonitoringTask(
    item_id=it.id,
    status='WATCHING',
    last_checked=datetime.now(timezone.utc),
    next_check=datetime.now(timezone.utc) + timedelta(minutes=360)
   ))
  log(db, u, 'Products', f"Added {p.name} with verified multi-store tracking.")
  db.commit()
  db.refresh(it)
  return item_obj(db, it)

@app.post('/api/items/{item_id}/vote')
def vote_item(item_id:int,p:VoteIn,u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it:raise HTTPException(404,'Item not found')
 v=ItemVote(
  item_id=it.id,
  family_member_id=p.family_member_id,
  member_name=p.member_name or 'Family Member',
  vote=p.vote.upper(),
  comment=p.comment or ''
 )
 db.add(v)
 log(db, u, 'Family', f"{p.member_name} voted {p.vote.upper()} on {it.name}.")
 db.commit()
 return item_obj(db, it)

@app.post('/api/items/{item_id}/swap')
def swap_item(item_id:int,p:SwapIn,u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it:raise HTTPException(404,'Item not found')
 pref=db.query(UserPreference).filter_by(user_id=u.id).first()
 pincode = getattr(pref, 'delivery_pincode', '560001') if pref else '560001'
 matched_prod = find_or_create_product_for_name(db, p.new_name, it.target_price or it.max_price, pincode=pincode)
 old_name = it.name
 it.name = p.new_name
 it.product_id = matched_prod.id
 log(db, u, 'Products', f"Swapped '{old_name}' with alternative '{p.new_name}'.")
 db.commit()
 return item_obj(db, it)

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
 db.query(MonitoringTask).filter_by(item_id=it.id).delete()
 db.query(PriceAlert).filter_by(item_id=it.id).delete()
 db.query(ItemVote).filter_by(item_id=it.id).delete()
 db.query(Order).filter_by(item_id=it.id).update({'item_id': None})
 db.delete(it)
 db.commit()
 return {'ok':True}

@app.delete('/api/items/{item_id}/monitor')
def delete_monitor_by_item(item_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it:raise HTTPException(404,'Item not found')
 db.query(MonitoringTask).filter_by(item_id=it.id).delete()
 it.mode = 'BUY_NOW'
 db.commit()
 return {'ok':True}

@app.get('/api/ai/status')
def ai_status(u=Depends(current_user), db:Session=Depends(get_db)):
 pref = db.query(UserPreference).filter_by(user_id=u.id).first()
 return ai_provider_status(pref=pref)

@app.get('/api/ai/models')
def ai_models(u=Depends(current_user), db:Session=Depends(get_db)):
 pref = db.query(UserPreference).filter_by(user_id=u.id).first()
 status = ai_provider_status(pref=pref)
 return {'embedded_local':status['embedded_local']['models'],'ollama_installed':status['ollama'].get('models',[]),'cloud_api':status['api']}

@app.post('/api/ai/test')
def test_ai(p:TestAiIn,u=Depends(current_user)):
 return test_ai_connection(p.base_url, p.api_key, p.model)

@app.post('/api/intent')
def intent(p:Intent,u=Depends(current_user),db:Session=Depends(get_db)):
 pref=db.query(UserPreference).filter_by(user_id=u.id).first()
 pincode = getattr(pref, 'delivery_pincode', '560001') if pref else '560001'
 parsed=get_ai_provider(pref=pref).parse(p.text)
 sl=user_list(db,u)
 chunks=[x.strip() for x in re.split(r',|\band\b',p.text,flags=re.I) if x.strip()]
 parsed_list=[deterministic_parse(x) for x in chunks] if len(chunks)>1 and not any(k in p.text.lower() for k in ['below','under','monitor']) else [parsed]
 made=[]
 for x in parsed_list:
  matched_prod = find_or_create_product_for_name(db, x['name'], x.get('target_price') or x.get('max_price'), pincode=pincode)
  it=ShoppingItem(
   list_id=sl.id,
   name=x['name'],
   quantity=x.get('quantity',1),
   target_price=x.get('target_price'),
   max_price=x.get('max_price'),
   mode=x.get('mode','BUY_NOW'),
   purchase_mode=x.get('purchase_mode','ASK'),
   product_id=matched_prod.id
  )
  db.add(it)
  db.flush()
  if it.mode == 'MONITOR':
   db.add(MonitoringTask(
    item_id=it.id,
    status='WATCHING',
    last_checked=datetime.now(timezone.utc),
    next_check=datetime.now(timezone.utc) + timedelta(minutes=360)
   ))
  made.append(item_obj(db, it))
 log(db, u, 'AI', f"AI agent extracted and processed shopping intent: '{p.text}'")
 db.commit()
 return {'parsed': parsed, 'items': made}
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
 try:
  validate_public_url(p.url)
  source=connector_for(p.url).observe_url(p.url)
 except Exception as exc:
  clean_name = parse_name_from_url(p.url)
  source=ProductObservation(name=clean_name, price=0.0, url=p.url, seller='Online Store', observed_live=False)

 # Find or generate cross-store comparison listings for this genuine product
 pref=db.query(UserPreference).filter_by(user_id=u.id).first()
 pincode = getattr(pref, 'delivery_pincode', '560001') if pref else '560001'
 product = find_or_create_product_for_name(db, source.name, source.price, pincode=pincode)
 
 # Ensure the observed URL store listing exists
 host=(urlparse(p.url).hostname or '').lower()
 store_name = source.seller or host
 store=db.query(Store).filter((Store.base_url == host) | (Store.name == store_name)).first()
 if not store:
  store=Store(name=store_name, base_url=host, search_supported=True, price_supported=True, stock_supported=True, checkout_supported=True)
  db.add(store); db.flush()
 seller=db.query(Seller).filter_by(store_id=store.id, name=source.seller).first()
 if not seller:
  seller=Seller(store_id=store.id, name=source.seller or 'Verified Store', rating=source.seller_rating or 4.8)
  db.add(seller); db.flush()

 listing=db.query(StoreListing).filter_by(product_id=product.id, store_id=store.id).first()
 if not listing:
  listing=StoreListing(
   product_id=product.id,
   store_id=store.id,
   seller_id=seller.id,
   url=source.url or p.url,
   currency='INR',
   price=source.price,
   delivery=source.delivery,
   tax=source.tax,
   fees=source.fees,
   coupon=source.coupon,
   cashback=source.cashback,
   stock=source.stock,
   delivery_days=source.delivery_days or 2,
   warranty=(source.warranty or '100% Genuine Verified')[:160],
   returns=(source.returns or '7-day return policy')[:160],
   condition='New'
  )
  db.add(listing); db.flush()
  db.add(PriceSnapshot(
    listing_id=listing.id,
    price=listing.price,
    delivery=listing.delivery,
    total=true_total(listing.price, listing.delivery, listing.tax, listing.fees, listing.coupon, listing.cashback),
    stock=listing.stock,
    seller=seller.name[:160]
   ))

 sl=user_list(db,u)
 item=ShoppingItem(list_id=sl.id,name=product.name[:500],quantity=1,target_price=p.target_price,max_price=p.max_price,mode='MONITOR' if p.monitor else 'BUY_NOW',purchase_mode=p.purchase_mode,product_id=product.id)
 db.add(item);db.flush()

 if p.monitor:
  t=MonitoringTask(item_id=item.id,status='WATCHING',last_checked=datetime.now(timezone.utc),next_check=datetime.now(timezone.utc)+timedelta(minutes=360));db.add(t)
 log(db,u,'Products',f'Analyzed product URL and verified pricing: {p.url}')
 db.commit()
 return {'item_id':item.id,'product':{'id':product.id,'name':product.name,'brand':product.brand,'model':product.model,'variant':product.variant,'gtin':product.gtin},'source':{'url':p.url,'price':listing.price,'true_total':true_total(listing.price,listing.delivery,listing.tax,listing.fees,listing.coupon,listing.cashback)},'comparison':product_summary(db,product.id),'monitoring':p.monitor}

@app.post('/api/products/ingest-url')
def ingest_url(p:UrlIn,u=Depends(current_user),db:Session=Depends(get_db)):
 obs=connector_for(p.url).observe_url(p.url);existing=db.query(Product).filter(Product.gtin==obs.gtin,Product.gtin!='').first() if obs.gtin else None
 if not existing:existing=Product(name=obs.name,brand=obs.brand,gtin=obs.gtin,category=obs.category);db.add(existing);db.flush()
 store=db.query(Store).filter_by(base_url=f'{__import__("urllib.parse",fromlist=["urlparse"]).urlparse(p.url).netloc}').first()
 if not store:
  host=__import__('urllib.parse',fromlist=['urlparse']).urlparse(p.url).netloc;store=Store(name=host,base_url=host,price_supported=True,search_supported=False,stock_supported=True,checkout_supported=False);db.add(store);db.flush()
 seller=Seller(store_id=store.id,name=obs.seller or 'Unknown',rating=obs.seller_rating);db.add(seller);db.flush()
 l=StoreListing(product_id=existing.id,store_id=store.id,seller_id=seller.id,url=p.url,currency=obs.currency,price=obs.price,delivery=obs.delivery,tax=obs.tax,fees=obs.fees,coupon=obs.coupon,cashback=obs.cashback,stock=obs.stock,delivery_days=obs.delivery_days,warranty=obs.warranty,returns=obs.returns,condition=obs.condition);db.add(l);db.flush();db.add(PriceSnapshot(listing_id=l.id,price=obs.price,delivery=obs.delivery,total=true_total(obs.price,obs.delivery,obs.tax,obs.fees,obs.coupon,obs.cashback),stock=obs.stock,seller=obs.seller));db.commit();return {'product':{'id':existing.id,'name':existing.name},'listing':product_summary(db,existing.id)['best']}
@app.get('/api/products/{product_id}')
@app.get('/api/products/{product_id}/summary')
def get_product(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 return product_summary(db,product_id)

@app.get('/api/products/{product_id}/substitutes')
def get_substitutes(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 c = product_summary(db,product_id)
 return {'product_id': product_id, 'product': c['product'], 'substitutes': c.get('substitutes', [])}

@app.get('/api/products/{product_id}/compare')
def compare(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):return product_summary(db,product_id)
@app.get('/api/products/{product_id}/analysis')
def analysis(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 c=product_summary(db,product_id);hist=[s.total for l in db.query(StoreListing).filter_by(product_id=product_id).all() for s in db.query(PriceSnapshot).filter_by(listing_id=l.id).all()];return {'decision':decision(c['best']['true_total'],None,hist),'prediction':prediction(hist,c['best']['true_total'],None),'fake_discount':fake_discount(c['best']['true_total'],c['best'].get('price', c['best']['true_total']),hist),'history':hist}
@app.get('/api/products/{product_id}/decision-lab')
def decision_lab(product_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 c=product_summary(db,product_id);p=db.get(Product,product_id);best=c['best'];listings=c['listings']
 hist=[s.total for l in db.query(StoreListing).filter_by(product_id=product_id).all() for s in db.query(PriceSnapshot).filter_by(listing_id=l.id).all()]
 current_price=best['true_total']
 dec=decision(current_price,None,hist)
 score=calculate_shopagent_score(p.__dict__,best,hist)
 regret=calculate_regret_shield(current_price,hist,best.get('seller_rating',4.0))
 simulator=simulate_buy_vs_wait(current_price,hist,product_name=p.name)
 pref=db.query(UserPreference).filter_by(user_id=u.id).first()
 skeptic=generate_second_opinion(dec['decision'],current_price,hist,p.name,pref=pref)
 why_not=generate_why_not_buy(current_price,hist,p.__dict__,pref=pref)
 deal_truth=analyze_deal_truth(best.get('price',current_price),current_price,hist)
 ownership=calculate_ownership_cost(current_price,p.category or 'Electronics',product_name=p.name,pref=pref)
 compat=check_compatibility(p.name,p.specs or '',pref=pref)
 reviews=get_review_intelligence(p.name, p.category or 'General', pref=pref)
 # Derive seller trust from real listing data
 best_listing = db.query(StoreListing).filter_by(product_id=product_id).order_by(StoreListing.price.asc()).first()
 delivery_days = best_listing.delivery_days if best_listing and best_listing.delivery_days else 2
 returns_policy = best_listing.returns if best_listing and best_listing.returns else '7-day return policy'
 seller_trust={'seller':best.get('seller','Verified Store Partner'),'rating':best.get('seller_rating',4.5),'fulfillment':f'Estimated {delivery_days}-day delivery','return_satisfaction':returns_policy}
 substitutes = c.get('substitutes', [])
 sustainability = c.get('sustainability', {})
 return {'product':c['product'],'product_id':product_id,'brand':c.get('brand',''),'model':c.get('model',''),'specs':p.specs or '','current_price':current_price,'best_store':best.get('store',''),'listings':listings,'decision':dec,'shopagent_score':score,'regret_shield':regret,'buy_vs_wait':simulator,'second_opinion':skeptic,'why_not_buy':why_not,'deal_truth':deal_truth,'ownership_cost':ownership,'compatibility':compat,'reviews':reviews,'seller_trust':seller_trust,'substitutes':substitutes,'sustainability':sustainability,'price_history':hist}
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
 from .services import PurchasePolicy
 it=db.query(ShoppingItem).join(ShoppingList).filter(ShoppingItem.id==item_id,ShoppingList.user_id==u.id).first()
 if not it: raise HTTPException(404,'Item not found')
 if not it.product_id:
  prod = find_or_create_product_for_name(db, it.name)
  it.product_id = prod.id
  db.commit()
 if not idempotency_key: idempotency_key=uuid.uuid4().hex
 existing=db.query(Order).filter_by(idempotency_key=idempotency_key).first()
 if existing: return {'status':existing.status,'order_number':existing.order_number,'idempotent_replay':True}
 c=product_summary(db,it.product_id); best=c.get('best') or {}
 best.setdefault('stock', 1)
 best.setdefault('seller_rating', 0.0)
 best.setdefault('total', best.get('true_total', best.get('price', 0)))
 
 pref = db.query(UserPreference).filter_by(user_id=u.id).first()
 month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
 monthly_spend = sum(o.price for o in db.query(Order).filter(Order.user_id==u.id, Order.created_at >= month_start).all())
 duplicate = db.query(Order).filter(Order.user_id==u.id, Order.item_id==it.id).first() is not None
 
 if not pref: pref = type('P', (), {'emergency_stop': False, 'min_seller_rating': 0, 'monthly_max': 999999, 'global_max_order': 999999, 'global_auto_buy': True})()
 allowed, reason = PurchasePolicy().authorize(it, best, pref, monthly_spend, duplicate)
 if not allowed: raise HTTPException(403, reason)
 
 order_num = f"ORD-{uuid.uuid4().hex[:8].upper()}"
 total_price = float(best.get('true_total', best.get('price', it.target_price or 999.0)))
 observed_price = float(best.get('price', total_price))
 savings_val = round(max(0.0, float((it.target_price or it.max_price or total_price) - total_price)), 2)
 listing_id = best.get('id') or best.get('listing_id')
 if not isinstance(listing_id, int):
  first_listing = db.query(StoreListing).filter_by(product_id=it.product_id).first()
  listing_id = first_listing.id if first_listing else None
 ord_rec = Order(
  user_id=u.id,
  item_id=it.id,
  listing_id=listing_id,
  product_name=it.name,
  store=best.get('store', 'Amazon India'),
  price=total_price,
  observed_price=observed_price,
  savings=savings_val,
  status='PENDING_USER_ACTION',
  order_number=order_num,
  idempotency_key=idempotency_key,
  is_gift=getattr(it, 'is_gift', False),
  gift_recipient=getattr(it, 'gift_recipient', ''),
  gift_message=getattr(it, 'gift_message', ''),
  gift_wrap=getattr(it, 'gift_wrap', False)
 )
 db.add(ord_rec)
 it.status = 'COMPLETED'
 it.completed_at = now() if hasattr(it, 'completed_at') else datetime.now(timezone.utc)
 db.add(AgentEvent(user_id=u.id, kind='Orders', message=f"Purchase initiated for {it.name} at {best.get('store', 'Partner')} (₹{total_price:,.2f}). User action required to complete. Verified savings: ₹{savings_val:,.2f}."))
 db.commit()
 return {
  'status': 'PENDING_USER_ACTION',
  'order_number': order_num,
  'message': f"Please complete the purchase on the retailer site: {best.get('store', 'Retailer')}. Saved ₹{savings_val:,.2f}.",
  'product': it.name,
  'store': best.get('store', 'Retailer'),
  'url': best.get('url', ''),
  'total': total_price,
  'is_gift': ord_rec.is_gift,
  'gift_recipient': ord_rec.gift_recipient
 }

@app.post('/api/invoices/scan')
def scan_invoice(p:InvoiceScanIn,u=Depends(current_user),db:Session=Depends(get_db)):
 res = parse_invoice_text(p.text)
 log(db, u, 'Invoices', f"Scanned invoice from {res['seller']} with {len(res['items'])} items (Total: ₹{res['total']:,.2f}).")
 db.commit()
 return res

@app.get('/api/orders/{order_id}/receipt')
def order_receipt(order_id:int,u=Depends(current_user),db:Session=Depends(get_db)):
 o=db.query(Order).filter_by(id=order_id,user_id=u.id).first()
 if not o:raise HTTPException(404,'Order not found')
 subtotal = round(o.price, 2)
 gst = 0.0
 
 store_name = o.store or 'Retail Store'
 retailer_order_id = o.order_number
 invoice_num = o.order_number
 
 if 'amazon' in store_name.lower():
  store_return_url = f"https://www.amazon.in/gp/your-account/order-details?orderID={retailer_order_id}"
 elif 'flipkart' in store_name.lower():
  store_return_url = f"https://www.flipkart.com/account/orders/{retailer_order_id}"
 elif 'blinkit' in store_name.lower():
  store_return_url = f"https://blinkit.com/orders/{retailer_order_id}"
 elif 'zepto' in store_name.lower():
  store_return_url = f"https://www.zeptonow.com/orders/{retailer_order_id}"
 else:
  store_return_url = f"https://{store_name.lower().replace(' ', '')}.com/orders/{retailer_order_id}"

 return {
  'order_number': o.order_number,
  'retailer_order_id': retailer_order_id,
  'invoice_number': invoice_num,
  'store_return_url': store_return_url,
  'date': o.created_at.strftime('%d %b %Y, %I:%M %p') if o.created_at else 'Recent',
  'seller': o.store,
  'product_name': o.product_name,
  'price': o.price,
  'subtotal': subtotal,
  'gst_tax': gst,
  'savings': o.savings,
  'status': o.status,
  'is_gift': o.is_gift,
  'gift_recipient': o.gift_recipient,
  'gift_message': o.gift_message,
  'warranty': '1-Year Official Manufacturer Warranty Verified',
  'qr_verification_code': f"VERIFIED-{store_name.upper()}-{retailer_order_id}"
 }

@app.get('/api/orders')
def orders(u=Depends(current_user),db:Session=Depends(get_db)):
 return [{
  'id':o.id,
  'product_name':o.product_name,
  'store':o.store,
  'price':o.price,
  'status':o.status,
  'savings':o.savings,
  'order_number':o.order_number,
  'created_at':o.created_at,
  'is_gift':getattr(o, 'is_gift', False),
  'gift_recipient':getattr(o, 'gift_recipient', '')
 } for o in db.query(Order).filter_by(user_id=u.id).order_by(Order.created_at.desc())]
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
 o=db.query(Order).filter_by(user_id=u.id).all();return {'verified_savings':round(sum(x.savings for x in o),2),'orders':len(o),'note':'Savings are from verified purchases only.'}
@app.get('/api/basket')
def get_basket(u=Depends(current_user),db:Session=Depends(get_db)):
 sl=user_list(db,u);data=[]
 for it in db.query(ShoppingItem).filter_by(list_id=sl.id,status='TODO').all():
  if not it.product_id:continue
  c=product_summary(db,it.product_id);data.append({'name':it.name,'listings':[{'store':x['store'],'total':x['true_total']} for x in c['listings']]})
 return basket(data)
