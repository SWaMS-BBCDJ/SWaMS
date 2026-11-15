
import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import (
    MetaData,
    Table,
    create_engine,
    inspect,
    text,
)

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
SQLITE_PATH = BASE_DIR / "instance" / "swams.db"

load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing from backend/.env")

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace(
        "postgresql://",
        "postgresql+psycopg://",
        1,
    )

if not SQLITE_PATH.exists():
    raise FileNotFoundError(f"SQLite database not found: {SQLITE_PATH}")

# Parent tables must be imported before dependent tables.
TABLE_ORDER = [
    "ponds",
    "users",
    "readings",
    "thresholds",
    "alert_logs",
    "sensor_readings",
    "live_readings",
    "hourly_reading_buffer",
    "alert_incidents",
    "incident_parameters",
    "sms_commands",
]


def main():
    print("====================================")
    print("       SWaMS DATABASE MIGRATION")
    print("====================================")

    print("\nConnecting to SQLite...")
    sqlite_engine = create_engine(
        f"sqlite:///{SQLITE_PATH.as_posix()}"
    )

    print("Connecting to Supabase...")
    postgres_engine = create_engine(
        DATABASE_URL,
        connect_args={"sslmode": "require"},
        pool_pre_ping=True,
    )

    source_metadata = MetaData()
    target_metadata = MetaData()

    source_metadata.reflect(bind=sqlite_engine)
    target_metadata.reflect(
        bind=postgres_engine,
        schema="public",
    )

    # Confirm that all expected tables exist.
    source_tables = set(source_metadata.tables.keys())
    target_tables = {
        table.name
        for table in target_metadata.tables.values()
    }

    missing_source = set(TABLE_ORDER) - source_tables
    missing_target = set(TABLE_ORDER) - target_tables

    if missing_source:
        raise RuntimeError(
            f"Missing SQLite tables: {missing_source}"
        )

    if missing_target:
        raise RuntimeError(
            f"Missing Supabase tables: {missing_target}"
        )

    # Check that every destination table is empty.
    print("\nChecking destination tables...")

    with postgres_engine.connect() as connection:
        for name in TABLE_ORDER:
            count = connection.execute(
                text(f'SELECT COUNT(*) FROM public."{name}"')
            ).scalar_one()

            print(f"{name}: {count} records")

            if count != 0:
                raise RuntimeError(
                    f"STOP: {name} is not empty. "
                    "No data has been imported."
                )

    # Read source counts before migration.
    source_counts = {}

    with sqlite_engine.connect() as connection:
        for name in TABLE_ORDER:
            table = source_metadata.tables[name]
            source_counts[name] = connection.execute(
                text(f'SELECT COUNT(*) FROM "{name}"')
            ).scalar_one()

    print("\nSource record counts:")
    for name, count in source_counts.items():
        print(f"{name}: {count}")

    # Import everything in one PostgreSQL transaction.
    print("\nStarting migration...")

    with postgres_engine.begin() as connection:

        for name in TABLE_ORDER:
            source_table = Table(
                name,
                MetaData(),
                autoload_with=sqlite_engine,
            )

            target_table = target_metadata.tables[
                f"public.{name}"
            ]

            source_columns = set(source_table.c.keys())
            target_columns = set(target_table.c.keys())

            if source_columns != target_columns:
                raise RuntimeError(
                    f"Column mismatch in {name}.\n"
                    f"SQLite: {source_columns}\n"
                    f"Supabase: {target_columns}"
                )

            with sqlite_engine.connect() as source_connection:
                records = source_connection.execute(
                    source_table.select()
                ).mappings().all()

            if records:
                connection.execute(
                    target_table.insert(),
                    [dict(record) for record in records],
                )

            print(f"Imported {name}: {len(records)} records")

        # Synchronize PostgreSQL identity sequences.
        print("\nSynchronizing ID sequences...")

        for name in TABLE_ORDER:
            connection.execute(
                text(f"""
                    SELECT setval(
                        pg_get_serial_sequence(
                            'public.{name}', 'id'
                        ),
                        COALESCE(MAX(id), 1),
                        MAX(id) IS NOT NULL
                    )
                    FROM public."{name}"
                """)
            )

        # Verify all imported counts before committing.
        print("\nVerifying imported records...")

        for name, expected in source_counts.items():
            actual = connection.execute(
                text(f'SELECT COUNT(*) FROM public."{name}"')
            ).scalar_one()

            if actual != expected:
                raise RuntimeError(
                    f"Count mismatch in {name}: "
                    f"expected {expected}, got {actual}"
                )

            print(f"PASS: {name} ({actual} records)")

    print("\n====================================")
    print("       MIGRATION SUCCESSFUL")
    print("====================================")

    sqlite_engine.dispose()
    postgres_engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("\nMIGRATION FAILED")
        print("Reason:", error)
        print("The PostgreSQL transaction was rolled back.")
        raise
