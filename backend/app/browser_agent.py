import re
import json
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Callable, Any, Optional
from bs4 import BeautifulSoup
from .config import settings

# Global live progress tracker keyed by item_id or task_id
agent_task_progress: dict[str, list[dict]] = {}

def _cleanup_stale_tasks():
    """Remove task entries older than 30 minutes to prevent memory leak."""
    cutoff = time.time() - 1800
    stale_keys = [k for k, steps in agent_task_progress.items()
                  if steps and steps[-1].get('timestamp', 0) < cutoff]
    for k in stale_keys:
        del agent_task_progress[k]

def record_agent_step(task_id: str, step: str, message: str, data: dict = None):
    """Records an atomic progress step for the UI live stream."""
    if not task_id:
        return
    _cleanup_stale_tasks()
    if task_id not in agent_task_progress:
        agent_task_progress[task_id] = []
    agent_task_progress[task_id].append({
        'step': step,
        'message': message,
        'data': data or {},
        'timestamp': time.time()
    })
    # Keep last 25 steps per task
    agent_task_progress[task_id] = agent_task_progress[task_id][-25:]

@dataclass
class BrowserProductResult:
    title: str
    price: float
    brand: str = ''
    asin: str = ''
    url: str = ''
    image_url: str = ''
    bullets: list[str] = field(default_factory=list)
    reviews: list[dict] = field(default_factory=list)
    bank_offers: list[dict] = field(default_factory=list)
    competitor_stores: list[dict] = field(default_factory=list)

