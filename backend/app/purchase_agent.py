import base64
import logging
import traceback
from dataclasses import dataclass
from typing import Optional
from playwright.sync_api import sync_playwright

from .config import settings
from .browser_agent import record_agent_step

logger = logging.getLogger(__name__)

@dataclass
class PurchaseResult:
    success: bool
    step_reached: str
    payment_url: str = ''
    cart_url: str = ''
    message: str = ''
    screenshot_b64: str = ''


class PurchaseAgent:
    def __init__(self, headless: Optional[bool] = None):
        self.headless = headless if headless is not None else settings.playwright_headless

    def _setup_stealth_context(self, browser):
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        context = browser.new_context(
            user_agent=user_agent,
            viewport={'width': 1920, 'height': 1080},
            locale='en-IN',
            timezone_id='Asia/Kolkata'
        )
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.navigator.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        """)
        return context

    def _block_resources(self, route, request):
        if request.resource_type in ["image", "font", "media"]:
            route.abort()
        else:
            route.continue_()

    def execute(self, product_url: str, store_name: str, product_name: str, task_id: str = '') -> PurchaseResult:
        store_lower = store_name.lower()
        if not store_lower:
            if 'amazon' in product_url.lower():
                store_lower = 'amazon'
            elif 'flipkart' in product_url.lower():
                store_lower = 'flipkart'
            else:
                store_lower = 'generic'

        record_agent_step(task_id, 'STARTING', 'Starting purchase agent', {'store': store_lower, 'url': product_url})

        playwright = None
        browser = None
        try:
            playwright = sync_playwright().start()
            browser = playwright.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-infobars',
                    '--disable-dev-shm-usage'
                ]
            )
            context = self._setup_stealth_context(browser)
            page = context.new_page()
            page.route("**/*", self._block_resources)

            if 'amazon' in store_lower:
                result = self._execute_amazon(page, product_url, product_name, task_id)
            elif 'flipkart' in store_lower:
                result = self._execute_flipkart(page, product_url, product_name, task_id)
            else:
                result = self._execute_generic(page, product_url, product_name, task_id)

            try:
                screenshot_bytes = page.screenshot(type='jpeg', quality=60)
                result.screenshot_b64 = base64.b64encode(screenshot_bytes).decode('utf-8')
            except Exception:
                pass

            return result

        except Exception as e:
            logger.error(f"Purchase agent error: {e}\n{traceback.format_exc()}")
            return PurchaseResult(
                success=False,
                step_reached='FAILED',
                message=str(e)
            )
        finally:
            if browser:
                try:
                    browser.close()
                except:
                    pass
            if playwright:
                try:
                    playwright.stop()
                except:
                    pass

    def _execute_amazon(self, page, product_url, product_name, task_id) -> PurchaseResult:
        try:
            record_agent_step(task_id, 'NAVIGATING', 'Navigating to Amazon product page')
            page.goto(product_url, timeout=12000)
            
            record_agent_step(task_id, 'PRODUCT_FOUND', 'Page loaded, looking for add to cart')
            
            # Click add to cart or buy now
            try:
                page.wait_for_selector('#add-to-cart-button, #buy-now-button', timeout=5000)
                btn = page.locator('#add-to-cart-button, #buy-now-button').first
                btn.click(timeout=3000)
                record_agent_step(task_id, 'ADDING_TO_CART', 'Clicked add to cart/buy now')
            except Exception as e:
                return PurchaseResult(False, 'FAILED', message=f"Add to cart button not found: {e}")

            # Wait for cart confirmation or redirect
            try:
                page.wait_for_timeout(3000)
                record_agent_step(task_id, 'CART_CONFIRMED', 'Checking cart')
            except:
                pass

            # Go to cart
            try:
                page.goto('https://www.amazon.in/gp/cart/view.html', timeout=12000)
                record_agent_step(task_id, 'CHECKOUT_PAGE', 'Navigated to cart view')
            except Exception as e:
                pass

            # Proceed to checkout
            try:
                page.wait_for_selector('#sc-buy-box-ptc-button, input[name="proceedToRetailCheckout"]', timeout=5000)
                ptc_btn = page.locator('#sc-buy-box-ptc-button, input[name="proceedToRetailCheckout"]').first
                ptc_btn.click(timeout=3000)
                record_agent_step(task_id, 'CHECKOUT_PAGE', 'Clicked proceed to checkout')
            except Exception as e:
                pass

            # Wait for checkout to load
            try:
                page.wait_for_load_state('networkidle', timeout=5000)
            except:
                pass

            record_agent_step(task_id, 'PAYMENT_READY', 'Ready for manual payment')
            return PurchaseResult(True, 'PAYMENT_READY', payment_url=page.url)

        except Exception as e:
            return PurchaseResult(False, 'FAILED', message=str(e))

    def _execute_flipkart(self, page, product_url, product_name, task_id) -> PurchaseResult:
        try:
            record_agent_step(task_id, 'NAVIGATING', 'Navigating to Flipkart product page')
            page.goto(product_url, timeout=12000)
            
            record_agent_step(task_id, 'PRODUCT_FOUND', 'Page loaded, looking for buy now')
            
            try:
                page.wait_for_selector('button._7UHT_c, button:has-text("Buy Now"), button:has-text("ADD TO CART")', timeout=5000)
                btn = page.locator('button._7UHT_c, button:has-text("Buy Now"), button:has-text("ADD TO CART")').first
                btn.click(timeout=3000)
                record_agent_step(task_id, 'ADDING_TO_CART', 'Clicked buy/add to cart')
            except Exception as e:
                return PurchaseResult(False, 'FAILED', message=f"Buy button not found: {e}")

            try:
                page.wait_for_timeout(3000)
                record_agent_step(task_id, 'CHECKOUT_PAGE', 'Checking checkout page')
            except:
                pass

            try:
                page.wait_for_selector('button:has-text("PLACE ORDER"), button:has-text("CONTINUE")', timeout=5000)
                record_agent_step(task_id, 'PAYMENT_READY', 'Ready for manual payment')
            except:
                pass

            return PurchaseResult(True, 'PAYMENT_READY', payment_url=page.url)

        except Exception as e:
            return PurchaseResult(False, 'FAILED', message=str(e))

    def _execute_generic(self, page, product_url, product_name, task_id) -> PurchaseResult:
        try:
            record_agent_step(task_id, 'NAVIGATING', 'Navigating to generic product page')
            page.goto(product_url, timeout=12000)
            
            record_agent_step(task_id, 'PRODUCT_FOUND', 'Page loaded, looking for generic add to cart')
            
            selectors = ['button:has-text("Add to Cart")', 'button:has-text("Buy Now")', '#add-to-cart', '.add-to-cart-btn', 'button:has-text("Add to Bag")']
            selector_str = ', '.join(selectors)
            
            try:
                page.wait_for_selector(selector_str, timeout=5000)
                btn = page.locator(selector_str).first
                btn.click(timeout=3000)
                record_agent_step(task_id, 'ADDING_TO_CART', 'Clicked generic add to cart')
                
                try:
                    page.wait_for_timeout(3000)
                except:
                    pass
                return PurchaseResult(True, 'CART_CONFIRMED', cart_url=page.url)
            except Exception as e:
                return PurchaseResult(False, 'FAILED', message=f"Could not find or click generic add to cart: {e}", cart_url=product_url)

        except Exception as e:
            return PurchaseResult(False, 'FAILED', message=str(e))
