# app/db/db_bootstrap.py
from __future__ import annotations
from pathlib import Path
import pymysql


class DBInitError(Exception):
    """Base error for DB initialization (safe to show user)."""


class DBAuthError(DBInitError):
    """Invalid DB username/password."""


class DBConnectionError(DBInitError):
    """Cannot reach DB host/port or server refused connection."""


class DBSchemaError(DBInitError):
    """Schema execution failed."""


def _connect_server(host: str, port: int, user: str, password: str):
    return pymysql.connect(
        host=host,
        user=user,
        password=password,
        port=port,
        charset="utf8mb4",
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


def _connect_db(host: str, port: int, user: str, password: str, database: str):
    return pymysql.connect(
        host=host,
        user=user,
        password=password,
        database=database,
        port=port,
        charset="utf8mb4",
        autocommit=True,
        cursorclass=pymysql.cursors.DictCursor,
    )


def _run_sql_statements(conn, sql: str) -> None:
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    with conn.cursor() as cur:
        for stmt in statements:
            cur.execute(stmt)


def ensure_database_and_schema(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
    schema_path: Path | None,
) -> None:
    try:
        # 1) create database if missing
        server_conn = _connect_server(host, port, user, password)
        try:
            with server_conn.cursor() as cur:
                cur.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
        finally:
            server_conn.close()

        # 2) connect to db and run schema
        db_conn = _connect_db(host, port, user, password, database)
        try:
            if not schema_path:
                raise DBSchemaError("Schema file path is not provided.")

            if not schema_path.exists():
                raise DBSchemaError(f"Schema file not found: {schema_path}")

            sql = schema_path.read_text(encoding="utf-8")
            _run_sql_statements(db_conn, sql)

        finally:
            db_conn.close()

    except pymysql.err.OperationalError as e:
        # e.args[0] is MySQL error code in most cases
        code = e.args[0] if e.args else None

        # Auth failed
        if code == 1045:
            raise DBAuthError("Database authentication failed.") from e

        # Connection-related (common)
        # 2003: Can't connect to MySQL server
        # 2005: Unknown MySQL server host
        # 2013: Lost connection to MySQL server
        if code in (2003, 2005, 2013):
            raise DBConnectionError("Unable to connect to the database server.") from e

        # Default safe message
        raise DBInitError("Database initialization failed.") from e

    except pymysql.err.ProgrammingError as e:
        # Often schema SQL errors
        raise DBSchemaError("Database schema execution failed.") from e

    except Exception as e:
        raise DBInitError("Database initialization failed due to an internal error.") from e
