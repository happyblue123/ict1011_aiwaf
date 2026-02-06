from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


def derive_origin_base_url(target_host: str) -> str:
    """
    Convert canonical target_host into origin base URL.

    Examples:
      "1.1.1.1:80"   -> "http://1.1.1.1:80"
      "example.com:443" -> "https://example.com:443"
    """
    host, port_str = target_host.rsplit(":", 1)
    port = int(port_str)

    scheme = "https" if port == 443 else "http"
    return f"{scheme}://{host}:{port}"


# =========================================================
# Project paths
# =========================================================

# __file__ = .../app/settings.py
# parent   = .../app
# parent   = project root
BASE_DIR = Path(__file__).resolve().parent.parent

# .env lives in <project-root>/Server/.env
ENV_PATH = BASE_DIR / "Server" / ".env"


# =========================================================
# Static / boot-time configuration ONLY
# =========================================================

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        extra="ignore",
    )

    # Logging
    LOG_DIR: str = "logs"
    ACCESS_LOG_FILE: str = "access.jsonl"

    # Database (used before DB bootstrap + during runtime)
    DB_HOST: str = "127.0.0.1"
    DB_USER: str = "root"
    DB_PASSWORD: str = "password"  # overridden by .env
    DB_NAME: str = "neurowaf_db"
    DB_PORT: int = 3306


settings = Settings()
