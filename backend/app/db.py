import os, time, logging, re
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

logger = logging.getLogger('uvicorn')

class Base(DeclarativeBase):
    pass

def get_candidate_urls():
    env_url = os.getenv('SHOPAGENT_DATABASE_URL') or os.getenv('DATABASE_URL')
    urls = []
    if env_url:
        u = env_url.replace('postgresql://', 'postgresql+psycopg://', 1)
        urls.append(u)
    
    base_pass = os.getenv('POSTGRES_PASSWORD', 'shopagent_secure_pass_2026')
    hosts = ['db', 'shopagent-db', 'localhost', '127.0.0.1', 'postgres']
    
    # Try multiple common auth permutations for Docker and local dev
    for host in hosts:
        urls.append(f"postgresql+psycopg://shopagent:{base_pass}@{host}:5432/shopagent")
        urls.append(f"postgresql+psycopg://shopagent@{host}:5432/shopagent")
        urls.append(f"postgresql+psycopg://postgres:{base_pass}@{host}:5432/shopagent")
        urls.append(f"postgresql+psycopg://postgres@{host}:5432/shopagent")
    
    if settings.database_url:
        urls.append(settings.database_url.replace('postgresql://', 'postgresql+psycopg://', 1))
    
    seen = set()
    deduped = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    return deduped

# Initialize with the first candidate
_initial_urls = get_candidate_urls()
engine = create_engine(_initial_urls[0], pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_engine():
    global engine
    return engine

def get_db():
    global SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def wait_for_db(max_retries=30, delay=1.0):
    """Iterates through candidate hosts and credentials until PostgreSQL is connected."""
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

def auto_migrate_schema(eng):
    """Safely adds missing columns and alters constraints on existing PostgreSQL tables without data loss."""
    from sqlalchemy import text
    migrations = [
        # user_preferences custom AI columns
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS custom_ai_enabled BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS custom_ai_provider VARCHAR(50) DEFAULT 'openai';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS custom_ai_base_url VARCHAR(500) DEFAULT 'https://api.openai.com/v1';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS custom_ai_api_key TEXT DEFAULT '';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS custom_ai_model VARCHAR(120) DEFAULT 'gpt-4o-mini';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS telegram_bot_token VARCHAR(255) DEFAULT '';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(120) DEFAULT '';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS delivery_pincode VARCHAR(20) DEFAULT '560001';",
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(100) DEFAULT 'Bengaluru';",
        # orders constraints & columns
        "ALTER TABLE orders ALTER COLUMN listing_id DROP NOT NULL;",
        "ALTER TABLE orders ALTER COLUMN observed_price DROP NOT NULL;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS listing_id INTEGER;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS observed_price FLOAT;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS savings FLOAT DEFAULT 0;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);",
        # shopping_items columns
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS product_id INTEGER;",
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;"
    ]
    with eng.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass

def init_db():
    """Waits for DB connection, binds engine, creates tables and performs auto-migration."""
    global engine, SessionLocal
    if wait_for_db():
        from app import models  # Register all models with Base.metadata
        Base.metadata.create_all(bind=engine)
        auto_migrate_schema(engine)
        logger.info("All database tables verified, migrated, and created successfully.")
        print("INFO: All database tables verified, migrated, and created successfully.", flush=True)
        return True
    return False
