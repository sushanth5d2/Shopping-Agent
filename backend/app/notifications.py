import httpx
from .config import settings
def telegram(text):
 if not settings.telegram_bot_token or not settings.telegram_chat_id:return False
 try:
  r=httpx.post(f'https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage',json={'chat_id':settings.telegram_chat_id,'text':text},timeout=10);return r.is_success
 except Exception:return False
