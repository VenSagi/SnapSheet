"""SQLite database helper. No ORM, minimal dependencies."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from config import settings


def get_db_path() -> Path:
    """Return path to SQLite DB file."""
    return Path(settings.DB_PATH)


@contextmanager
def get_connection():
    """Context manager for DB connections."""
    path = get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create tables if they do not exist."""
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                mime TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE IF NOT EXISTS exports (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                pdf_path TEXT NOT NULL,
                version_name TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE TABLE IF NOT EXISTS layouts (
                project_id TEXT PRIMARY KEY,
                layout_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id)
            );

            CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
            CREATE INDEX IF NOT EXISTS idx_exports_project_id ON exports(project_id);
        """)
    _migrate_exports_version_name()


def _migrate_exports_version_name():
    """Add version_name to exports if missing (for existing DBs)."""
    with get_connection() as conn:
        cursor = conn.execute("PRAGMA table_info(exports)")
        columns = [row[1] for row in cursor.fetchall()]
        if "version_name" not in columns:
            conn.execute("ALTER TABLE exports ADD COLUMN version_name TEXT")
