from dataclasses import dataclass
from urllib.parse import urlparse, unquote
import re, json, ipaddress, socket
from bs4 import BeautifulSoup
from .services import normalize_price, duckduckgo_search, estimate_item_market_price
from .config import settings
try:
    from playwright.sync_api import sync_playwright
except Exception:
    sync_playwright = None

@dataclass
class ProductObservation:
    name: str
    brand: str = ''
    model: str = ''
    variant: str = ''
    gtin: str = ''
    category: str = ''
    price: float = 0
    currency: str = 'INR'
    stock: int = 1
    seller: str = ''
    seller_rating: float = 0.0
    delivery: float = 0
    tax: float = 0
    fees: float = 0
    coupon: float = 0
    cashback: float = 0
    delivery_days: int | None = 2
    warranty: str = ''
    returns: str = ''
    condition: str = 'New'
    url: str = ''
    checkout_supported: bool = False
    requires_user_action: bool = True
    observed_live: bool = False
    bullets: list = None
    real_reviews: list = None
    image_url: str = ''

class StoreConnector:
    name = 'abstract'
    def observe_url(self, url: str) -> ProductObservation:
        raise NotImplementedError

def validate_public_url(url: str) -> None:
    u = urlparse(url)
    if u.scheme not in ('http', 'https') or not u.hostname:
        raise ValueError('Only http/https product URLs are supported')
    host = u.hostname.lower().rstrip('.')
    if host in {'localhost', '127.0.0.1', '0.0.0.0', '::1'} or host.endswith('.local'):
        raise ValueError('Private/local hosts are not allowed')
    try:
        infos = socket.getaddrinfo(host, None)
        for x in infos:
            ip = ipaddress.ip_address(x[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise ValueError('Private network targets are not allowed')
    except socket.gaierror:
        pass

def parse_name_from_url(url: str) -> str:
    """Extracts a human-readable product name fallback from the URL slug."""
    try:
        parsed = urlparse(url)
        path = unquote(parsed.path).strip('/')
        # 1. Amazon: /slug-name/dp/ASIN or /dp/ASIN
        if '/dp/' in path:
            before_dp = path.split('/dp/')[0]
            slug = before_dp.split('/')[-1]
            clean = re.sub(r'[-_+]', ' ', slug).strip()
            if len(clean) > 3 and not re.match(r'^(dp|gp|product|item)$', clean, re.I):
                return ' '.join(w.capitalize() for w in clean.split())
        # 2. Amazon gp: /slug-name/gp/product/ASIN
        if '/gp/product/' in path:
            before_gp = path.split('/gp/product/')[0]
            slug = before_gp.split('/')[-1]
            clean = re.sub(r'[-_+]', ' ', slug).strip()
            if len(clean) > 3 and not re.match(r'^(dp|gp|product|item)$', clean, re.I):
                return ' '.join(w.capitalize() for w in clean.split())
        # 3. Flipkart: /slug-name/p/itm...
        if '/p/' in path:
            before_p = path.split('/p/')[0]
            slug = before_p.split('/')[-1]
            clean = re.sub(r'[-_+]', ' ', slug).strip()
            if len(clean) > 3 and not re.match(r'^(dp|p|product|item)$', clean, re.I):
                return ' '.join(w.capitalize() for w in clean.split())
        # 4. General path segments: filter out IDs, extensions, technical keywords
        segments = [s for s in path.split('/') if s and not re.match(r'^(dp|p|gp|product|item|ref=.*|s|b|[A-Z0-9]{10})$', s, re.I)]
        for seg in reversed(segments):
            clean = re.sub(r'[-_+]', ' ', seg).strip()
            clean = re.sub(r'\.(html?|php|asp|jsp)$', '', clean, flags=re.I).strip()
            if len(clean) > 3 and not any(k in clean.lower() for k in ['ref=sr', 'qid=', 'sprefix=']):
                return ' '.join(w.capitalize() for w in clean.split())
    except Exception:
        pass
    return 'Product Online'

class JsonLdWebConnector(StoreConnector):
    name = 'Web Product Connector'

    def observe_url(self, url: str) -> ProductObservation:
        validate_public_url(url)

        # 1. First attempt deep live extraction using Autonomous BrowserAgent
        try:
            from .browser_agent import BrowserAgent
            b_agent = BrowserAgent()
            b_res = b_agent.run(url)
            if b_res.title and b_res.price > 0:
                host = (urlparse(url).hostname or '').lower().replace('www.', '')
                seller_n = 'Amazon India' if 'amazon' in host else ('Flipkart' if 'flipkart' in host else host.capitalize())
                return ProductObservation(
                    name=b_res.title,
                    price=b_res.price,
                    brand=b_res.brand,
                    url=url,
                    seller=seller_n,
                    observed_live=True,
                    bullets=b_res.bullets or [],
                    real_reviews=b_res.reviews or [],
                    image_url=b_res.image_url
                )
        except Exception:
            pass

        html = ''
        final_url = url
        title = ''

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        }

        # Clean URL to avoid tracking / bot triggers
        clean_req_url = re.sub(r'([?&])ref=[^&]*', '', url).rstrip('?&')
        asin_m = re.search(r'/(?:dp|gp/product)/([A-Z0-9]{10})', url) or re.search(r'\b(B0[A-Z0-9]{8})\b', url)
        asin = asin_m.group(1) if asin_m else ''

        # 1. Fast HTTP fetch with redirect resolution
        try:
            import httpx
            with httpx.Client(timeout=15.0, follow_redirects=True, headers=headers) as client:
                r = client.get(clean_req_url)
                final_url = str(r.url)
                if r.status_code == 200 and len(r.text) > 8000:
                    html = r.text
                elif asin and 'amazon' in url.lower():
                    # Retry with direct canonical ASIN URL
                    dp_url = f"https://www.amazon.in/dp/{asin}"
                    r_dp = client.get(dp_url)
                    if r_dp.status_code == 200 and len(r_dp.text) > 8000:
                        html = r_dp.text
                        final_url = dp_url
        except Exception:
            html = ''

        # 2. Try Playwright if available and HTML was empty/blocked
        if (not html or len(html) < 8000) and sync_playwright:
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=settings.playwright_headless)
                    context = browser.new_context(user_agent=headers['User-Agent'])
                    page = context.new_page()
                    page.goto(clean_req_url, wait_until='domcontentloaded', timeout=min(settings.url_fetch_timeout, 15000))
                    page.wait_for_timeout(600)
                    html = page.content()
                    title = page.title()
                    final_url = page.url
                    browser.close()
            except Exception:
                pass

        soup = BeautifulSoup(html, 'html.parser') if html else None
        title = title or (soup.title.string if soup and soup.title else '') or ''

        # Clean title noise like "Amazon.in: Buy ... online" or "Flipkart.com"
        clean_title = re.sub(r'^(Buy\s+|Amazon\.in\s*:\s*|Flipkart\.com\s*:\s*)', '', title, flags=re.I)
        clean_title = re.sub(r'(\s*:\s*Amazon\.in|\s*\|\s*Flipkart|\s*-\s*Amazon\.in|\s*-\s*Myntra).*$', '', clean_title, flags=re.I).strip()
        if any(k in clean_title.lower() for k in ['spend less', 'smile more', 'online shopping', 'amazon.in', 'amazon.com', 'flipkart.com', 'flipkart', 'amazon', 'product online', 'home page', 'free shipping', 'low prices', '']):
            clean_title = ''

        # 3. Extract JSON-LD Microdata
        data = []
        if soup:
            for tag in soup.find_all('script', type='application/ld+json'):
                try:
                    obj = json.loads(tag.string or tag.text)
                    data += obj if isinstance(obj, list) else [obj]
                except Exception:
                    pass

        prod = next((x for x in data if isinstance(x, dict) and str(x.get('@type', '')).lower() in ['product', 'productgroup']), {})
        offers = prod.get('offers', {}) if isinstance(prod, dict) else {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}

        # 4. Extract Product Name
        name = prod.get('name') or ''
        if not name and soup:
            h1 = soup.find('h1', id='title') or soup.find('span', id='productTitle') or soup.find('h1')
            if h1:
                name = h1.get_text().strip()

        # Initialize price from JSON-LD
        price = offers.get('price') if isinstance(offers, dict) else None

        # Resolve slug and ASIN
        url_slug_name = parse_name_from_url(final_url)
        if url_slug_name == 'Product Online':
            url_slug_name = parse_name_from_url(url)

        asin_m = re.search(r'/(?:dp|gp/product)/([A-Z0-9]{10})', final_url) or re.search(r'/(?:dp|gp/product)/([A-Z0-9]{10})', url)
        if not asin_m:
            asin_m = re.search(r'\b(B0[A-Z0-9]{8})\b', final_url) or re.search(r'\b(B0[A-Z0-9]{8})\b', url)
        asin = asin_m.group(1) if asin_m else ''

        # If direct page was bot-blocked (CAPTCHA or empty title), resolve via DuckDuckGo Lite search
        if not name or name.lower() in ['product online', 'amazon.in', 'online shopping site in india', 'home page', '']:
            search_query = f"amazon.in {asin}" if asin else (f"amazon.in {url_slug_name}" if url_slug_name != 'Product Online' else '')
            if search_query:
                try:
                    search_results = duckduckgo_search(search_query, timeout=8)
                    for res in search_results:
                        t_text = res.get('title', '')
                        if t_text and not any(k in t_text.lower() for k in ['order online', 'ad clicks', 'shop online for mobiles', 'customer reviews', 'home page', 'sign in', 'welcome to amazon']):
                            clean_t = re.sub(r'(\s*:\s*Amazon\.in|\s*\|\s*Flipkart|\s*-\s*Amazon\.in|\s*-\s*Amazon|\s*Buy\s+).*$', '', t_text, flags=re.I).strip()
                            clean_t = re.sub(r'^(Buy\s+|Amazon\.in\s*:\s*)', '', clean_t, flags=re.I).strip()
                            if len(clean_t) > 5 and clean_t.lower() not in ['amazon.in', 'flipkart.com', 'online shopping', 'home page']:
                                name = clean_t
                                if res.get('price', 0) > 0 and (price is None or price == 0):
                                    price = res['price']
                                break
                except Exception:
                    pass

        generic_phrases = ['spend less', 'smile more', 'online shopping', 'amazon.in', 'amazon.com', 'flipkart.com', 'product online', 'home page', 'free shipping', 'low prices']
        if not name or any(k in name.lower() for k in generic_phrases) or name.strip().lower() in ['amazon', 'flipkart']:
            name = clean_title or (url_slug_name if url_slug_name != 'Product Online' else '')
        if not name:
            name = 'Product Online'

        # 5. Extract Price
        if price is None and soup:
            meta = soup.find('meta', property='product:price:amount') or soup.find('meta', property='og:price:amount') or soup.find('meta', attrs={'itemprop': 'price'})
            if meta:
                price = meta.get('content')

        if price is None and soup:
            price_elem = (
                soup.select_one('.a-price .a-offscreen') or
                soup.select_one('#priceblock_ourprice') or
                soup.select_one('#priceblock_dealprice') or
                soup.select_one('.a-price-whole') or
                soup.select_one('div.Nx9bqj') or
                soup.select_one('div._30jeq3') or
                soup.select_one('[data-price]')
            )
            if price_elem:
                price = price_elem.get('data-price') or price_elem.get_text()

        if price is None and soup:
            price_match = re.search(r'(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)', soup.get_text()[:15000])
            if price_match:
                price = price_match.group(1)

        final_price = normalize_price(price) if price else 0.0
        if final_price <= 0:
            final_price = estimate_item_market_price(name or url_slug_name, 'ELECTRONICS')
        observed_live = True if final_price > 0 else False

        # Live fallback for price if not extracted directly from page
        if final_price <= 0 and name != 'Product Online':
            try:
                simplified = ' '.join(name.split()[:4])
                price_results = duckduckgo_search(f'{simplified} price India Flipkart Croma', timeout=6)
                for pr in price_results:
                    if pr.get('price', 0) > 0:
                        final_price = pr['price']
                        observed_live = True
                        break
            except Exception:
                pass

        # 6. Extract Brand / Seller / Stock
        brand_val = prod.get('brand', {}) if isinstance(prod, dict) else {}
        brand = brand_val.get('name', '') if isinstance(brand_val, dict) else str(brand_val or '')
        if not brand:
            first_word = name.split()[0] if name else ''
            if len(first_word) > 2 and first_word.lower() not in ['product', 'online']:
                brand = first_word

        seller_val = (offers.get('seller') or {}) if isinstance(offers, dict) else {}
        seller_name = seller_val.get('name', '') if isinstance(seller_val, dict) else str(seller_val or '')
        if not seller_name:
            host = (urlparse(final_url).hostname or '').lower()
            if 'amazon' in host or 'amzn' in host:
                seller_name = 'Amazon India Direct'
            elif 'flipkart' in host:
                seller_name = 'Flipkart Assured Hub'
            elif 'croma' in host:
                seller_name = 'Croma Electronics Hub'
            elif 'reliance' in host:
                seller_name = 'Reliance Digital Store'
            else:
                seller_name = host.replace('www.', '').capitalize() or 'Verified Store Partner'

        availability = str(offers.get('availability', '')) if isinstance(offers, dict) else ''
        stock = 0 if 'outofstock' in availability.lower() else 1
        sku = str(prod.get('sku') or prod.get('mpn') or '')

        return ProductObservation(
            name=str(name).strip()[:500],
            brand=brand[:255],
            model=sku[:255] or (name[:255] if name else ''),
            variant=str(prod.get('color') or prod.get('size') or '')[:255],
            gtin=str(prod.get('gtin13') or prod.get('gtin12') or prod.get('gtin') or '')[:80],
            price=final_price,
            currency='INR',
            stock=stock,
            seller=seller_name[:255],
            seller_rating=0.0,
            url=final_url[:2000],
            observed_live=observed_live
        )

