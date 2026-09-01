# Production architecture

Web, mobile and extension are clients of one FastAPI backend and one relational database. AI is an advisory parser; deterministic purchase policy owns financial authorization. Store connectors own data acquisition. Checkout adapters are capability-gated.

```text
Web / Mobile / Extension
          |
       FastAPI
          |
  +-------+--------+
  |                |
AIProvider     Domain services
                   |
             StoreConnector
                   |
             PostgreSQL
```

Live web ingestion uses Playwright + JSON-LD/metadata extraction. Retailer-specific adapters should be registered only after the retailer's documented API/automation permission is verified. Unknown sites use manual handoff for checkout.


## Production monitoring
Monitoring is server-side only. API containers never run the monitoring scheduler. A dedicated monitoring-worker service executes due checks, persists observations to PostgreSQL, evaluates deterministic rules, and emits notifications. PostgreSQL advisory locking prevents duplicate runs across worker replicas.


### Production runtime
Run PostgreSQL, the API, the dedicated monitoring-worker, and the Next.js web service. Monitoring continues with all client applications closed. The repository contains no demo seed data.
"# Shopping-Agent" 
