import joblib
import urllib.parse
import os

# --- SETTINGS ---
MODEL_PATH = "app/ai_models/request_classifier.pkl"
# You now have full manual control over this value
THRESHOLD = 0.75

def normalize_payload(text):
    """Mirroring your Proxy logic for consistency."""
    if not text:
        return ""
    try:
        # Use unquote_plus to handle '+' as spaces (common in queries)
        return urllib.parse.unquote_plus(text).lower().strip()
    except:
        return text.lower().strip()

def format_request_string(method, query, body):
    """
    Format must match training exactly: "METHOD ?QUERY BODY"
    Note the '?' placement to align with the training script logic.
    """
    m = str(method or "GET").upper()
    q = str(query or "")
    b = str(body or "")
    return f"{m} ?{q} {b}".strip()

def test_model():
    if not os.path.exists(MODEL_PATH):
        print(f"[!] Model not found at {MODEL_PATH}. Run the training script first.")
        return

    print(f"[*] Loading AI Model: {MODEL_PATH}")

    # Load the model directly (since training script no longer saves a bundle)
    model = joblib.load(MODEL_PATH)
    
    # We use the manual constant from the top of the script
    threshold = THRESHOLD 

    test_scenarios = [
        ("GET", "/search", "q=icecream", "", "ALLOW"),
        ("GET", "/new-endpoint-unknown", "user_id=452", "", "ALLOW"),
        ("POST", "/login", "", "username=' or 1=1;-- -&password=' or 1=1;-- -'", "BLOCK"),
        ("GET", "/static/style.css", "", "", "ALLOW"),

        ("GET", "/search", "q='UNION SELECT NULL,NULL,NULL--", "", "BLOCK"),
        ("GET", "/products", "id=1' OR '1'='1", "", "BLOCK"),
        ("POST", "/contact", "", "message=;id;ls -la", "BLOCK"),
        ("GET", "/download", "file=../../../etc/passwd", "", "BLOCK"),
        ("POST", "/api/v1", "", "{\"$gt\": \"\"}", "BLOCK"),
        ("GET", "/api/v1", "", "", "ALLOW")
    ]

    print(f"\n[+] Using MANUAL Threshold: {threshold:.4f}")
    print(f"{'RESULT':<10} | {'SCORE':<8} | {'EXPECTED':<10} | {'RAW PAYLOAD'}")
    print("-" * 85)

    for method, path, query, body, expected in test_scenarios:

        clean_query = normalize_payload(query)
        clean_body = normalize_payload(body)

        # Ensure formatting matches the training script exactly
        input_text = format_request_string(method, clean_query, clean_body)

        # Get probability of the 'Malicious' class (index 1)
        probs = model.predict_proba([input_text])[0]
        malicious_score = probs[1]

        decision = "BLOCK" if malicious_score >= threshold else "ALLOW"

        color = "\033[92m" if decision == "ALLOW" else "\033[91m"
        reset = "\033[0m"
        status = "✅" if decision == expected else "❌"

        print(f"{color}{decision:<10}{reset} | {malicious_score:<8.4f} | {expected:<10} | {status} {method} {path}?{query} {body}")

if __name__ == "__main__":
    test_model()