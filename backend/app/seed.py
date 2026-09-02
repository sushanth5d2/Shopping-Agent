"""Database seeding script for ShopAgent.
Populates stores, sellers, catalog products, live listings, and price snapshot history.
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from .models import Store, Seller, Product, StoreListing, PriceSnapshot, ShoppingItem, ShoppingList, User

def seed_data(db: Session) -> None:
    # Only seed if stores table is empty
    if db.query(Store).count() > 0:
        return

    now = datetime.now(timezone.utc)

    # 1. Stores
    stores_data = [
        {"name": "Amazon India", "base_url": "amazon.in", "search_supported": True, "price_supported": True, "stock_supported": True, "checkout_supported": True, "automation_allowed": True},
        {"name": "Flipkart", "base_url": "flipkart.com", "search_supported": True, "price_supported": True, "stock_supported": True, "checkout_supported": True, "automation_allowed": True},
        {"name": "Croma", "base_url": "croma.com", "search_supported": True, "price_supported": True, "stock_supported": True, "checkout_supported": False, "automation_allowed": False},
        {"name": "Reliance Digital", "base_url": "reliancedigital.in", "search_supported": True, "price_supported": True, "stock_supported": True, "checkout_supported": False, "automation_allowed": False},
        {"name": "Tata CLiQ", "base_url": "tatacliq.com", "search_supported": True, "price_supported": True, "stock_supported": True, "checkout_supported": False, "automation_allowed": False},
        {"name": "Blinkit", "base_url": "blinkit.com", "search_supported": True, "price_supported": True, "stock_supported": True, "checkout_supported": False, "automation_allowed": False},
    ]
    store_map = {}
    for s in stores_data:
        st = Store(**s)
        db.add(st)
        db.flush()
        store_map[st.name] = st

    # 2. Sellers
    sellers_data = [
        {"store_name": "Amazon India", "name": "Appario Retail Pvt Ltd", "rating": 4.8},
        {"store_name": "Amazon India", "name": "Cloudtail Electronics", "rating": 4.7},
        {"store_name": "Flipkart", "name": "RetailNet Official", "rating": 4.6},
        {"store_name": "Flipkart", "name": "Omnitech Retail", "rating": 4.5},
        {"store_name": "Croma", "name": "Croma Official Online Store", "rating": 4.6},
        {"store_name": "Reliance Digital", "name": "Reliance Retail Ltd", "rating": 4.5},
        {"store_name": "Tata CLiQ", "name": "Tata Unistore Digital", "rating": 4.4},
        {"store_name": "Blinkit", "name": "Blinkit Quick Express Hub", "rating": 4.9},
    ]
    seller_map = {}
    for s in sellers_data:
        st = store_map[s["store_name"]]
        sel = Seller(store_id=st.id, name=s["name"], rating=s["rating"])
        db.add(sel)
        db.flush()
        seller_map[s["name"]] = sel

    # 3. Products
    products_data = [
        {
            "name": "Sony WH-1000XM6 Wireless Noise-Cancelling Headphones",
            "brand": "Sony",
            "model": "WH-1000XM6",
            "category": "Electronics / Audio",
            "variant": "Black",
            "gtin": "4548736154321",
            "specs": "Industry-leading active noise cancellation, 30hr battery, LDAC Hi-Res audio, multipoint Bluetooth 5.3",
            "listings": [
                {
                    "store": "Amazon India", "seller": "Appario Retail Pvt Ltd", "price": 24990.0, "delivery": 0.0,
                    "coupon": 1000.0, "cashback": 500.0, "stock": 25, "delivery_days": 1,
                    "warranty": "1 Year Sony India Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.amazon.in/dp/B0CXSONYXM6",
                    "history": [29990.0, 28490.0, 27990.0, 26990.0, 25990.0, 24990.0, 24490.0, 24990.0]
                },
                {
                    "store": "Flipkart", "seller": "RetailNet Official", "price": 25999.0, "delivery": 0.0,
                    "coupon": 500.0, "cashback": 0.0, "stock": 14, "delivery_days": 2,
                    "warranty": "1 Year Manufacturer Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.flipkart.com/sony-wh-1000xm6/p/itm1000xm6",
                    "history": [29990.0, 28990.0, 27490.0, 26490.0, 25999.0]
                },
                {
                    "store": "Croma", "seller": "Croma Official Online Store", "price": 26990.0, "delivery": 0.0,
                    "coupon": 0.0, "cashback": 0.0, "stock": 8, "delivery_days": 3,
                    "warranty": "1 Year Brand Warranty", "returns": "15 Days Return",
                    "url": "https://www.croma.com/sony-wh-1000xm6-headphones/p/276543",
                    "history": [29990.0, 28990.0, 27990.0, 26990.0]
                }
            ]
        },
        {
            "name": "Apple iPhone 16 Pro 256GB Desert Titanium",
            "brand": "Apple",
            "model": "iPhone 16 Pro",
            "category": "Smartphones",
            "variant": "Desert Titanium 256GB",
            "gtin": "195949123456",
            "specs": "A18 Pro chip, Grade 5 Titanium, 48MP Fusion camera system, Super Retina XDR OLED display with ProMotion",
            "listings": [
                {
                    "store": "Amazon India", "seller": "Appario Retail Pvt Ltd", "price": 119900.0, "delivery": 0.0,
                    "coupon": 2000.0, "cashback": 1500.0, "stock": 18, "delivery_days": 1,
                    "warranty": "1 Year Apple Global Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.amazon.in/dp/B0DIPH16PRO",
                    "history": [129900.0, 124900.0, 122900.0, 119900.0]
                },
                {
                    "store": "Reliance Digital", "seller": "Reliance Retail Ltd", "price": 118990.0, "delivery": 0.0,
                    "coupon": 1000.0, "cashback": 0.0, "stock": 10, "delivery_days": 2,
                    "warranty": "1 Year Apple Brand Warranty", "returns": "7 Days Return",
                    "url": "https://www.reliancedigital.in/apple-iphone-16-pro-256gb/p/494421",
                    "history": [129900.0, 125900.0, 121900.0, 118990.0]
                }
            ]
        },
        {
            "name": "Logitech MX Master 3S Wireless Performance Mouse",
            "brand": "Logitech",
            "model": "MX Master 3S",
            "category": "Computer Accessories",
            "variant": "Graphite",
            "gtin": "097855175235",
            "specs": "8K DPI optical sensor with glass tracking, quiet clicks, MagSpeed electromagnetic scrolling, USB-C fast charge",
            "listings": [
                {
                    "store": "Amazon India", "seller": "Appario Retail Pvt Ltd", "price": 8495.0, "delivery": 0.0,
                    "coupon": 300.0, "cashback": 200.0, "stock": 42, "delivery_days": 1,
                    "warranty": "2 Year Limited Hardware Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.amazon.in/dp/B09HM94VDS",
                    "history": [10995.0, 9995.0, 9495.0, 8995.0, 8495.0]
                },
                {
                    "store": "Croma", "seller": "Croma Official Online Store", "price": 8995.0, "delivery": 0.0,
                    "coupon": 0.0, "cashback": 0.0, "stock": 12, "delivery_days": 2,
                    "warranty": "2 Year Logitech Warranty", "returns": "7 Days Return",
                    "url": "https://www.croma.com/logitech-mx-master-3s-mouse/p/261234",
                    "history": [10995.0, 9995.0, 8995.0]
                }
            ]
        },
        {
            "name": "Samsung Galaxy S24 Ultra 512GB Titanium Gray",
            "brand": "Samsung",
            "model": "Galaxy S24 Ultra",
            "category": "Smartphones",
            "variant": "Titanium Gray 512GB",
            "gtin": "8806095321111",
            "specs": "Galaxy AI, 200MP Quad Telephoto Camera, Snapdragon 8 Gen 3 for Galaxy, 6.8 inch Dynamic AMOLED 2X 120Hz",
            "listings": [
                {
                    "store": "Amazon India", "seller": "Cloudtail Electronics", "price": 129999.0, "delivery": 0.0,
                    "coupon": 4000.0, "cashback": 2000.0, "stock": 15, "delivery_days": 1,
                    "warranty": "1 Year Samsung India Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.amazon.in/dp/B0CSAMS24U",
                    "history": [139999.0, 134999.0, 131999.0, 129999.0]
                },
                {
                    "store": "Flipkart", "seller": "RetailNet Official", "price": 131999.0, "delivery": 0.0,
                    "coupon": 2000.0, "cashback": 0.0, "stock": 9, "delivery_days": 2,
                    "warranty": "1 Year Manufacturer Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.flipkart.com/samsung-galaxy-s24-ultra/p/itms24u",
                    "history": [139999.0, 136999.0, 131999.0]
                }
            ]
        },
        {
            "name": "Daawat Ultima Extra Long Basmati Rice 5kg",
            "brand": "Daawat",
            "model": "Ultima",
            "category": "Grocery",
            "variant": "5kg Bag",
            "gtin": "8901537001234",
            "specs": "Extra long aged basmati grains, rich aroma, pearly white slender grains",
            "listings": [
                {
                    "store": "Blinkit", "seller": "Blinkit Quick Express Hub", "price": 899.0, "delivery": 25.0,
                    "coupon": 50.0, "cashback": 0.0, "stock": 120, "delivery_days": 0,
                    "warranty": "Freshness Guaranteed", "returns": "Immediate Return on Delivery",
                    "url": "https://blinkit.com/prn/daawat-ultima-basmati-rice-5kg/prid/12345",
                    "history": [1050.0, 990.0, 950.0, 899.0]
                },
                {
                    "store": "Amazon India", "seller": "Appario Retail Pvt Ltd", "price": 949.0, "delivery": 0.0,
                    "coupon": 0.0, "cashback": 0.0, "stock": 80, "delivery_days": 1,
                    "warranty": "Original Brand Packaging", "returns": "Non-Returnable Grocery",
                    "url": "https://www.amazon.in/dp/B00DAAWAT5KG",
                    "history": [1050.0, 990.0, 949.0]
                }
            ]
        },
        {
            "name": "Anker 100W USB-C Fast Charging Cable 2m",
            "brand": "Anker",
            "model": "PowerLine III Flow 100W",
            "category": "Cables & Accessories",
            "variant": "Midnight Black 2m",
            "gtin": "194644023456",
            "specs": "Supports Power Delivery 3.0 up to 100W, ultra-flexible silicone finish, 25000 bend lifespan",
            "listings": [
                {
                    "store": "Amazon India", "seller": "Appario Retail Pvt Ltd", "price": 899.0, "delivery": 0.0,
                    "coupon": 100.0, "cashback": 0.0, "stock": 150, "delivery_days": 1,
                    "warranty": "18 Months Anker Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.amazon.in/dp/B0ANKER100W",
                    "history": [1299.0, 1199.0, 999.0, 899.0]
                },
                {
                    "store": "Flipkart", "seller": "RetailNet Official", "price": 999.0, "delivery": 40.0,
                    "coupon": 0.0, "cashback": 0.0, "stock": 45, "delivery_days": 2,
                    "warranty": "18 Months Brand Warranty", "returns": "7 Days Replacement",
                    "url": "https://www.flipkart.com/anker-100w-cable/p/itmanker100",
                    "history": [1299.0, 1099.0, 999.0]
                }
            ]
        }
    ]

    for pdata in products_data:
        prod = Product(
            name=pdata["name"],
            brand=pdata["brand"],
            model=pdata["model"],
            category=pdata["category"],
            variant=pdata["variant"],
            gtin=pdata["gtin"],
            specs=pdata["specs"]
        )
        db.add(prod)
        db.flush()

        for ldata in pdata["listings"]:
            st = store_map[ldata["store"]]
            sel = seller_map[ldata["seller"]]
            listing = StoreListing(
                product_id=prod.id,
                store_id=st.id,
                seller_id=sel.id,
                url=ldata["url"],
                currency="INR",
                price=ldata["price"],
                delivery=ldata["delivery"],
                tax=0.0,
                fees=0.0,
                coupon=ldata.get("coupon", 0.0),
                cashback=ldata.get("cashback", 0.0),
                stock=ldata["stock"],
                delivery_days=ldata.get("delivery_days", 1),
                warranty=ldata.get("warranty", ""),
                returns=ldata.get("returns", ""),
                condition="New",
                observed_at=now
            )
            db.add(listing)
            db.flush()

            # Add historical price snapshots
            hist = ldata.get("history", [ldata["price"]])
            for i, hprice in enumerate(hist):
                snapshot_time = now - timedelta(days=len(hist) - i, hours=i * 2)
                db.add(PriceSnapshot(
                    listing_id=listing.id,
                    price=hprice,
                    delivery=ldata["delivery"],
                    total=hprice + ldata["delivery"] - ldata.get("coupon", 0.0) - ldata.get("cashback", 0.0),
                    stock=ldata["stock"],
                    seller=sel.name,
                    timestamp=snapshot_time
                ))

    db.commit()


def seed_user_defaults(db: Session, user_id: int, list_id: int) -> None:
    """Populate default starter shopping items for a newly registered user so their dashboard has rich interactive data."""
    # Check if user already has items
    if db.query(ShoppingItem).filter_by(list_id=list_id).count() > 0:
        return

    # Find seeded products
    sony = db.query(Product).filter(Product.name.like("%Sony WH-1000XM6%")).first()
    rice = db.query(Product).filter(Product.name.like("%Basmati Rice%")).first()
    cable = db.query(Product).filter(Product.name.like("%Anker%")).first()
    logi = db.query(Product).filter(Product.name.like("%MX Master%")).first()

    items_to_add = [
        {"name": "Sony WH-1000XM6 Wireless Noise-Cancelling Headphones", "quantity": 1, "target_price": 24000.0, "max_price": 27000.0, "mode": "MONITOR", "purchase_mode": "ASK", "product_id": sony.id if sony else None},
        {"name": "Daawat Ultima Extra Long Basmati Rice 5kg", "quantity": 1, "target_price": 900.0, "max_price": 1000.0, "mode": "BUY_NOW", "purchase_mode": "ASK", "product_id": rice.id if rice else None},
        {"name": "Anker 100W USB-C Fast Charging Cable 2m", "quantity": 2, "target_price": 850.0, "max_price": 1000.0, "mode": "BUY_NOW", "purchase_mode": "ASK", "product_id": cable.id if cable else None},
        {"name": "Logitech MX Master 3S Wireless Performance Mouse", "quantity": 1, "target_price": 8000.0, "max_price": 9000.0, "mode": "MONITOR", "purchase_mode": "ASK", "product_id": logi.id if logi else None}
    ]

    for item_data in items_to_add:
        it = ShoppingItem(list_id=list_id, **item_data)
        db.add(it)
        db.flush()
        if it.mode == "MONITOR":
            from .models import MonitoringTask
            t = MonitoringTask(item_id=it.id, status="WATCHING", last_checked=datetime.now(timezone.utc), next_check=datetime.now(timezone.utc) + timedelta(minutes=360))
            db.add(t)

    db.commit()
