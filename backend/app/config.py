from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    database_url:str='sqlite:///./shopagent.db'
    jwt_secret:str='shopagent-local-development-secret-change-in-production-please-use-a-random-32-byte-secret'
    access_minutes:int=15
    refresh_days:int=30
    cors_origins:str='http://localhost:3000'
    ollama_base_url:str='http://localhost:11434'
    ollama_model:str='qwen3:8b'
    ai_provider:str='ollama'
    ai_api_base_url:str='https://api.openai.com/v1'
    ai_api_key:str=''
    ai_api_model:str='gpt-4o-mini'
    ai_timeout:int=60
    telegram_bot_token:str=''
    telegram_chat_id:str=''
    serper_api_key:str=''
    google_api_key:str=''
    google_cx:str=''
    url_fetch_timeout:int=30000
    max_comparison_sources:int=8
    allow_demo_seed:bool=False
    playwright_headless:bool=True
    model_config=SettingsConfigDict(env_prefix='SHOPAGENT_',env_file='.env',extra='ignore')
settings=Settings()
