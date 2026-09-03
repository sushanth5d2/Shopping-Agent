from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    database_url: str = 'postgresql+psycopg://shopagent:shopagent_secure_pass_2026@localhost:5432/shopagent'
    jwt_secret: str = 'shopagent-local-development-secret-change-in-production-please-use-a-random-32-byte-secret'
    access_minutes: int = 15
    refresh_days: int = 30
    cors_origins: str = '*'
    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'qwen3:8b'
    ai_provider: str = 'builtin'
    ai_api_base_url: str = 'https://api.openai.com/v1'
    ai_api_key: str = ''
    ai_api_model: str = 'gpt-4o-mini'
    ai_timeout: int = 60
    telegram_bot_token: str = ''
    telegram_chat_id: str = ''
    serper_api_key: str = ''
    google_api_key: str = ''
    google_cx: str = ''
    youtube_api_key: str = ''
    review_search_timeout: int = 10
    url_fetch_timeout: int = 30000
    max_comparison_sources: int = 8
    allow_demo_seed: bool = True
    playwright_headless: bool = True
    model_config = SettingsConfigDict(
        env_prefix='SHOPAGENT_',
        env_file=str(PROJECT_ROOT / '.env'),
        env_file_encoding='utf-8',
        extra='ignore',
    )

settings = Settings()
