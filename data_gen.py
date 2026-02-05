import requests
import json
import time
import random
import argparse
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, unquote_plus, urlencode
from pathlib import Path
from app.waf.ai_features import extract_features

# ==========================================
# PART 1: The Crawler & Form Analyzer
# ==========================================
class SmartCrawler:
    def __init__(self, base_url):
        self.base_url = base_url
        self.visited = set()
        self.site_map = {}  # Stores { url: { "forms": [] } }
        self.session = requests.Session()
        # Set a browser user-agent
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (NeuroWAF-Training-Bot)"
        })

    def extract_forms(self, url, soup):
        """Finds all forms and their input fields on a page."""
        forms_found = []
        for form in soup.find_all("form"):
            action = form.get("action") or url
            method = (form.get("method") or "GET").upper()
            full_action = urljoin(url, action)
            
            inputs = []
            for inp in form.find_all(["input", "textarea", "select"]):
                name = inp.get("name")
                if name:
                    inputs.append(name)
            
            forms_found.append({
                "action": full_action,
                "method": method,
                "inputs": inputs
            })
        return forms_found

    def crawl(self):
        print(f"[*] Starting Intelligence Crawl on {self.base_url}...")
        queue = [self.base_url]
        
        while queue:
            url = queue.pop(0)
            if url in self.visited: continue
            
            try:
                # 1. Fetch Page
                res = self.session.get(url, timeout=3)
                self.visited.add(url)
                
                # 2. Parse Content
                soup = BeautifulSoup(res.text, "html.parser")
                
                # 3. Learn Forms (The key part!)
                forms = self.extract_forms(url, soup)
                self.site_map[url] = {"forms": forms}
                
                if forms:
                    print(f"    [+] Found {len(forms)} form(s) on {url}: {[f['inputs'] for f in forms]}")

                # 4. Find new links to crawl
                for a in soup.find_all("a", href=True):
                    next_url = urljoin(url, a["href"])
                    # Only stay within scope (localhost)
                    if urlparse(next_url).netloc == urlparse(self.base_url).netloc:
                        if next_url not in self.visited and next_url not in queue:
                            queue.append(next_url)
                            
                time.sleep(0.1) # Be gentle

            except Exception as e:
                print(f"    [-] Failed to crawl {url}: {e}")

        print(f"[*] Map complete. Discovered {len(self.site_map)} pages.")
        return self.site_map

