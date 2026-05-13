"""
Adaptive product page extractor — mirrors lib/scraper/pipeline.ts.

Mode escalation ladder (stops at first success):
  1. direct   — plain HTTP (free).
  2. render   — ScraperAPI with JS rendering (~5 credits).
  3. premium  — ScraperAPI with premium proxies (~10 credits) — pierces
                Akamai/Imperva (adidas, Nike SNKRS).
  4. LLM     — Claude Haiku reads the best HTML we have and returns JSON.

site_parsers.selectors stores {"strategy": "json_ld"|"og_meta"|"llm"}, matched
with the Next.js endpoint so both writers share one cache.
"""

import json
import logging
import os
import re
from typing import Any

import anthropic
from bs4 import BeautifulSoup

from .base import fetch_html, ParseResult

log = logging.getLogger(__name__)

LLM_MODEL    = "claude-haiku-4-5-20251001"
LLM_MAX_HTML = 12_000

# Domains known to ship empty SPA shells — JSON-LD/OG never present in the
# initial HTML, so we MUST render via ScraperAPI to extract anything. Match
# is by suffix on the registrable hostname, so adidas.de etc. also match.
HARD_SITES = ("adidas.com", "adidas.de", "adidas.co.uk", "zalando.de", "zalando.com")


def _is_hard_site(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        host = (urlparse(url).hostname or "").lower().lstrip(".")
        host = host.removeprefix("www.")
        return any(host == d or host.endswith("." + d) for d in HARD_SITES)
    except Exception:
        return False


_client: anthropic.Anthropic | None = None


def _llm_client() -> anthropic.Anthropic | None:
    global _client
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    if _client is None:
        _client = anthropic.Anthropic(timeout=30.0)
    return _client


def _can_render() -> bool:
    return bool(os.environ.get("SCRAPER_API_KEY"))


# ─── Fetch (three modes) ─────────────────────────────────────────────────────

def _safe_fetch(url: str, *, mode: str) -> str | None:
    """mode: 'direct' | 'render' | 'premium'. Returns None on any failure."""
    try:
        kwargs = {}
        if mode == "render":
            kwargs["render"] = True
        elif mode == "premium":
            kwargs["premium"] = True
        html = fetch_html(url, **kwargs)
    except Exception as e:
        log.warning("fetch %s failed for %s: %s", mode, url, e)
        return None
    return html if html and len(html) >= 500 else None


# ─── JSON-LD ─────────────────────────────────────────────────────────────────

def _to_number(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v == v else None
    s = re.sub(r"[^\d.,-]", "", str(v)).replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _pick_image(img: Any) -> str | None:
    if isinstance(img, str):
        return img
    if isinstance(img, list):
        for x in img:
            if isinstance(x, str):
                return x
            if isinstance(x, dict) and isinstance(x.get("url"), str):
                return x["url"]
    if isinstance(img, dict) and isinstance(img.get("url"), str):
        return img["url"]
    return None


def _availability(v: Any) -> bool | None:
    if v is None:
        return None
    s = str(v).lower()
    if "instock" in s or "in_stock" in s:
        return True
    if "outofstock" in s or "soldout" in s:
        return False
    return None


def _types_of(node: dict) -> list[str]:
    t = node.get("@type")
    if not t:
        return []
    return [str(x) for x in t] if isinstance(t, list) else [str(t)]


def _from_product_node(node: dict) -> dict | None:
    offers = node.get("offers")
    if isinstance(offers, list):
        offers = offers[0] if offers else None
    if not isinstance(offers, dict):
        return None

    price = _to_number(offers.get("price") or offers.get("lowPrice"))
    if price is None:
        return None

    original = _to_number(
        node.get("highPrice")
        or offers.get("highPrice")
        or node.get("listPrice")
        or offers.get("listPrice")
        or (offers.get("priceSpecification") or {}).get("price")
    )

    return {
        "price": price,
        "original_price": original if original is not None and original > price else None,
        "currency": offers.get("priceCurrency") if isinstance(offers.get("priceCurrency"), str) else None,
        "in_stock": _availability(offers.get("availability")),
        "name": node.get("name") if isinstance(node.get("name"), str) else None,
        "image_url": _pick_image(node.get("image")),
    }


def _walk_jsonld(node: Any) -> dict | None:
    if node is None or not isinstance(node, (dict, list)):
        return None
    if isinstance(node, list):
        for item in node:
            r = _walk_jsonld(item)
            if r:
                return r
        return None

    types = _types_of(node)
    if "Product" in types:
        r = _from_product_node(node)
        if r:
            return r
    if "ProductGroup" in types and isinstance(node.get("hasVariant"), list):
        for v in node["hasVariant"]:
            if not isinstance(v, dict):
                continue
            merged = dict(v)
            merged["name"]  = node.get("name") or v.get("name")
            merged["image"] = node.get("image") or v.get("image")
            r = _from_product_node(merged)
            if r:
                return r
    if "@graph" in node:
        r = _walk_jsonld(node["@graph"])
        if r:
            return r
    return None


def extract_json_ld(soup: BeautifulSoup) -> dict | None:
    for el in soup.find_all("script", type="application/ld+json"):
        raw = (el.string or "").strip()
        if not raw:
            continue
        try:
            r = _walk_jsonld(json.loads(raw))
            if r:
                return r
        except json.JSONDecodeError:
            m = re.search(r"\{[\s\S]*\}", raw)
            if m:
                try:
                    r = _walk_jsonld(json.loads(m.group(0)))
                    if r:
                        return r
                except json.JSONDecodeError:
                    pass
    return None


# ─── Open Graph / meta ───────────────────────────────────────────────────────

def _meta(soup: BeautifulSoup, key: str) -> str | None:
    for attr in ("property", "name", "itemprop"):
        el = soup.find("meta", attrs={attr: key})
        if el and el.get("content"):
            return el["content"]
    return None


def extract_og_meta(soup: BeautifulSoup) -> dict | None:
    price_raw = _meta(soup, "product:price:amount") or _meta(soup, "og:price:amount") or _meta(soup, "price")
    price = _to_number(price_raw)
    if price is None:
        return None

    availability = _meta(soup, "product:availability") or _meta(soup, "og:availability") or _meta(soup, "availability")
    in_stock: bool | None = None
    if availability:
        a = availability.lower()
        if re.search(r"instock|in stock|available", a):
            in_stock = True
        elif re.search(r"outofstock|out of stock|sold", a):
            in_stock = False

    return {
        "price": price,
        "original_price": None,
        "currency": _meta(soup, "product:price:currency") or _meta(soup, "og:price:currency"),
        "in_stock": in_stock,
        "name": _meta(soup, "og:title"),
        "image_url": _meta(soup, "og:image") or _meta(soup, "og:image:url"),
    }


# ─── LLM JSON extraction ─────────────────────────────────────────────────────

def _strip_for_llm(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "link"]):
        tag.decompose()
    head = soup.head.encode_contents().decode() if soup.head else ""
    body = soup.body.encode_contents().decode() if soup.body else ""
    combined = f"<head>{head}</head><body>{body}</body>"
    return re.sub(r"\s+", " ", combined)[:LLM_MAX_HTML]


def extract_with_llm(html: str, url: str) -> dict | None:
    client = _llm_client()
    if client is None:
        return None
    cleaned = _strip_for_llm(html)
    prompt = (
        f"Extract product details from this HTML (URL: {url}).\n"
        'Return ONLY one JSON object, no markdown, no commentary:\n'
        '{"price":99.99,"original_price":129.99,"currency":"USD","in_stock":true,"name":"Product Name","image_url":"https://..."}\n'
        "- price: current/sale price as number (required, otherwise return {\"price\": null})\n"
        "- original_price: crossed-out / list price, else null\n"
        "- currency: 3-letter ISO, else null\n"
        "- in_stock: true if purchasable, false if sold out, null if unknown\n"
        "- name: product title or null\n"
        "- image_url: main absolute image URL or null\n\n"
        f"HTML:\n{cleaned}"
    )
    try:
        msg = client.messages.create(
            model=LLM_MODEL, max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if hasattr(b, "text"))
    except Exception as e:
        log.error("LLM extract failed: %s", e)
        return None

    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        parsed = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed.get("price"), (int, float)):
        return None
    return {
        "price": float(parsed["price"]),
        "original_price": float(parsed["original_price"]) if isinstance(parsed.get("original_price"), (int, float)) else None,
        "currency": parsed["currency"] if isinstance(parsed.get("currency"), str) else None,
        "in_stock": parsed["in_stock"] if isinstance(parsed.get("in_stock"), bool) else None,
        "name": parsed["name"] if isinstance(parsed.get("name"), str) else None,
        "image_url": parsed["image_url"] if isinstance(parsed.get("image_url"), str) else None,
    }


