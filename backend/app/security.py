from datetime import datetime,timedelta,timezone
import hashlib,secrets,jwt
from argon2 import PasswordHasher
from fastapi import Depends,HTTPException,Header
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User,RefreshToken
ph=PasswordHasher()
def hash_password(p): return ph.hash(p)
def verify_password(h,p):
 try: return ph.verify(h,p)
 except Exception:return False
def access_token(uid): return jwt.encode({'sub':str(uid),'type':'access','exp':datetime.now(timezone.utc)+timedelta(minutes=settings.access_minutes)},settings.jwt_secret,algorithm='HS256')
def refresh_token(uid):
 raw=secrets.token_urlsafe(48); h=hashlib.sha256(raw.encode()).hexdigest(); return raw,h,datetime.now(timezone.utc)+timedelta(days=settings.refresh_days)
def current_user(authorization:str|None=Header(None),db:Session=Depends(get_db)):
 if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401,'Authentication required')
 try: p=jwt.decode(authorization[7:],settings.jwt_secret,algorithms=['HS256']); uid=int(p['sub']);
 except Exception: raise HTTPException(401,'Invalid or expired access token')
 u=db.get(User,uid)
 if not u or u.disabled: raise HTTPException(401,'Account unavailable')
 return u
