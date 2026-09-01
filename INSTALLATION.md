# Installation

1. Install Python 3.11+ and Node 20+.
2. Copy `.env.example` to `.env`.
3. Install backend requirements.
4. Run `alembic upgrade head`.
5. Start FastAPI.
6. Install web dependencies and run Next.js.
7. For live URL ingestion install Playwright Chromium: `playwright install chromium`.
8. For mobile use an API URL reachable from the device.
9. Build the Chromium extension with `npm run build`.

The default environment contains no fake retailer catalog. The application is production-mode by default.
