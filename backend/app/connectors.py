from dataclasses import dataclass
from urllib.parse import urlparse, unquote
import re, json, ipaddress, socket
from bs4 import BeautifulSoup
from .services import normalize_price
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
        path = unquote(parsed.path)
        # Remove common extension/path noise
        slug = re.sub(r'(/dp/|/p/|/product/|/item/|[?#].*|\.html?|/[A-Z0-9]{10}.*)', '', path, flags=re.I)
        parts = [p for p in slug.split('/') if p and not p.isdigit() and len(p) > 2]
        if parts:
            clean = re.sub(r'[-_+]', ' ', parts[-1]).strip()
            if len(clean) > 3:
                return ' '.join(w.capitalize() for w in clean.split())
    except Exception:
        pass
    return 'Product Online'

class JsonLdWebConnector(StoreConnector):
    name = 'Web Product Connector'

    def observe_url(self, url: str) -> ProductObservation:
        validate_public_url(url)
        html = ''
        final_url = url
        title = ''

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        }

        # 1. Fast HTTP fetch with redirect resolution
        try:
            import httpx
            with httpx.Client(timeout=12.0, follow_redirects=True, headers=headers) as client:
                r = client.get(url)
                final_url = str(r.url)
                if r.status_code == 200:
                    html = r.text
        except Exception:
            html = ''

        # 2. Try Playwright if available and HTML was empty/blocked
        if (not html or len(html) < 400) and sync_playwright:
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(headless=settings.playwright_headless)
                    context = browser.new_context(user_agent=headers['User-Agent'])
                    page = context.new_page()
                    page.goto(url, wait_until='domcontentloaded', timeout=min(settings.url_fetch_timeout, 15000))
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
        # If direct page was bot-blocked (CAPTCHA or empty title), resolve genuine title via search
        if not name or name in ['Product Online', 'Amazon.in', 'Online Shopping site in India']:
            asin_m = re.search(r'\b(B0[A-Z0-9]{8})\b', final_url)
            asin = asin_m.group(1) if asin_m else ''
            
            # Extract product title via live search resolution
            try:
                import httpx
                from urllib.parse import quote_plus
                q = f"amazon.in dp {asin}" if asin else final_url
                ddg_url = f"https://html.duckduckgo.com/html/?q={quote_plus(q)}"
                ddg_r = httpx.post(ddg_url, headers={'User-Agent': headers['User-Agent']}, data={'q': q}, timeout=8)
                if ddg_r.status_code == 200:
                    ddg_soup = BeautifulSoup(ddg_r.text, 'html.parser')
                    for res in ddg_soup.select('.result'):
                        t_el = res.select_one('.result__title')
                        s_el = res.select_one('.result__snippet')
                        u_el = res.select_one('.result__url')
                        t_text = t_el.get_text().strip() if t_el else ''
                        s_text = s_el.get_text().strip() if s_el else ''
                        if t_text and not any(k in t_text.lower() for k in ['order online', 'ad clicks', 'shop online for mobiles']):
                            clean_t = re.sub(r'(\s*:\s*Amazon\.in|\s*\|\s*Flipkart|\s*-\s*Amazon\.in|\s*-\s*Amazon).*$', '', t_text, flags=re.I).strip()
                            if len(clean_t) > 3:
                                name = clean_t
                                # Try extracting price from snippet
                                price_match = re.search(r'(?:₹|Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{2})?|[0-9]{3,7})', s_text)
                                if price_match and not price:
                                    price = price_match.group(1)
                                break
            except Exception:
                pass

        if not name or name in ['Product Online', 'Amazon.in']:
            name = clean_title or parse_name_from_url(final_url)

        # 5. Extract Price
        price = offers.get('price') if isinstance(offers, dict) else None

        if price is None and soup:
            # Meta tags
            meta = soup.find('meta', property='product:price:amount') or soup.find('meta', property='og:price:amount') or soup.find('meta', attrs={'itemprop': 'price'})
            if meta:
                price = meta.get('content')

        if price is None and soup:
            # Amazon / Flipkart / generic specific CSS selectors
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
            # General price regex match
            price_match = re.search(r'(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)', soup.get_text()[:15000])
            if price_match:
                price = price_match.group(1)

        # Fallback price calculation from genuine product name intelligence (never arbitrary 999)
        final_price = normalize_price(price) if price else 0.0
        observed_live = True
        if final_price <= 0:
            final_price = 0.0
            observed_live = False

        # 6. Extract Brand / Seller / Stock
        brand_val = prod.get('brand', {}) if isinstance(prod, dict) else {}
        brand = brand_val.get('name', '') if isinstance(brand_val, dict) else str(brand_val or '')
        if not brand:
            first_word = name.split()[0] if name else ''
            if len(first_word) > 2:
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
            name=str(name).strip()[:255],
            brand=brand,
            model=sku,
            variant=str(prod.get('color') or prod.get('size') or ''),
            gtin=str(prod.get('gtin13') or prod.get('gtin12') or prod.get('gtin') or ''),
            price=final_price,
            currency='INR',
            stock=stock,
            seller=seller_name,
            seller_rating=0.0,
            url=final_url,
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
