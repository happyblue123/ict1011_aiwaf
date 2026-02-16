import requests
import random
import time
import string

# --- CONFIGURATION ---
TARGET_HOST = "http://127.0.0.1:8080"
ENDPOINT = "/"

# DIVERSE ATTACK LIBRARY
ATTACK_LIBRARY = {
    "sqli": ["' OR '1'='1", "admin'--", "UNION SELECT NULL--"],
    "xss": ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"],
    "traversal": ["../../../../etc/passwd", "..\\..\\..\\windows\\win.ini"],
    "cmd_injection": ["; cat /etc/passwd", "| dir C:\\", "& whoami"],
    "nosql": ['{"$gt": ""}', '{"$ne": null}'],
    "ssti": ["{{7*7}}", "${7*7}"]
}

def generate_public_ips(count=10):
    ips = []
    while len(ips) < count:
        first = random.randint(1, 223)
        if first in [10, 127, 169, 172, 192]: continue 
        ips.append(f"{first}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}")
    return ips

def get_anomaly_payload():
    choice = random.choice(["long", "fuzz"])
    return "A" * 2000 if choice == "long" else "".join(random.choices(string.printable, k=500))

def run_diverse_ip_test():
    public_ips = generate_public_ips(10)
    print(f"[*] Starting Stress Test (Diversity + Anomaly + Rate Limiting)")
    
    # --- PART 1: Diversity & Anomaly Test ---
    for ip in public_ips:
        print(f"\n[IP: {ip}] Running 10 Malicious, 5 Benign, 5 Anomaly...")
        tasks = [("BLOCK", "malicious")] * 10 + [("ALLOW", "benign")] * 5 + [("BLOCK", "anomaly")] * 5
        random.shuffle(tasks)
        
        hits = 0
        for expected, req_type in tasks:
            headers = {"X-Forwarded-For": ip, "X-Real-IP": ip}
            payload = ""
            
            if req_type == "malicious":
                payload = random.choice(ATTACK_LIBRARY[random.choice(list(ATTACK_LIBRARY.keys()))])
            elif req_type == "benign":
                payload = "normal_user_search"
            else:
                payload = get_anomaly_payload()

            try:
                resp = requests.get(f"{TARGET_HOST}{ENDPOINT}", params={"input": payload}, headers=headers, timeout=5)
                # Success if status is 403 (Forbidden) for blocks or 200 for allows
                actual = "BLOCK" if (resp.status_code == 403 or "BLOCK" in resp.text.upper()) else "ALLOW"
                if actual == expected: hits += 1
            except: pass
        
        print(f" -> Result: {hits}/20 Passed")

    # --- PART 2: Rate Limiting Test ---
    rate_limit_ip = "77.77.77.77"
    print(f"\n[*] Testing Rate Limiting on IP: {rate_limit_ip}")
    print(f"[*] Sending 50 rapid requests (no delay)...")
    
    blocked_by_rate_limit = 0
    for i in range(50):
        try:
            resp = requests.get(f"{TARGET_HOST}{ENDPOINT}", 
                                params={"q": "spam"}, 
                                headers={"X-Forwarded-For": rate_limit_ip}, 
                                timeout=2)
            
            # Check for 429 Too Many Requests or 403 Forbidden
            if resp.status_code in [429, 403]:
                blocked_by_rate_limit += 1
        except: pass
    
    if blocked_by_rate_limit > 0:
        print(f" ✅ Success: Rate limiter kicked in! Blocked {blocked_by_rate_limit}/50 requests.")
    else:
        print(f" ❌ Failure: All 50 requests were allowed. Rate limiting is NOT working.")

if __name__ == "__main__":
    run_diverse_ip_test()

