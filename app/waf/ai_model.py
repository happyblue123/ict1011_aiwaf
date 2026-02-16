from pathlib import Path
import joblib
import numpy as np
import pandas as pd

from tensorflow import keras

ANOMALY_MODEL_PATH = Path("app/ai_models/ai_model.joblib")
CLASSIFICATION_MODEL_PATH = Path("app/ai_models/request_classifier.pkl")

class AIAnomalyScorer:
    def __init__(self):
        self.bundle = None
        self.ae = None

    def is_ready(self) -> bool:
        return self.bundle is not None

    def load(self):
        if ANOMALY_MODEL_PATH.exists():
            self.bundle = joblib.load(ANOMALY_MODEL_PATH)

            # AE is optional (backwards compatible)
            ae_path = self.bundle.get("ae_path")
            if ae_path:
                try:
                    self.ae = keras.models.load_model(ae_path)
                except Exception:
                    self.ae = None

    def _iforest_score(self, df: pd.DataFrame) -> float:
        model = self.bundle["model"]  # sklearn pipeline
        normality = model.decision_function(df)[0]  # higher = more normal
        # your same monotonic mapping
        return float(1.0 / (1.0 + (2.71828 ** (normality * 5.0))))

    def _ae_score(self, df: pd.DataFrame) -> tuple[float, float]:
        """
        Returns (ae_score_0_to_1, mse)
        """
        if self.ae is None:
            return 0.0, 0.0

        pipe = self.bundle["model"]
        pre = pipe.named_steps["pre"]

        Xs = pre.transform(df)                 # sparse
        Xs = pre.transform(df)  # sparse OR dense depending on sklearn/version
        X = Xs.toarray().astype("float32") if hasattr(Xs, "toarray") else Xs.astype("float32")


        recon = self.ae.predict(X, verbose=0)
        mse = float(np.mean((X - recon) ** 2))

        calib = self.bundle.get("ae_calib") or {}
        p50 = float(calib.get("p50", 0.0))
        p99 = float(calib.get("p99", p50 + 1e-9))

        if mse <= p50:
            ae_score = 0.0
        elif mse >= p99:
            ae_score = 1.0
        else:
            ae_score = float((mse - p50) / (p99 - p50 + 1e-9))

        return ae_score, mse

    def score_detail(self, features: dict) -> dict:
        """
        Returns detailed scores.
        """
        if not self.bundle:
            return {"combined": 0.0, "if_score": 0.0, "ae_score": 0.0, "ae_mse": 0.0}

        cols = self.bundle["columns"]
        df = pd.DataFrame([features])

        # align columns (missing -> 0)
        for c in cols:
            if c not in df.columns:
                df[c] = 0
        df = df[cols].fillna(0)

        if_score = self._iforest_score(df)
        ae_score, mse = self._ae_score(df)

        # combine (simple average; tune later)
        combined = 0.5 * if_score + 0.5 * ae_score

        return {
            "combined": float(combined),
            "if_score": float(if_score),
            "ae_score": float(ae_score),
            "ae_mse": float(mse),
            "ae_ready": bool(self.ae is not None),
        }

    def score(self, features: dict) -> float:
        """
        Return anomaly score in [0,1] (higher = more anomalous).
        """
        return self.score_detail(features)["combined"]

class AIRequestClassifier:
    def __init__(self):
        self.model = None  # This will hold the sklearn Pipeline (TF-IDF + Classifier)

    def is_ready(self) -> bool:
        return self.model is not None

    def load(self):
        """Loads the saved classification pipeline from disk."""
        if CLASSIFICATION_MODEL_PATH.exists():
            try:
                # Assuming the model was saved as a joblib/pickle pipeline
                self.model = joblib.load(CLASSIFICATION_MODEL_PATH)
            except Exception as e:
                print(f"Error loading classification model: {e}")
                self.model = None

    def predict_score(self, request_text: str) -> float:
        """
        Returns a maliciousness score between 0 and 1.
        Higher score = higher probability of being a threat.
        """
        if not self.is_ready():
            return 0.0

        # Most text classifiers expect a list-like input
        # Get probability of the 'Malicious' class (usually index 1)
        try:
            probs = self.model.predict_proba([request_text])[0]
            # Assumes 0: Benign, 1: Malicious
            return float(probs[1])
        except Exception:
            return 0.0

    def classify(self, request_text: str, threshold: float = 0.5) -> dict:
        """
        Returns a structured decision based on the maliciousness score.
        """
        score = self.predict_score(request_text)
        return {
            "malicious_score": score,
            "is_blocked": score >= threshold,
            "decision": "BLOCK" if score >= threshold else "ALLOW"
        }