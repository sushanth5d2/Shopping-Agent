# Product URL Intelligence

Paste a retailer product URL into the Home command center. ShopAgent fetches the page, extracts Product/Offer structured data, creates a Product DNA record, records the live source listing, and searches configured web discovery providers for other candidate listings.

Only candidates that can be fetched and matched to the same product identity are included in the live price comparison. Search snippets alone are never treated as prices.

### Compare only
The source URL is analyzed and alternatives are discovered; no monitoring task is created.

### Compare + Monitor
The source URL is analyzed, alternatives are discovered, and a monitoring task is created for the resulting product. Monitoring later refreshes every known listing URL through the connector.

Configure one of:
- `SHOPAGENT_SERPER_API_KEY` (Serper)
- `SHOPAGENT_GOOGLE_API_KEY` + `SHOPAGENT_GOOGLE_CX` (Google Custom Search)

If no discovery provider is configured, the supplied URL still works as a live source, but cross-site discovery is unavailable rather than fabricated.
