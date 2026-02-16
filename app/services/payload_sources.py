import requests
import os

# --- SETTINGS ---
PAYLOAD_DIR = "app/ai_models/data/payloads/"
os.makedirs(PAYLOAD_DIR, exist_ok=True)

# These are the CURRENT verified RAW links (master branch)
SOURCES = {
    # Directory Traversal (The one you found)
    "traversal.txt": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/Directory%20Traversal/Intruder/deep_traversal.txt",
    
    # SQL Injection
    "sqli.txt": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/SQL%20Injection/Intruder/SQL-Injection",
    
    # XSS (Cross-Site Scripting)
    "xss.txt": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/XSS%20Injection/Intruders/XSSDetection.txt",
    
    # NoSQL Injection
    "nosql.txt": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/NoSQL%20Injection/Intruder/NoSQL.txt",
    
    # Server-Side Template Injection (SSTI)
    "ssti.txt": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/Server%20Side%20Template%20Injection/Intruder/ssti.fuzz",

    "cmdi.txt": "https://raw.githubusercontent.com/swisskyrepo/PayloadsAllTheThings/master/Command%20Injection/Intruder/command_exec.txt"
}

def sync_payloads():
    # Adding a browser-like User-Agent helps prevent GitHub from blocking the script
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Training-Collector/1.1'}
    
    print(f"[*] Starting payload sync to: {os.path.abspath(PAYLOAD_DIR)}")
    
    for filename, url in SOURCES.items():
        try:
            print(f"    -> Downloading {filename}...")
            response = requests.get(url, headers=headers, timeout=20)
            
            if response.status_code == 200:
                # Clean the payloads: remove leading/trailing whitespace and junk
                lines = [line.strip() for line in response.text.splitlines() if line.strip()]
                
                with open(os.path.join(PAYLOAD_DIR, filename), "w", encoding="utf-8") as f:
                    f.write("\n".join(lines))
                
                print(f"       ✅ Success: {len(lines)} payloads saved.")
            else:
                print(f"       ❌ Failed (Status Code: {response.status_code})")
                
        except Exception as e:
            print(f"       ⚠️ Connection Error for {filename}: {e}")

if __name__ == "__main__":
    sync_payloads()