import os, httpx

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def get_products():
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/products",
                  params={"status": "neq.skipped", "select": "*"},
                  headers=HEADERS, timeout=10)
    r.raise_for_status()
    return r.json()

def insert_price_check(product_id, price, original, currency, in_stock, strategy):
    httpx.post(f"{SUPABASE_URL}/rest/v1/price_checks",
               json={"product_id": product_id, "price": price,
                     "original_price": original, "currency": currency,
                     "in_stock": in_stock, "parser_strategy": strategy},
               headers=HEADERS, timeout=10).raise_for_status()

def update_product(product_id, **fields):
    httpx.patch(f"{SUPABASE_URL}/rest/v1/products?id=eq.{product_id}",
                json=fields, headers=HEADERS, timeout=10).raise_for_status()

def get_site_parser(domain):
    r = httpx.get(f"{SUPABASE_URL}/rest/v1/site_parsers",
                  params={"domain": f"eq.{domain}", "select": "*", "limit": "1"},
                  headers=HEADERS, timeout=10)
    rows = r.json()
    return rows[0] if rows else None

def upsert_site_parser(domain, selectors, needs_js=False):
    httpx.post(f"{SUPABASE_URL}/rest/v1/site_parsers",
               json={"domain": domain, "selectors": selectors, "needs_js": needs_js,
                     "fail_streak": 0, "success_rate": 1.0},
               headers={**HEADERS, "Prefer": "resolution=merge-duplicates"},
               timeout=10).raise_for_status()

def increment_fail_streak(domain):
    parser = get_site_parser(domain)
    if not parser: return 1
    new_streak = parser.get("fail_streak", 0) + 1
    httpx.patch(f"{SUPABASE_URL}/rest/v1/site_parsers?domain=eq.{domain}",
                json={"fail_streak": new_streak}, headers=HEADERS, timeout=10)
    return new_streak
