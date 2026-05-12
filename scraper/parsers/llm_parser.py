import re, json, logging
import anthropic
from bs4 import BeautifulSoup
from .base import fetch_html, ParseResult

log = logging.getLogger(__name__)
client = anthropic.Anthropic()

SYSTEM = ('You are a web scraping expert. Given HTML of a product page, return ONLY a JSON object '
          'with CSS selectors: {"price_sel":"...","original_sel":"...","name_sel":"...","image_sel":"...","stock_sel":"..."}. '
          'Use the most specific stable selectors. Use null for missing fields.')

def discover_selectors(url: str, needs_js=False) -> dict | None:
    try:
        html = fetch_html(url, use_scraper=needs_js)
    except Exception as e:
        log.error("fetch failed for %s: %s", url, e)
        return None
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup.find("body")
    if not main: return None
    excerpt = str(main)[:15000]
    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"URL: {url}\nHTML:\n{excerpt}"}]
        )
        return json.loads(msg.content[0].text)
    except Exception as e:
        log.error("LLM parse error: %s", e)
        return None

def apply_selectors(html: str, selectors: dict) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    out = {}
    for k, sel in selectors.items():
        if not sel: continue
        el = soup.select_one(sel)
        out[k] = el.get_text(strip=True) if el else None
    return out

def extract_price(raw: str | None) -> float | None:
    if not raw: return None
    m = re.search(r"[\d,]+\.?\d*", raw.replace(",", ""))
    return float(m.group().replace(",", "")) if m else None

def parse(url: str, stored_selectors: dict | None, needs_js=False):
    try:
        html = fetch_html(url, use_scraper=needs_js)
    except Exception as e:
        log.error("fetch failed: %s", e)
        return None

    selectors = stored_selectors
    if not selectors:
        selectors = discover_selectors(url, needs_js)
        if not selectors: return None

    fields = apply_selectors(html, selectors)
    price  = extract_price(fields.get("price_sel"))
    if not price: return None

    return ParseResult(
        price=price,
        original_price=extract_price(fields.get("original_sel")),
        name=fields.get("name_sel"),
        image_url=fields.get("image_sel"),
        in_stock=True,
        strategy="llm",
    ), selectors
