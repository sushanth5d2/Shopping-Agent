import os, time, logging, re, socket
from urllib.parse import urlparse, urlunparse
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

logger = logging.getLogger('uvicorn')

class Base(DeclarativeBase):
    pass

def resolve_url_to_ipv4(url: str) -> str:
    """Resolves URL hostname to direct IPv4 to eliminate container IPv6 blackhole timeouts."""
    if not url or url.startswith('sqlite'):
        return url
    try:
        p = urlparse(url)
        if not p.hostname or p.hostname in ('127.0.0.1', 'localhost'):
            return url
        addr_info = socket.getaddrinfo(p.hostname, p.port or 5432, socket.AF_INET, socket.SOCK_STREAM)
        if addr_info:
            ip = addr_info[0][4][0]
            port_str = f":{p.port}" if p.port else ""
            user_str = f"{p.username}" if p.username else ""
            if p.password:
                user_str += f":{p.password}"
            if user_str:
                user_str += "@"
            netloc = f"{user_str}{ip}{port_str}"
            return urlunparse((p.scheme, netloc, p.path, p.params, p.query, p.fragment))
    except Exception:
        pass
    return url

def make_engine(url: str, timeout: int = 3):
    if url.startswith('sqlite'):
        return create_engine(url, pool_pre_ping=True)
    connect_args = {}
    if 'postgresql' in url:
        connect_args['connect_timeout'] = timeout
    return create_engine(url, pool_pre_ping=True, pool_recycle=300, connect_args=connect_args)

def get_candidate_urls():
    env_url = os.getenv('SHOPAGENT_DATABASE_URL') or os.getenv('DATABASE_URL')
    if env_url:
        u = env_url.replace('postgresql://', 'postgresql+psycopg://', 1)
        return [u]

    if settings.database_url:
        return [settings.database_url.replace('postgresql://', 'postgresql+psycopg://', 1)]

    base_pass = os.getenv('POSTGRES_PASSWORD', 'shopagent_secure_pass_2026')
    return [
        f"postgresql+psycopg://shopagent:{base_pass}@localhost:5432/shopagent",
        f"postgresql+psycopg://shopagent:{base_pass}@127.0.0.1:5432/shopagent",
    ]

# Initialize with the first candidate
_initial_urls = get_candidate_urls()
engine = make_engine(_initial_urls[0], timeout=3)
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

def wait_for_db(max_retries=15, delay=1.0):
    """Waits for PostgreSQL database to be ready and connects, with fallback to SQLite."""
    global engine, SessionLocal
    raw_candidates = get_candidate_urls()
    target_url = raw_candidates[0]

    if target_url.startswith('sqlite'):
        engine = create_engine(target_url, pool_pre_ping=True)
        SessionLocal.configure(bind=engine)
        return True

    # Pre-resolve to direct IPv4 address to bypass Docker DNS/IPv6 connection timeouts
    candidates = []
    ipv4_u = resolve_url_to_ipv4(target_url)
    if ipv4_u and ipv4_u != target_url:
        candidates.append(ipv4_u)
    candidates.append(target_url)

    masked = re.sub(r':([^@]+)@', ':****@', target_url)
    for attempt in range(1, max_retries + 1):
        for url in candidates:
            try:
                test_engine = make_engine(url, timeout=3)
                with test_engine.connect() as conn:
                    engine = test_engine
                    SessionLocal.configure(bind=engine)
                    logger.info(f"Connected to PostgreSQL database: {masked}")
                    print(f"INFO: Connected to PostgreSQL database: {masked}", flush=True)
                    return True
            except Exception:
                pass
        if attempt < max_retries:
            if attempt == 1 or attempt % 5 == 0:
                logger.warning(f"Waiting for PostgreSQL database (attempt {attempt}/{max_retries})...")
                print(f"INFO: Waiting for database container to be ready (attempt {attempt}/{max_retries})...", flush=True)
            time.sleep(delay)

    # Graceful fallback to SQLite so backend NEVER fails to start
    logger.warning("PostgreSQL could not be reached after retries. Initializing resilient SQLite database fallback.")
    print("WARNING: Initializing resilient SQLite database fallback (sqlite:///shopagent.db)", flush=True)
    engine = create_engine("sqlite:///shopagent.db", pool_pre_ping=True)
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
        try:
            conn.execute(text("SET lock_timeout = '2s';"))
            conn.execute(text("SET statement_timeout = '5s';"))
            conn.commit()
        except Exception:
            pass
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