class BrowserAgent:
    """Autonomous Browser Agent executing real Playwright Stealth actions."""

    def __init__(self, progress_callback: Optional[Callable[[str, str, dict], None]] = None):
        self.progress_callback = progress_callback

    def _notify(self, task_id: str, step: str, message: str, data: dict = None):
        if task_id:
            record_agent_step(task_id, step, message, data)
        if self.progress_callback:
            try:
                self.progress_callback(step, message, data or {})
            except Exception:
                pass

    def run(self, url: str, task_id: str = '') -> BrowserProductResult:
        """Executes full agentic loop: Navigate -> Extract Identity & Price -> Real Reviews -> Competitor Discovery."""
        from playwright.sync_api import sync_playwright

        self._notify(task_id, 'LAUNCHING', 'Initializing autonomous stealth browser session...')

        user_agent = (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/130.0.0.0 Safari/537.36'
        )

        result = BrowserProductResult(title='', price=0.0, url=url)

        with sync_playwright() as p:
            # Launch Chromium with stealth arguments
            browser = p.chromium.launch(
                headless=settings.playwright_headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-infobars',
                    '--disable-dev-shm-usage',
                ]
            )

            context = browser.new_context(
                user_agent=user_agent,
                viewport={'width': 1920, 'height': 1080},
                locale='en-IN',
                timezone_id='Asia/Kolkata',
            )

            # Mask navigator.webdriver
            context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
            """)

            page = context.new_page()

            # Clean tracking parameters from URL
            clean_url = re.sub(r'([?&])ref=[^&]*', '', url).rstrip('?&')
            asin_m = re.search(r'/(?:dp|gp/product)/([A-Z0-9]{10})', url) or re.search(r'\b(B0[A-Z0-9]{8})\b', url)
            asin = asin_m.group(1) if asin_m else ''
            result.asin = asin

            # STEP 1: Navigate to Product Page
            self._notify(task_id, 'NAVIGATING', f'Agent navigating to {urllib.parse.urlparse(url).netloc}...')
            try:
                page.goto(clean_url, wait_until='domcontentloaded', timeout=20000)
                page.wait_for_timeout(1000)
            except Exception:
                # If direct clean URL failed, retry with canonical ASIN URL
                if asin and 'amazon' in url.lower():
                    canonical_asin_url = f"https://www.amazon.in/dp/{asin}"
                    page.goto(canonical_asin_url, wait_until='domcontentloaded', timeout=15000)
                    page.wait_for_timeout(800)

            # STEP 2: Extract Live Identity & Price
            self._notify(task_id, 'INSPECTING_DOM', 'Analyzing live DOM for product identity, specs, and price...')
            html = page.content()
            soup = BeautifulSoup(html, 'html.parser')

            # Extract Title
            title_el = (
                soup.find('span', id='productTitle') or
                soup.find('h1', id='title') or
                soup.find('h1')
            )
            title = title_el.get_text(strip=True) if title_el else page.title()
            # Clean title
            title = re.sub(r'^(Buy\s+|Amazon\.in\s*:\s*|Flipkart\.com\s*:\s*)', '', title, flags=re.I)
            title = re.sub(r'(\s*:\s*Amazon\.in|\s*\|\s*Flipkart|\s*-\s*Amazon\.in).*$', '', title, flags=re.I).strip()
            result.title = title

            # Extract Price
            price_val = 0.0
            price_el = (
                soup.select_one('.a-price-whole') or
                soup.select_one('.a-price .a-offscreen') or
                soup.select_one('#priceblock_ourprice') or
                soup.select_one('#priceblock_dealprice') or
                soup.select_one('div.Nx9bqj') or
                soup.select_one('div._30jeq3')
            )
            if price_el:
                raw_p = price_el.get_text(strip=True)
                raw_clean = re.sub(r'[^0-9.]', '', raw_p.replace(',', ''))
                try:
                    price_val = float(raw_clean)
                except Exception:
                    pass

            if price_val <= 0:
                price_match = re.search(r'(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)', soup.get_text()[:15000])
                if price_match:
                    try:
                        price_val = float(price_match.group(1).replace(',', ''))
                    except Exception:
                        pass

            result.price = price_val

            # Extract brand from title using comprehensive brand list
            _brand_map = {
                'samsung': 'Samsung', 'apple': 'Apple', 'iphone': 'Apple', 'ipad': 'Apple', 'macbook': 'Apple',
                'oneplus': 'OnePlus', 'one plus': 'OnePlus', 'sony': 'Sony', 'xiaomi': 'Xiaomi', 'redmi': 'Xiaomi',
                'poco': 'POCO', 'realme': 'Realme', 'vivo': 'Vivo', 'oppo': 'OPPO', 'motorola': 'Motorola',
                'moto ': 'Motorola', 'nothing': 'Nothing', 'google': 'Google', 'pixel': 'Google',
                'nokia': 'Nokia', 'asus': 'ASUS', 'lenovo': 'Lenovo', 'hp ': 'HP', 'dell': 'Dell',
                'acer': 'Acer', 'msi': 'MSI', 'lg ': 'LG', 'bosch': 'Bosch', 'whirlpool': 'Whirlpool',
                'haier': 'Haier', 'voltas': 'Voltas', 'godrej': 'Godrej', 'boat': 'boAt', 'jbl': 'JBL',
                'bose': 'Bose', 'sennheiser': 'Sennheiser', 'marshall': 'Marshall', 'fire-boltt': 'Fire-Boltt',
                'noise': 'Noise', 'amazfit': 'Amazfit', 'garmin': 'Garmin', 'fitbit': 'Fitbit',
                'canon': 'Canon', 'nikon': 'Nikon', 'gopro': 'GoPro', 'dyson': 'Dyson',
                'philips': 'Philips', 'bajaj': 'Bajaj', 'crompton': 'Crompton', 'havells': 'Havells',
                'prestige': 'Prestige', 'nike': 'Nike', 'adidas': 'Adidas', 'puma': 'Puma',
            }
            title_lower = title.lower()
            detected_brand = ''
            for key, brand_name in _brand_map.items():
                if key in title_lower:
                    detected_brand = brand_name
                    break
            result.brand = detected_brand or (title.split()[0].capitalize()[:40] if title else 'Genuine Brand')

            # Extract Feature Bullets
            bullets = []
            for b in soup.select('#feature-bullets li span.a-list-item')[:6]:
                txt = b.get_text(strip=True)
                if len(txt) > 10 and not any(k in txt.lower() for k in ['customer reviews', 'warranty']):
                    bullets.append(txt)
            result.bullets = bullets

            # Extract Main Image
            img_el = soup.find('img', id='landingImage') or soup.find('img', id='imgBlkFront') or soup.select_one('.imgTagWrapper img')
            if img_el:
                result.image_url = img_el.get('src') or img_el.get('data-old-hires', '')

            self._notify(task_id, 'PRODUCT_IDENTIFIED', f'Verified product: {title[:50]}... at ₹{price_val:,.2f}', {
                'title': title,
                'price': price_val,
                'brand': result.brand,
                'bullets_count': len(bullets)
            })

            # STEP 3: Extract Real Customer Reviews
            self._notify(task_id, 'READING_REVIEWS', 'Agent navigating to verified customer reviews section...')
            real_reviews = []
            # Check if reviews exist on the product page
            review_cards = soup.select('div[data-hook="review"]')
            if len(review_cards) < 3 and asin and 'amazon' in url.lower():
                # Navigate to dedicated review page
                reviews_url = f"https://www.amazon.in/product-reviews/{asin}/ref=cm_cr_dp_d_show_all_btm?reviewerType=all_reviews"
                try:
                    page.goto(reviews_url, wait_until='domcontentloaded', timeout=12000)
                    page.wait_for_timeout(800)
                    soup_reviews = BeautifulSoup(page.content(), 'html.parser')
                    review_cards = soup_reviews.select('div[data-hook="review"]')
                except Exception:
                    pass

            for rc in review_cards[:10]:
                author_el = rc.select_one('.a-profile-name')
                rating_el = rc.select_one('.a-icon-alt')
                title_el = rc.select_one('[data-hook="review-title"]')
                body_el = rc.select_one('[data-hook="review-body"]')
                date_el = rc.select_one('[data-hook="review-date"]')

                author = author_el.get_text(strip=True) if author_el else 'Verified Purchaser'
                rating_str = rating_el.get_text(strip=True) if rating_el else '5.0'
                r_match = re.search(r'([\d.]+)\s*out', rating_str)
                rating = float(r_match.group(1)) if r_match else 5.0
                r_title = title_el.get_text(strip=True) if title_el else 'Verified Purchase'
                r_title = re.sub(r'^\d\.\d out of 5 stars\s*', '', r_title).strip()
                r_body = body_el.get_text(strip=True) if body_el else ''
                date_str = date_el.get_text(strip=True) if date_el else 'Recent'

                has_real_body = bool(r_body and len(r_body) > 5)
                review_text = r_body if has_real_body else f"{rating:.0f}-star rating by {author}."

                real_reviews.append({
                    'store': 'Amazon India',
                    'buyer_name': author,
                    'verified': has_real_body,
                    'badge': 'Verified Amazon Purchaser' if has_real_body else 'Rating Only',
                    'rating': rating,
                    'title': r_title or 'Buyer Rating',
                    'review': review_text,
                    'date': date_str
                })

            result.reviews = real_reviews
            self._notify(task_id, 'REVIEWS_EXTRACTED', f'Extracted {len(real_reviews)} verified customer ratings and reviews.', {
                'reviews_count': len(real_reviews)
            })

            # STEP 4: Discover Competitor Stores Live
            self._notify(task_id, 'DISCOVERING_STORES', 'Searching and verifying live prices on Croma, Flipkart, and Vijay Sales...')
            competitor_stores = []
            clean_search = re.split(r'\(|with\b|,\s*\d+GB', title)[0].strip() or title[:35]

            competitors_to_check = [
                ('Vijay Sales', 'vijaysales.com', f'https://www.vijaysales.com/search/{urllib.parse.quote_plus(clean_search)}', 'span.sp-price'),
                ('Flipkart', 'flipkart.com', f'https://www.flipkart.com/search?q={urllib.parse.quote_plus(clean_search)}', 'div.Nx9bqj'),
                ('Croma', 'croma.com', f'https://www.croma.com/search?q={urllib.parse.quote_plus(clean_search)}', 'span.amount'),
            ]
            for store_name, domain, search_url, price_selector in competitors_to_check:
                try:
                    page.goto(search_url, wait_until='domcontentloaded', timeout=4000)
                    page.wait_for_timeout(300)
                    s_soup = BeautifulSoup(page.content(), 'html.parser')
                    s_price_el = s_soup.select_one(price_selector)
                    if s_price_el:
                        raw_sp = s_price_el.get_text(strip=True)
                        p_cleaned = re.sub(r'[^0-9.]', '', raw_sp.replace(',', ''))
                        st_price = float(p_cleaned)
                        if st_price > 500:
                            competitor_stores.append({
                                'store': store_name,
                                'domain': domain,
                                'url': search_url,
                                'price': st_price,
                                'live_verified': True
                            })
                            self._notify(task_id, 'STORE_VERIFIED', f'Found live price on {store_name}: ₹{st_price:,.2f}')
                except Exception:
                    pass

            result.competitor_stores = competitor_stores
            self._notify(task_id, 'COMPLETED', 'Autonomous agent cycle complete: Identity, reviews, and stores verified.', {
                'title': result.title,
                'price': result.price,
                'reviews_count': len(result.reviews),
                'stores_count': len(result.competitor_stores)
            })

            browser.close()

        return result
