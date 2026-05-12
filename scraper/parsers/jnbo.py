import re, json
from bs4 import BeautifulSoup
from .base import fetch_html, ParseResult

DOMAIN = "joesnewbalanceoutlet.com"

def parse(url: str) -> ParseResult | None:
    html = fetch_html(url, use_scraper=True)
    soup = BeautifulSoup(html, "html.parser")

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            items = data if isinstance(data, list) else [data]
            for item in items:
                if item.get("@type") == "Product":
                    offers = item.get("offers", {})
                    if isinstance(offers, list): offers = offers[0]
                    price = float(offers.get("price") or 0)
                    name  = item.get("name")
                    imgs  = item.get("image", [])
                    img   = imgs[0] if isinstance(imgs, list) and imgs else (imgs if isinstance(imgs, str) else None)
                    if price:
                        return ParseResult(price, None, name, img, True, "USD", "json-ld")
        except Exception:
            pass

    m = re.search(r'"price"\s*:\s*"([\d]+\.[\d]{2})"', html)
    if m:
        return ParseResult(float(m.group(1)), None, None, None, True, "USD", "regex")
    return None
