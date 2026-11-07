"""Create a verified SQLite snapshot, including committed WAL contents.

Usage: python3 scripts/backup-sqlite.py /actual/path/casino.db /backups
Run on the host with permission to read the live database and its WAL files.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import uuid


def backup_database(source: Path, destination_directory: Path) -> Path:
    source = source.resolve(strict=True)
    if not source.is_file():
        raise ValueError("Source must be an existing database file")
    destination_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination = destination_directory / f"{source.name}.backup-{timestamp}-{uuid.uuid4().hex[:8]}"
    # Reserve the name exclusively; never overwrite an existing backup.
    with destination.open("xb"):
        pass
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=30)) as live:
            with closing(sqlite3.connect(destination)) as snapshot:
                live.backup(snapshot)
                checks = snapshot.execute("PRAGMA integrity_check").fetchall()
                if checks != [("ok",)]:
                    raise RuntimeError(f"Backup integrity check failed: {checks}")
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination_directory", type=Path)
    arguments = parser.parse_args()
    print(backup_database(arguments.source, arguments.destination_directory))
