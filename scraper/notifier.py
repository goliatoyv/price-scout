import os, logging
from curl_cffi import requests

log = logging.getLogger(__name__)

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_IDS  = [c.strip() for c in os.environ.get("TELEGRAM_CHAT_IDS", "").split(",") if c.strip()]

def escape_md(s: str) -> str:
    for c in r"\_*[]()~`>#+-=|{}.!":
        s = s.replace(c, f"\\{c}")
    return s

def send(text: str, reply_markup=None):
    if not BOT_TOKEN or not CHAT_IDS:
        log.warning("Telegram not configured")
        return
    for chat_id in CHAT_IDS:
        payload = {"chat_id": chat_id, "text": text,
                   "parse_mode": "MarkdownV2", "disable_web_page_preview": False}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        try:
            requests.post(f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                          json=payload, timeout=10, impersonate="chrome124")
        except Exception as e:
            log.error("Telegram send error: %s", e)

def send_price_drop_alert(product: dict, new_price: float, reason="drop"):
    name   = escape_md(product.get("name") or product["url"][:50])
    target = product.get("target_price")
    size   = product.get("size", "")

    if reason == "target":
        title = "🎯 *Целевая цена достигнута\\!*"
    else:
        title = "📉 *Цена упала\\!*"

    lines = [title, f"*{name}*" + (f" `{escape_md(size)}`" if size else ""),
             f"💵 *${new_price:.2f}*" + (f" \\(цель: ${target:.2f}\\)" if target else "")]
    text = "\n".join(lines)

    markup = {"inline_keyboard": [[{"text": "🛍 Купить сейчас", "url": product["url"]}]]}
    send(text, reply_markup=markup)
