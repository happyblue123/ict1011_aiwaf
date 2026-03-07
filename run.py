import json
import subprocess
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
PORT_FILE = ROOT / "port.json"


def get_db_port():
    """Read proxy_port from the active WAF instance in DB."""
    try:
        from app.services.runtime_config import get_active_waf_config
        cfg = get_active_waf_config()
        if cfg and cfg.get("proxy_port"):
            return int(cfg["proxy_port"])
    except Exception as e:
        print(f"[run.py] Could not read proxy_port from DB: {e}")
    return 8080


def read_port_file():
    """Read port from port.json, defaulting to 8080."""
    try:
        return int(json.loads(PORT_FILE.read_text()).get("port", 8080))
    except Exception:
        return 8080


if __name__ == "__main__":
    # Load .env so DB credentials are available
    load_dotenv(ROOT / ".env")

    port = get_db_port()
    PORT_FILE.write_text(json.dumps({"port": port}))

    while True:
        print(f"[run.py] Starting server on port {port}")
        proc = subprocess.Popen([
            sys.executable, "-m", "uvicorn",
            "app.main:app",
            "--host", "0.0.0.0",
            f"--port={port}",
            "--reload"
        ])

        try:
            while True:
                time.sleep(2)
                new_port = read_port_file()
                if new_port != port:
                    print(f"[run.py] Port changed to {new_port}, restarting...")
                    port = new_port
                    proc.terminate()
                    proc.wait(timeout=10)
                    break
                if proc.poll() is not None:
                    sys.exit(proc.returncode)
        except KeyboardInterrupt:
            proc.terminate()
            proc.wait()
            sys.exit(0)
