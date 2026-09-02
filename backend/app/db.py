import os, time, logging
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import settings

logger = logging.getLogger('uvicorn')

def get_database_url():
    url = os.getenv('SHOPAGENT_DATABASE_URL') or os.getenv('DATABASE_URL') or settings.database_url
    if url.startswith('postgresql://'):
        url = url.replace('postgresql://', 'postgresql+psycopg://', 1)
    return url

db_url = get_database_url()
connect_args = {'check_same_thread': False} if db_url.startswith('sqlite') else {}
engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def wait_for_db(max_retries=30, delay=1.5):
    """Retries connection until PostgreSQL is ready."""
    for i in range(max_retries):
        try:
            with engine.connect() as conn:
                logger.info("Successfully connected to PostgreSQL database.")
                return True
        except Exception as e:
            logger.warning(f"Database connection waiting (attempt {i+1}/{max_retries}): {e}")
            time.sleep(delay)
    return False
