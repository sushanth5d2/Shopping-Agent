import os, time, logging, re
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

logger = logging.getLogger('uvicorn')

def get_candidate_urls():
    env_url = os.getenv('SHOPAGENT_DATABASE_URL') or os.getenv('DATABASE_URL')
    urls = []
    if env_url:
        u = env_url.replace('postgresql://', 'postgresql+psycopg://', 1)
        urls.append(u)
    
    base_pass = os.getenv('POSTGRES_PASSWORD', 'shopagent_secure_pass_2026')
    for host in ['db', 'shopagent-db', 'localhost', '127.0.0.1', 'postgres']:
        urls.append(f"postgresql+psycopg://shopagent:{base_pass}@{host}:5432/shopagent")
    
    if settings.database_url:
        urls.append(settings.database_url.replace('postgresql://', 'postgresql+psycopg://', 1))
    
    seen = set()
    deduped = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    return deduped

def create_active_engine():
    urls = get_candidate_urls()
    return create_engine(urls[0], pool_pre_ping=True, pool_recycle=300)

engine = create_active_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def wait_for_db(max_retries=30, delay=1.0):
    """Iterates through candidate hosts and retries until PostgreSQL is connected."""
    global engine, SessionLocal
    candidates = get_candidate_urls()
    
    for attempt in range(1, max_retries + 1):
        for url in candidates:
            try:
                test_engine = create_engine(url, pool_pre_ping=True, pool_recycle=300)
                with test_engine.connect() as conn:
                    engine = test_engine
                    SessionLocal.configure(bind=engine)
                    masked = re.sub(r':([^@]+)@', ':****@', url)
                    logger.info(f"Connected to PostgreSQL database: {masked}")
                    print(f"INFO: Connected to PostgreSQL database: {masked}", flush=True)
                    return True
            except Exception:
                pass
        
        logger.warning(f"Waiting for PostgreSQL database container (attempt {attempt}/{max_retries})...")
        print(f"WARNING: Waiting for PostgreSQL database container (attempt {attempt}/{max_retries})...", flush=True)
        time.sleep(delay)
    
    return False
