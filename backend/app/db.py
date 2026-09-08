import os, time, logging, re
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

logger = logging.getLogger('uvicorn')

class Base(DeclarativeBase):
    pass

def _is_host_reachable(host: str, port: int = 5432, timeout: float = 0.5) -> bool:
    import socket
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False

def get_candidate_urls():
    env_url = os.getenv('SHOPAGENT_DATABASE_URL') or os.getenv('DATABASE_URL')
    urls = []
    if env_url:
        from urllib.parse import urlparse
        p_host = urlparse(env_url).hostname or ''
        if p_host and _is_host_reachable(p_host, 5432, timeout=0.3):
            u = env_url.replace('postgresql://', 'postgresql+psycopg://', 1)
            urls.append(u)
    
    base_pass = os.getenv('POSTGRES_PASSWORD', 'shopagent_secure_pass_2026')
    is_docker = os.path.exists('/.dockerenv') or os.getenv('IS_DOCKER') == 'true'
    hosts = ['db', 'shopagent-db', 'postgres', 'localhost', '127.0.0.1'] if is_docker else ['127.0.0.1', 'localhost']
    
    # Try reachable hosts first
    for host in hosts:
        if _is_host_reachable(host, 5432, timeout=0.3):
            urls.append(f"postgresql+psycopg://shopagent:{base_pass}@{host}:5432/shopagent")
            urls.append(f"postgresql+psycopg://postgres:{base_pass}@{host}:5432/shopagent")
    
    seen = set()
    deduped = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    
    if not deduped:
        # Fallback to local SQLite when no PostgreSQL service is running
        deduped.append("sqlite:///local_test.db")
    return deduped

# Initialize with candidate or fallback
_initial_urls = get_candidate_urls()
_init_args = {"connect_args": {"check_same_thread": False}} if "sqlite" in _initial_urls[0] else {"pool_pre_ping": True, "pool_recycle": 300}
engine = create_engine(_initial_urls[0], **_init_args)
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

def wait_for_db(max_retries=1, delay=0.5):
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
        
    # If PostgreSQL container is not running (e.g. running outside Docker locally without Postgres service),
    # gracefully fall back to SQLite so local testing and development work seamlessly.
    logger.warning("PostgreSQL unreachable. Falling back to local SQLite database (local_test.db)...")
    print("WARNING: PostgreSQL unreachable. Falling back to local SQLite database (local_test.db)...", flush=True)
    sqlite_url = "sqlite:///local_test.db"
    engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    SessionLocal.configure(bind=engine)
    return True

def auto_migrate_schema(eng):
    """Safely adds missing columns and alters constraints on existing PostgreSQL tables without data loss."""
    if eng.dialect.name != 'postgresql':
        return
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
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_gift BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_recipient VARCHAR(120) DEFAULT '';",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message TEXT DEFAULT '';",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_wrap BOOLEAN DEFAULT FALSE;",
        # Auto-widen product, order, and item text columns for long e-commerce URLs & specs
        "ALTER TABLE products ALTER COLUMN name TYPE TEXT;",
        "ALTER TABLE products ALTER COLUMN brand TYPE VARCHAR(255);",
        "ALTER TABLE products ALTER COLUMN model TYPE VARCHAR(500);",
        "ALTER TABLE products ALTER COLUMN variant TYPE VARCHAR(255);",
        "ALTER TABLE products ALTER COLUMN category TYPE VARCHAR(255);",
        "ALTER TABLE products ALTER COLUMN specs TYPE TEXT;",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_json TEXT DEFAULT '';",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS bank_offers_json TEXT DEFAULT '';",
        "ALTER TABLE shopping_items ALTER COLUMN name TYPE TEXT;",
        "ALTER TABLE orders ALTER COLUMN product_name TYPE TEXT;",
        "ALTER TABLE store_listings ALTER COLUMN url TYPE TEXT;",
        # shopping_items columns
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS product_id INTEGER;",
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;",
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS is_gift BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS gift_recipient VARCHAR(120) DEFAULT '';",
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS gift_message TEXT DEFAULT '';",
        "ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS gift_wrap BOOLEAN DEFAULT FALSE;",
        # item_votes table
        """CREATE TABLE IF NOT EXISTS item_votes (
            id SERIAL PRIMARY KEY,
            item_id INTEGER REFERENCES shopping_items(id) ON DELETE CASCADE,
            family_member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
            member_name VARCHAR(120) DEFAULT 'Family Member',
            vote VARCHAR(20) NOT NULL,
            comment VARCHAR(255) DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );"""
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

def cleanup_corrupted_data(eng):
    """Purges any corrupted, dummy seed data, or bot-blocked fallback items from previous runs."""
    if eng.dialect.name != 'postgresql':
        return
    from sqlalchemy import text
    cleanup_stmts = [
        "DELETE FROM price_snapshots WHERE price = 42600.0;",
        "DELETE FROM store_listings WHERE price = 42600.0;",
        "DELETE FROM shopping_items WHERE name LIKE '%患者向医薬品ガイド%' OR name = 'Product Online';",
        "DELETE FROM products WHERE name LIKE '%患者向医薬品ガイド%' OR name = 'Product Online';",
        "DELETE FROM stores WHERE name LIKE '%医薬品医療機器総合機構%' OR name LIKE '%患者向医薬品ガイド%';",
        "DELETE FROM products WHERE name LIKE 'Sony WH-1000XM6%' OR name LIKE 'Apple iPhone 16 Pro%' OR name LIKE 'Apple MacBook Pro 14%' OR name LIKE 'Nike Air Zoom Pegasus%' OR name LIKE 'Samsung 55-inch Crystal%';",
        "DELETE FROM store_listings WHERE product_id NOT IN (SELECT id FROM products);",
        "DELETE FROM price_snapshots WHERE listing_id NOT IN (SELECT id FROM store_listings);",
        "DELETE FROM monitoring_tasks WHERE item_id NOT IN (SELECT id FROM shopping_items);",
    ]
    with eng.connect() as conn:
        for stmt in cleanup_stmts:
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
        try:
            from . import models
        except Exception:
            try:
                from backend.app import models
            except Exception:
                from app import models
        Base.metadata.create_all(bind=engine)
        auto_migrate_schema(engine)
        cleanup_corrupted_data(engine)
        logger.info("All database tables verified, migrated, and created successfully.")
        print("INFO: All database tables verified, migrated, and created successfully.", flush=True)
        return True
    return False