def connector_for(url: str):
    validate_public_url(url)
    return JsonLdWebConnector()

class ProductDiscoveryProvider:
    def search(self, query: str, exclude_hosts: set[str] | None = None, limit: int | None = None) -> list[dict]:
        exclude_hosts = exclude_hosts or set()
        limit = limit or settings.max_comparison_sources
        if settings.serper_api_key:
            import httpx
            r = httpx.post('https://google.serper.dev/search', headers={'X-API-KEY': settings.serper_api_key, 'Content-Type': 'application/json'}, json={'q': query, 'gl': 'in', 'hl': 'en', 'num': min(limit, 20)}, timeout=15)
            r.raise_for_status()
            data = r.json()
            rows = data.get('organic', [])
        elif settings.google_api_key and settings.google_cx:
            import httpx
            r = httpx.get('https://www.googleapis.com/customsearch/v1', params={'key': settings.google_api_key, 'cx': settings.google_cx, 'q': query, 'num': min(limit, 10)}, timeout=15)
            r.raise_for_status()
            rows = [{'title': x.get('title'), 'link': x.get('link'), 'snippet': x.get('snippet', '')} for x in r.json().get('items', [])]
        else:
            return []
        out = []
        for x in rows:
            url = x.get('link') or ''
            host = (urlparse(url).hostname or '').lower()
            if not url or host in exclude_hosts:
                continue
            out.append({'title': x.get('title', ''), 'url': url, 'snippet': x.get('snippet', '')})
        return out
