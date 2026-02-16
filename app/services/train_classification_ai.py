import json
import joblib
import random
import os
import nltk
from nltk.corpus import words, brown
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import classification_report

# --- SETTINGS ---
LOG_FILE = "logs/access.jsonl"
# Point this to your new directory
PAYLOAD_DIR = "app/ai_models/data/payloads/" 
MODEL_OUTPUT = "app/ai_models/request_classifier.pkl"

# Initialize NLTK data
try:
    nltk.data.find('corpora/words')
    nltk.data.find('corpora/brown')
except LookupError:
    nltk.download('words')
    nltk.download('brown')

def request_to_text(method, query, body):
    m = str(method or "GET").upper()
    q = str(query or "")
    b = str(body or "")
    return f"{m} ?{q} {b}".strip()

def load_all_payloads(directory):
    """New helper to ingest all downloaded .txt files."""
    all_attacks = []
    if not os.path.exists(directory):
        print(f"[!] Directory {directory} not found.")
        return []
    
    for filename in os.listdir(directory):
        if filename.endswith(".txt"):
            path = os.path.join(directory, filename)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                # Add lines that aren't empty or comments
                all_attacks.extend([l.strip() for l in f if l.strip() and not l.startswith("#")])
    
    # Deduplicate to prevent biasing the model on repeating payloads
    return list(set(all_attacks))

def train_classification_model():
    X, y = [], []
    
    # --- PILLAR 1: SYMMETRIC MALICIOUS PAYLOADS ---
    print(f"[*] Loading payloads from {PAYLOAD_DIR}...")
    attacks = load_all_payloads(PAYLOAD_DIR)
    
    if not attacks:
        print("[!] No payloads found. Check your download script.")
        return

    for p in attacks:
        key = random.choice(["id", "q", "data", "input"])
        # Inject into Query (GET style)
        X.append(request_to_text("GET", f"{key}={p}", ""))
        y.append(1)
        # Inject into Body (POST style)
        X.append(request_to_text("POST", "", f"{key}={p}"))
        y.append(1)
    
    # --- PILLAR 2: GENERIC ENGLISH ---
    # We increase this slightly to balance the huge influx of new payloads
    word_list = words.words()
    sentences = [" ".join(sent) for sent in brown.sents()]
    num_benign = max(4000, len(attacks)) # Dynamic scaling
    
    print(f"[*] Generating {num_benign} Generic English samples...")
    for _ in range(num_benign):
        content = random.choice(word_list) if random.random() > 0.5 else random.choice(sentences)[:50]
        content = content.replace(" ", "+").replace('"', "").replace("'", "")
        X.append(request_to_text("GET", f"q={content}", ""))
        y.append(0)

    # --- PILLAR 3: REAL APP LOGS ---
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    log = json.loads(line)
                    if log.get("decision", {}).get("action") == "allow":
                        # Amplify real logs to ensure they aren't lost in the noise
                        for _ in range(5):
                            X.append(request_to_text(log.get("method"), log.get("query"), log.get("body_text")))
                            y.append(0)
                except: continue
    
    # --- PILLAR 4: PARAMETER NOISE ---
    safe_keys = ["user_id", "session", "token", "id", "ref", "lang"]
    for _ in range(2000):
        k = random.choice(safe_keys)
        v = str(random.randint(1, 9999)) if random.random() > 0.5 else "active"
        X.append(request_to_text("GET", f"{k}={v}", ""))
        y.append(0)

    # --- THE HIGH-SENSITIVITY PIPELINE ---
    model = Pipeline([
        ("tfidf", TfidfVectorizer(
            analyzer="char_wb", 
            ngram_range=(2, 5), 
            sublinear_tf=True,
            max_features=30000, # Increased features for more payload variety
            min_df=1 
        )),
        ("clf", LogisticRegression(
            class_weight={0: 1, 1: 15}, # Slightly lowered from 20 to prevent over-sensitivity
            max_iter=5000,
            C=10.0 # High C for sharp decision boundaries
        ))
    ])

    # Shuffle and Train
    data = list(zip(X, y))
    random.shuffle(data)
    X, y = zip(*data)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.1, stratify=y)
    
    print(f"[*] Total Dataset Size: {len(X)} | Training model...")
    model.fit(X_train, y_train)

    print("\n--- Final Classification Report ---")
    print(classification_report(y_test, model.predict(X_test)))

    joblib.dump(model, MODEL_OUTPUT)
    print(f"[+] Model saved to {MODEL_OUTPUT}")
