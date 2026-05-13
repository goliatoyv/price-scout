import os
from curl_cffi import requests as cffi_requests

SCRAPER_KEY = os.environ.get("SCRAPER_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-US,en;q=0.5",
}

def fetch_html(url: str, use_scraper=False, render=False) -> str:
    if (use_scraper or render) and SCRAPER_KEY:
        params = {"api_key": SCRAPER_KEY, "url": url}
        if render:
            params["render"] = "true"
        r = cffi_requests.get("http://api.scraperapi.com",
                              params=params, timeout=60, impersonate="chrome124")
    else:
        r = cffi_requests.get(url, headers=HEADERS, timeout=30, impersonate="chrome124")
    r.raise_for_status()
    return r.text

class ParseResult:
    def __init__(self, price, original_price=None, name=None, image_url=None,
                 in_stock=True, currency="USD", strategy="unknown"):
        self.price = price
        self.original_price = original_price
        self.name = name
        self.image_url = image_url
        self.in_stock = in_stock
        self.currency = currency
        self.strategy = strategy
