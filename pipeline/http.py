"""Descargas con caché en disco, reintentos y ritmo educado.

Todas las respuestas se guardan en data/raw/cache/<fuente>/<clave>.<ext>.
- modo "cache" (por defecto): usa la caché si existe; si no, descarga.
- modo "refresh": descarga siempre y sobrescribe.
- modo "offline": nunca descarga; falla si no hay caché.
"""
from __future__ import annotations

import hashlib
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "raw" / "cache"
UA = "Mozilla/5.0 (compatible; decreto-ley-data/1.0; datos publicos)"
MODE = os.environ.get("DL_HTTP_MODE", "cache")
DELAY = float(os.environ.get("DL_HTTP_DELAY", "0.35"))
_last = [0.0]


class OfflineMiss(RuntimeError):
    pass


def _key(url: str, data: dict | list | None) -> str:
    raw = url + ("|" + urllib.parse.urlencode(data) if data else "")
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


def fetch(source: str, url: str, data: dict | list | None = None, ext: str = "html",
          name: str | None = None, mode: str | None = None, timeout: int = 120) -> str:
    mode = mode or MODE
    path = CACHE / source / f"{name or _key(url, data)}.{ext}"
    if mode != "refresh" and path.exists():
        return path.read_text(encoding="utf-8")
    if mode == "offline":
        raise OfflineMiss(f"Sin caché para {url}")
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
    err = None
    for attempt in range(4):
        wait = DELAY - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                text = r.read().decode("utf-8", "replace")
            _last[0] = time.monotonic()
            break
        except (urllib.error.URLError, TimeoutError) as e:  # noqa: PERF203
            err = e
            _last[0] = time.monotonic()
            time.sleep(2 ** attempt * 2)
    else:
        raise RuntimeError(f"Fallo descargando {url}: {err}")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)
    return text
