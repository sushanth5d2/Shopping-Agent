from datetime import datetime,timezone,timedelta
try:
 from apscheduler.schedulers.background import BackgroundScheduler
except ImportError:
 BackgroundScheduler=None
from .db import SessionLocal
from .models import MonitoringTask,ShoppingItem,StoreListing,PriceSnapshot,PriceAlert,Notification,ShoppingList,User
from .connectors import connector_for
from .services import true_total
from .notifications import telegram

scheduler=BackgroundScheduler(timezone="UTC") if BackgroundScheduler else None
def check_monitoring():
 db=SessionLocal()
 lock_acquired=False
 try:
  # PostgreSQL advisory lock prevents duplicate monitoring runs if more than one worker is started.
  try:
   from sqlalchemy import text
   dialect=db.bind.dialect.name
   if dialect == "postgresql":
    lock_acquired=bool(db.execute(text("SELECT pg_try_advisory_lock(82637491)")).scalar())
    if not lock_acquired:
     return
   else:
    lock_acquired=True
  except Exception:
   lock_acquired=True
  now=datetime.now(timezone.utc)
  for task in db.query(MonitoringTask).filter(MonitoringTask.status=="WATCHING").all():
   task_next = task.next_check.replace(tzinfo=timezone.utc) if (task.next_check and task.next_check.tzinfo is None) else task.next_check
   if task_next and task_next > now: continue
   item=db.get(ShoppingItem,task.item_id)
   if not item or not item.product_id: continue
   for listing in db.query(StoreListing).filter_by(product_id=item.product_id).all():
    try: obs=connector_for(listing.url).observe_url(listing.url)
    except Exception: continue
    previous=listing.price;listing.price=obs.price;listing.stock=obs.stock;listing.observed_at=now
    total=true_total(obs.price,obs.delivery,obs.tax,obs.fees,obs.coupon,obs.cashback)
    db.add(PriceSnapshot(listing_id=listing.id,price=obs.price,delivery=obs.delivery,total=total,stock=obs.stock,seller=obs.seller))
    if item.target_price is not None and total<=item.target_price:
     task.status="TARGET_REACHED"; msg=f"Target reached for {item.name}: {total:.2f}"
     db.add(PriceAlert(item_id=item.id,alert_type="TARGET_REACHED",message=msg))
     owner=db.get(ShoppingList,item.list_id).user_id
     db.add(Notification(user_id=owner,kind="TARGET",title="Target price reached",message=msg));telegram("🎯 "+msg)
    elif previous and obs.price<previous:
     db.add(PriceAlert(item_id=item.id,alert_type="PRICE_DROP",message=f"Price dropped for {item.name}: {previous:.2f} → {obs.price:.2f}"))
   task.last_checked=now;task.next_check=now+timedelta(minutes=task.interval_minutes)
  db.commit()
 finally:
  if lock_acquired:
   try:
    if db.bind.dialect.name == "postgresql":
     from sqlalchemy import text
     db.execute(text("SELECT pg_advisory_unlock(82637491)"))
     db.commit()
   except Exception:
    db.rollback()
  db.close()
def start_scheduler():
 if scheduler and not scheduler.running:
  scheduler.add_job(check_monitoring,"interval",minutes=15,id="monitoring",replace_existing=True,max_instances=1,coalesce=True);scheduler.start()
def stop_scheduler():
 if scheduler and scheduler.running:scheduler.shutdown(wait=False)