# ==========================================
# PART 2: The Data Generator (Uses the Map)
# ==========================================
class DatasetGenerator:
    def __init__(self, site_map):
        self.site_map = site_map
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
        ]
        self.referrers = [
            "https://www.google.com/",
            "https://www.bing.com/",
            "https://news.ycombinator.com/",
            "https://example.com/"
        ]
        self.accept_languages = ["en-US,en;q=0.9", "en-GB,en;q=0.8", "zh-CN,zh;q=0.9"]

    def _generate_value(self, field_name):
        """Smart value generation based on field names."""
        name = field_name.lower()
        if "user" in name: return f"user_{random.randint(100,999)}"
        if "pass" in name: return "SecureP@ss123"
        if "mail" in name: return f"test{random.randint(1,100)}@example.com"
        if "search" in name or "q" == name: return random.choice(["books", "hacking", "AI", "security"])
        if "id" in name: return str(random.randint(1, 10))
        if "ip" in name: return f"192.168.1.{random.randint(1,255)}"
        if "comment" in name or "desc" in name: 
            words = ["Great", "Book", "Terrible", "Amazing", "WAF", "Testing"]
            return " ".join(random.choices(words, k=5))
        return "dummy_data"

    def _headers(self, include_body=False, anomaly=False):
        headers = {
            "user-agent": random.choice(self.user_agents),
            "accept-language": random.choice(self.accept_languages),
        }
        if random.random() < 0.4:
            headers["referer"] = random.choice(self.referrers)
        if random.random() < 0.2:
            headers["cookie"] = f"session_id={random.randint(100000,999999)}"
        if include_body:
            headers["content-type"] = "application/x-www-form-urlencoded"
        if anomaly and random.random() < 0.5:
            headers["content-type"] = random.choice([
                "text/plain",
                "application/json",
                "application/octet-stream",
            ])
        return headers

    def _random_query(self):
        params = {
            "q": random.choice(["book", "ai", "security", "laptop", "monitor"]),
            "page": random.randint(1, 10),
        }
        if random.random() < 0.3:
            params["sort"] = random.choice(["asc", "desc", "price", "popular"])
        return urlencode(params)

    def _feature_row(self, method, target_url, body, headers):
        parsed = urlparse(target_url)
        raw_path = parsed.path or "/"
        decoded_path = unquote_plus(raw_path)
        normalized_path = raw_path
        raw_query = parsed.query
        return extract_features(
            method=method,
            raw_path=raw_path,
            decoded_path=decoded_path,
            normalized_path=normalized_path,
            raw_query=raw_query,
            headers=headers,
            body_len=len(body),
            body_text=body,
        )

    def generate_baseline(self):
        # Pick a random page we discovered
        url, data = random.choice(list(self.site_map.items()))
        forms = data["forms"]

        # Decision: Browse (GET) or Interact (POST)?
        # If forms exist, 30% chance to submit one.
        if forms and random.random() < 0.3:
            form = random.choice(forms)
            method = form["method"]
            target_url = form["action"]
            
            # Fill the form
            payload_parts = []
            for field in form["inputs"]:
                val = self._generate_value(field)
                payload_parts.append(f"{field}={val}")
            
            body = "&".join(payload_parts)
            headers = self._headers(include_body=True)
        else:
            # Just viewing the page
            method = "GET"
            query = self._random_query() if random.random() < 0.4 else ""
            target_url = f"{url}?{query}" if query else url
            body = ""
            headers = self._headers()

        return self._feature_row(method, target_url, body, headers)

    def generate_anomaly(self):
        url, data = random.choice(list(self.site_map.items()))
        forms = data["forms"]
        attack_payloads = [
            "id=1 OR 1=1",
            "search=<script>alert(1)</script>",
            "path=../../../../etc/passwd",
            "q=%27%20UNION%20SELECT%20*",
            "cmd=cat%20/etc/passwd",
        ]
        method = random.choice(["POST", "PUT", "DELETE", "TRACE"])
        target_url = url

        if forms and random.random() < 0.5:
            form = random.choice(forms)
            target_url = form["action"]
            payload_parts = []
            for field in form["inputs"]:
                if random.random() < 0.6:
                    payload_parts.append(f"{field}={random.choice(attack_payloads)}")
                else:
                    payload_parts.append(f"{field}={self._generate_value(field)}")
            body = "&".join(payload_parts)
            headers = self._headers(include_body=True, anomaly=True)
        else:
            if random.random() < 0.7:
                target_url = f"{url}?{random.choice(attack_payloads)}"
            body = random.choice(attack_payloads)
            headers = self._headers(include_body=True, anomaly=True)

        return self._feature_row(method, target_url, body, headers)

# ==========================================
# PART 3: Execution
# ==========================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate baseline/anomaly datasets for WAF training.")
    parser.add_argument("--base-url", default="http://127.0.0.1:5000", help="Base URL to crawl.")
    parser.add_argument("--limit", type=int, default=20000, help="Total records to generate.")
    parser.add_argument("--anomaly-rate", type=float, default=0.05, help="Fraction of anomalies (0-1).")
    parser.add_argument("--output", default="app/ai_models/data/ai_requests.jsonl", help="Output JSONL path.")
    parser.add_argument("--seed", type=int, default=None, help="Optional random seed.")
    parser.add_argument("--progress", type=int, default=5000, help="Progress print interval.")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    # 1. CRAWL (The Map Phase)
    # Ensure your shop_app.py is running on port 5000!
    crawler = SmartCrawler(args.base_url)
    site_map = crawler.crawl()

    if not site_map:
        print("[-] No pages found! Is the server running?")
        exit(1)

    # 2. GENERATE (The Training Phase)
    generator = DatasetGenerator(site_map)
    output_file = Path(args.output)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    total = args.limit
    print(f"[*] Generating {total} training records (~{args.anomaly_rate:.0%} anomalies)...")
    
    with open(output_file, "w") as f:
        for i in range(total):
            is_anomaly = random.random() < args.anomaly_rate
            feat = generator.generate_anomaly() if is_anomaly else generator.generate_baseline()
            row = {
                "ts": time.time(),
                "label": "anomaly" if is_anomaly else "baseline",
                "features": feat
            }
            f.write(json.dumps(row) + "\n")
            
            if args.progress and i % args.progress == 0 and i > 0:
                print(f"    ... {i} records generated")
                
    print(f"[+] Done! Saved to {output_file}")