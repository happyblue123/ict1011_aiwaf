import time
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from playwright.sync_api import sync_playwright

class HybridCrawler:
    def __init__(self, origin_url, excluded_endpoints=None, waf_port=8080):
        self.base_url = self.to_waf_url(origin_url, waf_port)
        parsed = urlparse(self.base_url)
        self.scope = parsed.netloc
        
        self.excluded = set(excluded_endpoints) if excluded_endpoints else set()
        self.visited = set()
        self.queue = [] # URLs discovered during manual phase
        self.session = requests.Session()

    def to_waf_url(self, original_url, waf_port=8080):
        parsed = urlparse(original_url)
        netloc = f"{parsed.hostname}:{waf_port}"
        return urlunparse((parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))

    def in_scope(self, url):
        return urlparse(url).netloc == self.scope

    def is_excluded(self, url):
        path = urlparse(url).path.rstrip("/")
        return any(path == ex.rstrip("/") or path.startswith(ex.rstrip("/") + "/") for ex in self.excluded)
    
    def run_manual_phase(self):
        print(f"[*] Launching Firefox at {self.base_url}")
        
        with sync_playwright() as p:
            browser = p.firefox.launch(headless=False) 
            context = browser.new_context()
            page = context.new_page()

            # URL Capture Hook
            def handle_request(request):
                url = request.url
                if self.in_scope(url) and not self.is_excluded(url):
                    if url not in self.visited:
                        self.queue.append(url)
            page.on("request", handle_request)

            # Injected Non-Interfering Instruction Box
            context.add_init_script("""
                window.addEventListener('DOMContentLoaded', () => {
                    const div = document.createElement('div');
                    div.style.cssText = `
                        position: fixed; 
                        top: 10px; 
                        right: 10px; 
                        z-index: 999999; 
                        background: rgba(45, 52, 70, 0.85); 
                        color: white; 
                        padding: 12px; 
                        border-radius: 8px; 
                        border: 1px solid #0984e3; 
                        font-family: sans-serif; 
                        font-size: 13px;
                        width: 220px;
                        pointer-events: none; /* Allows clicking through the box */
                        user-select: none;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
                    `;
                    div.innerHTML = `
                        <b style="color: #74b9ff; display: block; margin-bottom: 5px;">User-directed crawling mode</b>
                        1. Login to the application.<br>
                        2. Click all links.<br>
                        3. Submit all forms.<br>
                        <hr style="border: 0; border-top: 1px solid #555; margin: 8px 0;">
                        <span style="font-size: 11px; opacity: 0.8;">Close this tab when finished.</span>
                    `;
                    document.body.appendChild(div);
                });
            """)

            page.goto(self.base_url)
            print("[*] Waiting for user to close the browser window...")

            try:
                page.wait_for_event("close", timeout=0) 
            except Exception:
                pass

            print("[*] Capturing session cookies...")
            cookies = context.cookies()
            for cookie in cookies:
                self.session.cookies.set(
                    cookie['name'], 
                    cookie['value'], 
                    domain=cookie['domain']
                )
            
            browser.close()

    def extract_urls(self, base_url, html):
        soup = BeautifulSoup(html, "html.parser")
        out = set()
        # (Using your existing robust logic here...)
        for tag, attr in [("a", "href"), ("form", "action")]:
            for el in soup.find_all(tag):
                v = el.get(attr)
                if v and not v.startswith(("javascript:", "#")):
                    out.add(urljoin(base_url, v))
        return out

    def run_automated_phase(self):
        """Finalizes the crawl using the session captured from the browser."""
        print(f"[*] Starting Automated Phase with {len(self.queue)} seeds...")
        
        while self.queue:
            url = self.queue.pop(0)
            if url in self.visited or self.is_excluded(url):
                continue

            try:
                print(f"   Scraping: {url}")
                r = self.session.get(url, timeout=10)
                self.visited.add(url)

                for discovered in self.extract_urls(url, r.text):
                    if self.in_scope(discovered) and not self.is_excluded(discovered):
                        if discovered not in self.visited:
                            self.queue.append(discovered)
                
                time.sleep(0.2)
            except Exception as e:
                print(f"   Error: {e}")

    def start(self):
        try:
            self.run_manual_phase()
            self.run_automated_phase()
            print(f"[*] Done. Total unique pages found: {len(self.visited)}")
            return True
        except Exception as e:
            print(f"[!] Crawler failed: {e}")
            return False


# Usage
# if __name__ == "__main__":
#     crawler = HybridCrawler("http://example.com", excluded_endpoints=["/logout"])
#     crawler.start()