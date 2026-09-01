# Security

- Argon2 password hashing.
- Short-lived JWT access tokens and revocable refresh tokens.
- User-scoped queries.
- Bearer authentication avoids cookie-CSRF for the API.
- No card/CVV/PIN storage.
- Idempotency keys on purchase requests.
- Duplicate order protection.
- Global maximum, monthly maximum, item maximum and seller rating checks.
- Emergency stop checked server-side.
- AI cannot authorize a purchase.
- Live price observations are timestamped.
- Checkout changes, OTP, 2FA, CAPTCHA and payment verification return USER_ACTION_REQUIRED.
- Secrets are environment variables.

Before internet deployment: HTTPS, managed secrets, WAF/rate-limit layer, centralized audit logs, database backups, dependency scanning, SAST/DAST, key rotation, monitoring and an independent security review are required.
