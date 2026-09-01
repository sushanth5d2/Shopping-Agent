# Production integration boundaries

ShopAgent is production-oriented, but a retailer is not a generic API. A store may expose product feeds/API, public product pages, login requirements, anti-bot controls, checkout APIs, or no supported automation at all.

The connector layer records capabilities. The checkout layer only executes when a capability-backed adapter exists. Otherwise the API returns a manual handoff URL. This is intentional and is the only honest production behavior without a documented/authorized retailer integration.
