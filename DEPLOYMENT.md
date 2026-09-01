# Deployment

Recommended: PostgreSQL, FastAPI behind HTTPS, Next.js behind HTTPS, managed secrets, persistent monitoring worker, centralized logs, metrics, alerts and database backups.

Do not run the local SQLite file as a horizontally scaled production database.

Retailer integrations are deployment-specific. Store credentials/session data must remain outside the AI prompt and be encrypted/managed separately.
