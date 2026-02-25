import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from tensorflow import keras
from tensorflow.keras import layers

DATA = Path("app/ai_models/data/ai_requests.jsonl")
BUNDLE_OUT = Path("app/ai_models/ai_model.joblib")     # keep same name so your app doesn't change
AE_OUT = Path("app/ai_models/ae_model.keras")          # new

def load_rows():
    rows = []
    with DATA.open("r", encoding="utf-8") as f:
        for line in f:
            obj = json.loads(line)
            # Only train on baseline data; exclude analyst-marked attack rows
            if obj.get("label", "baseline") == "attack":
                continue
            rows.append(obj["features"])
    return rows

def build_autoencoder(input_dim: int) -> keras.Model:
    inp = keras.Input(shape=(input_dim,), dtype="float32")
    x = layers.Dense(64, activation="relu")(inp)
    x = layers.Dense(32, activation="relu")(x)
    x = layers.Dense(64, activation="relu")(x)
    out = layers.Dense(input_dim, activation="linear")(x)
    model = keras.Model(inp, out)
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mse")
    return model

def main():
    rows = load_rows()
    df = pd.DataFrame(rows).fillna(0)

    # Separate categoricals + numerics
    cat_cols = ["method"]
    num_cols = [c for c in df.columns if c not in cat_cols]

    # sklearn version compatibility for OneHotEncoder sparse output
    try:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=True)
    except TypeError:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse=True)

    pre = ColumnTransformer(
        transformers=[
            ("cat", ohe, cat_cols),
            ("num", "passthrough", num_cols),
        ]
    )

    clf = IsolationForest(
        n_estimators=200,
        contamination=0.01,
        random_state=42,
    )

    pipe = Pipeline([("pre", pre), ("clf", clf)])
    pipe.fit(df)

    # ===== Autoencoder training on the SAME preprocessed features =====
    # Use the fitted preprocessor from the pipeline
    X_sparse = pipe.named_steps["pre"].transform(df)
    if hasattr(X_sparse, "toarray"):
        X = X_sparse.toarray().astype("float32")
    else:
        X = X_sparse.astype("float32")


    ae = build_autoencoder(X.shape[1])
    ae.fit(
        X, X,
        epochs=50,
        batch_size=256,
        validation_split=0.1,
        callbacks=[keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True)],
        verbose=1,
    )

    # Calibration for AE anomaly score mapping
    recon = ae.predict(X, verbose=0)
    mse = np.mean((X - recon) ** 2, axis=1)

    calib = {
        "p50": float(np.percentile(mse, 50)),
        "p95": float(np.percentile(mse, 95)),
        "p99": float(np.percentile(mse, 99)),
    }

    # Save bundle + AE
    BUNDLE_OUT.parent.mkdir(exist_ok=True)

    joblib.dump(
        {
            "model": pipe,                       # your original pipeline
            "columns": df.columns.tolist(),       # same
            "ae_path": str(AE_OUT),               # new
            "ae_calib": calib,                    # new
        },
        BUNDLE_OUT
    )
    ae.save(AE_OUT)

    print("Saved bundle:", BUNDLE_OUT)
    print("Saved autoencoder:", AE_OUT)
    print("AE calib:", calib)
