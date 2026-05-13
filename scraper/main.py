#!/usr/bin/env python3
import sys, logging
from urllib.parse import urlparse
sys.path.insert(0, __file__.rsplit("/", 1)[0])

import db
from parsers import jnbo, llm_parser
from notifier import send_price_drop_alert

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

DOMAIN_PARSERS = {
    "joesnewbalanceoutlet.com": jnbo.parse,
}

def get_domain(url: str) -> str:
    return urlparse(url).hostname.replace("www.", "")

def process(product: dict):
    url    = product["url"]
    domain = get_domain(url)
    name   = product.get("name") or url[:60]
    log.info("Checking: %s", name)

    result = None

    pipeline_meta: tuple[str, bool] | None = None  # (strategy, needs_js) for cache write

    if domain in DOMAIN_PARSERS:
        result = DOMAIN_PARSERS[domain](url)
    else:
        site_parser = db.get_site_parser(domain)
        selectors   = site_parser["selectors"] if site_parser else None
        needs_js    = site_parser.get("needs_js", False) if site_parser else False
        out = llm_parser.parse(
            url, selectors, needs_js,
            color=product.get("color"),
            size=product.get("size"),
        )
        if out is not None:
            result, used_strategy, used_js = out
            pipeline_meta = (used_strategy, used_js)

    if result is None:
        streak = db.increment_fail_streak(domain)
        log.warning("Parse failed for %s (streak=%s)", name, streak)
        return

    db.insert_price_check(product["id"], result.price, result.original_price,
                          result.currency, result.in_stock, result.strategy)

    # Persist strategy cache AFTER the price is saved so a cache write
    # failure does not block price updates.
    if pipeline_meta is not None:
        strategy, used_js = pipeline_meta
        try:
            db.upsert_site_parser(domain, {"strategy": strategy}, needs_js=used_js)
        except Exception as e:
            log.warning("site_parsers upsert failed for %s: %s", domain, e)

    updates = {}
    if not product.get("name") and result.name:       updates["name"]      = result.name
    if not product.get("image_url") and result.image_url: updates["image_url"] = result.image_url
    if updates:
        db.update_product(product["id"], **updates)

    target = product.get("target_price")
    if target and result.price <= float(target):
        db.update_product(product["id"], status="alert")
        send_price_drop_alert(product, result.price, "target")
        log.info("🎯 Target reached! $%.2f <= $%.2f", result.price, target)
    else:
        log.info("✓ $%.2f", result.price)

def main():
    products = db.get_products()
    log.info("Monitoring %d products", len(products))
    for p in products:
        try:
            process(p)
        except Exception as e:
            log.error("Error processing %s: %s", p.get("name"), e)

if __name__ == "__main__":
    main()
