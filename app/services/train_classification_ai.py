import json
import joblib
import random
import os
import string
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

    # --- PILLAR 5: ANALYST FEEDBACK ---
    feedback_file = os.path.join("app", "ai_models", "data", "classification_feedback.jsonl")
    if os.path.exists(feedback_file):
        feedback_count = 0
        with open(feedback_file, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    text = row.get("text", "")
                    label = int(row.get("label", 0))
                    if not text:
                        continue
                    # Amplify 10x — human-verified labels are authoritative
                    for _ in range(10):
                        X.append(text)
                        y.append(label)
                    feedback_count += 1
                except Exception:
                    continue
        if feedback_count:
            print(f"[*] Loaded {feedback_count} analyst feedback samples (amplified 10x)")

    # --- PILLAR 6: USER INPUT NOISE (GIBBERISH / RANDOM TYPING) ---
    # Real users type gibberish, typos, keyboard smash, and random strings
    # in search bars and form fields — these are BENIGN, not attacks.
    NUM_GIBBERISH = max(3000, len(attacks))
    print(f"[*] Generating {NUM_GIBBERISH} gibberish/random-input benign samples...")

    # Character pools for different gibberish styles
    LOWER = string.ascii_lowercase
    UPPER = string.ascii_uppercase
    DIGITS = string.digits
    MIXED = LOWER + UPPER + DIGITS
    KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"]
    COMMON_FORM_KEYS = ["q", "search", "name", "username", "email", "comment",
                        "message", "input", "query", "text", "value", "field"]

    def _random_gibberish():
        """Generate one random gibberish string mimicking real user input."""
        style = random.choice([
            "keyboard_smash", "random_alpha", "repeated_chars",
            "mixed_alphanum", "short_random", "long_random",
            "partial_words", "typo_strings",
        ])

        if style == "keyboard_smash":
            # User mashing nearby keys: "asdfasdf", "jkljkl", "qweqwe"
            row = random.choice(KEYBOARD_ROWS)
            length = random.randint(3, 20)
            return "".join(random.choice(row) for _ in range(length))

        elif style == "random_alpha":
            # Pure random letters: "xkjqmz", "bvntrl"
            length = random.randint(2, 25)
            return "".join(random.choice(LOWER) for _ in range(length))

        elif style == "repeated_chars":
            # "aaaaaa", "xxxxxx", "abcabcabc"
            if random.random() > 0.5:
                char = random.choice(LOWER)
                return char * random.randint(3, 15)
            else:
                chunk = "".join(random.choice(LOWER) for _ in range(random.randint(2, 4)))
                return chunk * random.randint(2, 5)

        elif style == "mixed_alphanum":
            # "abc123xyz", "test99xx"
            length = random.randint(4, 20)
            return "".join(random.choice(MIXED) for _ in range(length))

        elif style == "short_random":
            # Very short: "xx", "ab", "q1"
            length = random.randint(1, 4)
            return "".join(random.choice(MIXED) for _ in range(length))

        elif style == "long_random":
            # Longer gibberish: simulates pasting random text
            length = random.randint(20, 60)
            return "".join(random.choice(MIXED + "   ") for _ in range(length)).strip()

        elif style == "partial_words":
            # Truncated / half-typed words: "hel", "tes", "admi"
            w = random.choice(word_list)
            cut = random.randint(2, max(3, len(w) - 1))
            return w[:cut].lower()

        else:  # typo_strings
            # Real word with random chars inserted: "heXllo", "te2st"
            w = random.choice(word_list).lower()
            if len(w) < 3:
                return w
            pos = random.randint(1, len(w) - 1)
            insert = random.choice(MIXED)
            return w[:pos] + insert + w[pos:]

    for _ in range(NUM_GIBBERISH):
        gibberish = _random_gibberish()
        key = random.choice(COMMON_FORM_KEYS)
        method = random.choice(["GET", "POST"])

        if method == "GET":
            X.append(request_to_text("GET", f"{key}={gibberish}", ""))
        else:
            X.append(request_to_text("POST", "", f"{key}={gibberish}"))
        y.append(0)  # benign

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
            class_weight={0: 1, 1: 8}, # Lowered from 15 to reduce false positives on gibberish/random input
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
