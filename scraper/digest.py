#!/usr/bin/env python3
import sys, logging
from datetime import datetime, timezone, timedelta
sys.path.insert(0, __file__.rsplit("/", 1)[0])

import httpx, os
from notifier import send, escape_md

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

def main():
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    products_r = httpx.get(f"{SUPABASE_URL}/rest/v1/products",
                           params={"status": "neq.skipped", "select": "*"},
                           headers=HEADERS, timeout=10)
    products = {p["id"]: p for p in products_r.json()}

    checks_r = httpx.get(f"{SUPABASE_URL}/rest/v1/price_checks",
                          params={"checked_at": f"gte.{since}", "select": "product_id,price,checked_at"},
                          headers=HEADERS, timeout=10)
    checks = checks_r.json()

    drops = []
    for chk in checks:
        p = products.get(chk["product_id"])
        if not p: continue
        target = p.get("target_price")
        if target and chk["price"] <= float(target):
            drops.append((p, chk["price"]))

    if not drops:
        send("📊 *Дайджест за 24ч*\n\nИзменений нет\\.")
        return

    lines = ["📊 *Дайджест за 24ч*", ""]
    for p, price in drops[:10]:
        name   = escape_md(p.get("name") or p["url"][:40])
        target = p.get("target_price")
        lines.append(f"• {name} — 💵 ${price:.2f}" + (f" \\(цель ${target:.2f}\\)" if target else ""))
    send("\n".join(lines))

if __name__ == "__main__":
    main()
