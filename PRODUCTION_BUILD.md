# ShopAgent Production Build Notes

## Batch intake
The production API and UI support up to 20 product URLs and 50 To-Buy items per batch. URLs are independently verified. Failed URLs are returned with an error and never become fabricated offers. A batch may optionally start monitoring all verified URLs at one target price; the API also supports per-URL `monitor`, `target_price`, `max_price`, and `purchase_mode` settings.

## Production build commands

### Backend
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Web
```bash
cd web
npm ci
npm run build
npm start
```

### Browser extension
```bash
cd extension
npm ci
npm run build
```
Load `extension/dist` as an unpacked Chromium extension. Set the deployed HTTPS API URL in the extension popup before signing in.

## Verification performed in this environment
- Python compilation: passed
- Backend test suite: 12 passed
- Extension TypeScript compilation: passed
- Web TSX syntax transpilation: passed
- Full web `npm ci` / Next.js production compilation could not be completed in this environment because npm dependency download timed out; no success claim is made for that step.

## Production integrations
Retailer-specific checkout is capability-gated. ShopAgent never fabricates a completed purchase and never bypasses CAPTCHA, OTP, 2FA, anti-bot or payment verification. An approved retailer adapter must be configured before automated checkout is enabled.
