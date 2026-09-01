# Database

Alembic owns schema evolution. SQLite is supported for local testing; PostgreSQL is the intended production database. Every user-owned object contains a user relationship either directly or through the shopping list.

Core models: User, RefreshToken, UserPreference, ShoppingList, ShoppingItem, Product, Store, Seller, StoreListing, PriceSnapshot, MonitoringTask, PriceAlert, PurchaseRule, Order, PurchaseTransaction, Notification, AgentEvent, InventoryItem, FamilyMember.
