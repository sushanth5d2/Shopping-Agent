# API

Authentication: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`.

Shopping: `/api/intent`, `/api/items`, `/api/items/{id}`, `/api/items/{id}/monitor`.

Live data: `/api/products/ingest-url`, `/api/products/{id}/compare`, `/api/products/{id}/analysis`.

Monitoring/notifications: `/api/monitoring`, `/api/notifications`.

Purchases: `/api/items/{id}/checkout`, `/api/orders`.

Personalization: `/api/preferences`, `/api/rules`, `/api/inventory`, `/api/family/members`, `/api/basket`, `/api/savings`.

Operational: `/api/dashboard`, `/api/activity`, `/api/health`.

## Product URL workflow

`POST /api/products/url-analyze`

Body:
```json
{
  "url": "https://retailer.example/product/item",
  "monitor": true,
  "target_price": 25000,
  "max_price": 26000,
  "purchase_mode": "ASK"
}
```

The endpoint fetches the supplied product page, records a live source listing, optionally discovers other sites through the configured search provider, fetches those candidate pages, performs conservative identity matching, and returns only successfully observed listings in the comparison set. Setting `monitor=true` also creates a Monitoring task for the product.
