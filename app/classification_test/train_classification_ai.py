import json
import joblib
import random
import numpy as np
import os
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report

LOG_FILE = "app/test/waf_logs.jsonl"
PAYLOAD_FILE = "app/test/malicious_payloads.txt"
MODEL_OUTPUT = "app/ai_models/request_classifier.pkl"

def request_to_text(method, query, body):
    m = str(method or "GET").upper()
    q = str(query or "")
    b = str(body or "")
    return f"{m} ?{q} {b}".strip()

def train_balanced_model():
    # 1. Load attack payloads
    if not os.path.exists(PAYLOAD_FILE):
        print(f"[!] Payload file {PAYLOAD_FILE} not found.")
        return
    with open(PAYLOAD_FILE, "r", encoding="utf-8") as f:
        attacks = [l.strip() for l in f if l.strip() and not l.startswith("#")]

    X, y = [], []
    safe_chars = "abcdefghijklmnopqrstuvwxyz0123456789"

    # 2. Load and Analyze Benign Logs
    print(f"[*] Analyzing logs from {LOG_FILE}...")
    with open(LOG_FILE, "r", encoding="utf-8") as f:
        for line in f:
            try:
                log = json.loads(line)
                if log.get("decision", {}).get("action") != "allow":
                    continue

                method = log.get("method", "GET")
                query = log.get("query", "")
                body = log.get("body_text", "")
                body_keys = log.get("body_keys", [])

                # --- BENIGN SAMPLES (Label 0) ---
                # Amplify the real logs significantly (50x)
                for _ in range(50):
                    X.append(request_to_text(method, query, body))
                    y.append(0)

                # --- DYNAMIC STRUCTURAL SHIELD (The Fix for 'admin') ---
                # This teaches the AI that random_key=random_value is SAFE.
                # We use your body_keys but fill them with safe alphanumeric noise.
                if body_keys:
                    for _ in range(30):
                        synthetic_body = "&".join([f"{k}={''.join(random.choices(safe_chars, k=8))}" for k in body_keys])
                        X.append(request_to_text("POST", "", synthetic_body))
                        y.append(0)

                # --- EXHAUSTIVE MALICIOUS MAPPING (Label 1) ---
                # We use randomized keys for attacks so the AI focuses ONLY on the payload.
                for payload in attacks:
                    fake_key = "input_" + "".join(random.choices(safe_chars, k=3))
                    X.append(request_to_text(method, f"{fake_key}={payload}", payload))
                    y.append(1)

            except Exception:
                continue

    # 3. Pipeline with Regularization Anchor
    # C=0.1 ensures the model doesn't overreact to common alphanumeric strings.
    model = Pipeline([
        ("tfidf", TfidfVectorizer(
            analyzer="char",
            ngram_range=(3, 6),
            sublinear_tf=True,
            max_features=25000,
            min_df=5 
        )),
        ("clf", LogisticRegression(
            class_weight="balanced",
            max_iter=5000,
            C=0.1
        ))
    ])

    # 4. Train
    print(f"[*] Total dataset size: {len(X)} samples")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.1, stratify=y)
    
    print("[*] Training model...")
    model.fit(X_train, y_train)

    print("\n--- Final Classification Report ---")
    print(classification_report(y_test, model.predict(X_test)))

    # 5. Save ONLY the model (No threshold)
    joblib.dump(model, MODEL_OUTPUT)
    print(f"[+] Model saved to {MODEL_OUTPUT}. You can now set your threshold manually in the test script.")

if __name__ == "__main__":
    train_balanced_model()