# ─── Public API ──────────────────────────────────────────────────────────────

PipelineOutput = tuple[ParseResult, str, bool]  # result, strategy, needs_js


def _to_result(data: dict, strategy: str) -> ParseResult:
    return ParseResult(
        price=data["price"],
        original_price=data.get("original_price"),
        name=data.get("name"),
        image_url=data.get("image_url"),
        in_stock=data.get("in_stock") if data.get("in_stock") is not None else True,
        currency=data.get("currency") or "USD",
        strategy=strategy,
    )


def _try_structured(html: str) -> tuple[dict | None, str | None]:
    soup = BeautifulSoup(html, "html.parser")
    jl = extract_json_ld(soup)
    og = extract_og_meta(soup)
    if jl:
        return {**(og or {}), **jl}, "json_ld"
    if og:
        return og, "og_meta"
    return None, None


def parse(url: str, stored_selectors: dict | None, needs_js: bool = False) -> PipelineOutput | None:
    """Returns (ParseResult, strategy, needs_js) or None on failure."""
    cached_strategy: str | None = None
    if isinstance(stored_selectors, dict):
        s = stored_selectors.get("strategy")
        if s in ("json_ld", "og_meta", "llm"):
            cached_strategy = s

    hard = _is_hard_site(url)

    # Choose starting mode.
    start_mode = "direct"
    if _can_render() and (needs_js or hard):
        start_mode = "render"

    html = _safe_fetch(url, mode=start_mode)
    if html is None and start_mode != "direct":
        html = _safe_fetch(url, mode="direct")
    if html is None:
        return None

    used_js = start_mode != "direct"
    data: dict | None = None
    strategy: str | None = None

    def try_extract(current_html: str) -> bool:
        nonlocal data, strategy
        d, s = _try_structured(current_html)
        if d:
            data, strategy = d, s
            return True
        if cached_strategy == "llm":
            llm = extract_with_llm(current_html, url)
            if llm:
                data, strategy = llm, "llm"
                return True
        return False

    if try_extract(html):
        pass
    elif _can_render() and not used_js:
        rendered = _safe_fetch(url, mode="render")
        if rendered:
            html = rendered
            used_js = True
            if not try_extract(html):
                premium = _safe_fetch(url, mode="premium")
                if premium:
                    html = premium
                    try_extract(html)
    elif _can_render() and used_js:
        premium = _safe_fetch(url, mode="premium")
        if premium:
            html = premium
            try_extract(html)

    if data is None and cached_strategy != "llm":
        llm = extract_with_llm(html, url)
        if llm:
            data, strategy = llm, "llm"

    if data is None or strategy is None or data.get("price") is None:
        return None

    return _to_result(data, strategy), strategy, used_js
