import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
import time
import re

class AuthenticatedCrawler:
    def __init__(self, origin_url, auth_info=None):
        self.url = self.to_waf_url(origin_url, 8080) # 8080 is waf port
        parsed = urlparse(self.url.strip())
        self.scope = parsed.netloc
        self.auth = auth_info
        
        # create a session
        self.session = requests.Session()
        self.visited = set()
        self.queue = [] 
    
    def to_waf_url(self, original_url: str, waf_port: int = 8080) -> str:
        parsed = urlparse(original_url)

        # Replace only the port
        netloc = parsed.hostname
        if parsed.username and parsed.password:
            netloc = f"{parsed.username}:{parsed.password}@{netloc}"

        netloc = f"{netloc}:{waf_port}"
        return urlunparse((
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        ))

    def in_scope(self, url):
        return urlparse(url).netloc == self.scope

    def login(self):
        if not self.auth:
            print("[*] No authentication configured. Skipping login.")
            return True

        login_ep = self.auth.get("login_endpoint") or ""
        login_url = urljoin(self.url.rstrip("/") + "/", login_ep.lstrip("/"))

        # ✅ dynamic payload dict
        payload = dict(self.auth.get("login_payload") or {})

        headers = {
            "Referer": login_url,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }

        # ✅ token handling is OPTIONAL (not hardcoded in payload)
        token_required = bool(self.auth.get("token_required", False))
        token_name = self.auth.get("token_name")

        if token_required and token_name:
            try:
                r0 = self.session.get(login_url, headers=headers, allow_redirects=True, timeout=10)
                r0.raise_for_status()

                soup = BeautifulSoup(r0.text, "html.parser")
                token_el = soup.find("input", {"name": token_name})
                if not token_el or not token_el.get("value"):
                    print(f"[-] Token field '{token_name}' not found on login page")
                    return False

                payload[token_name] = token_el["value"]
            except Exception as e:
                print(f"[-] Token fetch failed: {e}")
                return False

        try:
            r = self.session.post(
                login_url,
                data=payload,
                headers=headers,
                allow_redirects=False,
                timeout=10
            )

            location = r.headers.get("Location")
            # 1️⃣ Redirect-based success
            if r.status_code in (301, 302, 303, 307, 308) and location:
                next_url = urljoin(login_url, location)
                # treat redirect away from login endpoint as success
                if login_ep.lower().strip("/") not in next_url.lower():
                    return True

            # 2️⃣ Explicit failure codes
            if r.status_code in (401, 403):
                print("[-] Credentials wrong or access denied")
                return False

            # 3️⃣ Heuristic: if we still see login form, likely failed
            body = (r.text or "").lower()
            if "password" in body and "login" in body:
                print("[-] Login likely failed (still on login page)")
                return False

            # Fallback: not sure, but treat as success if not obviously failed
            return True

        except Exception as e:
            print(f"[-] Login Exception: {e}")
            return False


    def extract_urls(self, base_url: str, html: str) -> set[str]:
        soup = BeautifulSoup(html, "html.parser")
        out = set()

        # tag -> attribute that commonly contains URLs
        url_attrs = [
            ("a", "href"),
            ("link", "href"),
            ("script", "src"),
            ("img", "src"),
            ("iframe", "src"),
            ("frame", "src"),
            ("source", "src"),
            ("video", "src"),
            ("audio", "src"),
            ("embed", "src"),
            ("object", "data"),
            ("form", "action"),
            ("button", "formaction"),
            ("input", "formaction"),
        ]

        # 1) Normal URL-bearing attributes
        for tag, attr in url_attrs:
            for el in soup.find_all(tag):
                v = el.get(attr)
                if not v:
                    continue
                v = v.strip()

                # ignore non-navigation schemes / fragments
                if v.startswith(("javascript:", "#", "mailto:", "tel:")):
                    continue

                out.add(urljoin(base_url, v))

        # 2) Meta refresh: <meta http-equiv="refresh" content="0;url=/path">
        for m in soup.find_all("meta"):
            if (m.get("http-equiv") or "").lower() == "refresh":
                content = m.get("content") or ""
                m2 = re.search(r"url\s*=\s*([^;]+)", content, flags=re.IGNORECASE)
                if m2:
                    v = m2.group(1).strip().strip("'\"")
                    if v and not v.startswith(("javascript:", "#")):
                        out.add(urljoin(base_url, v))

        # 3) Common data-* URL attributes (best-effort)
        for el in soup.find_all(True):
            for k, v in el.attrs.items():
                if not isinstance(v, str):
                    continue
                k = k.lower()
                if k in ("data-url", "data-href", "data-src", "data-action"):
                    vv = v.strip()
                    if vv and not vv.startswith(("javascript:", "#")):
                        out.add(urljoin(base_url, vv))

        return out

    def crawl(self) -> bool:
        """The Main Loop. Returns True if started successfully, False if login failed."""
        ok = self.login()
        if not ok:
            return False

        start_node = self.url
        self.queue.append(start_node)

        print("[*] Starting Authenticated Crawl...")

        while self.queue:
            url = self.queue.pop(0)
            if url in self.visited:
                continue
            try:
                print(f"   Crawling: {url}")
                r = self.session.get(url)
                self.visited.add(url)

                discovered = self.extract_urls(url, r.text)
                for full_url in discovered:
                    if self.in_scope(full_url) and full_url not in self.visited:
                        self.queue.append(full_url)

                time.sleep(0.2)
            except Exception as e:
                print(f"   Error crawling {url}: {e}")

        return True
