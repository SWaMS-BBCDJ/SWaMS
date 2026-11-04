
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Keep the database inside flask-backend.
DB_PATH = Path(__file__).resolve().parent / "water_quality.db"

# TESTING: save a snapshot every 60 seconds.
# FINAL: change this to 4 * 60 * 60.
LOG_INTERVAL_SECONDS = 60

db_lock = threading.Lock()


def now_utc():
    return datetime.now(timezone.utc).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


def connect_db():
    connection = sqlite3.connect(str(DB_PATH), timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS water_quality_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                turbidity REAL NOT NULL,
                temperature REAL NOT NULL,
                ph REAL NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS latest_sensor_reading (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                turbidity REAL NOT NULL,
                temperature REAL NOT NULL,
                ph REAL NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        db.commit()


@app.get("/")
def home():
    return jsonify({
        "message": "SWaMS Flask backend is running"
    })


@app.get("/api/readings/latest")
def get_latest():
    with connect_db() as db:
        row = db.execute("""
            SELECT * FROM latest_sensor_reading WHERE id = 1
        """).fetchone()

    if row is None:
        return jsonify({
            "error": "No live sensor reading received yet"
        }), 404

    return jsonify(dict(row))


@app.post("/api/readings")
def receive_reading():
    data = request.get_json(silent=True) or {}

    try:
        ph = float(data["ph"])
        temperature = float(data["temperature"])
        turbidity = float(data["turbidity"])
    except (KeyError, TypeError, ValueError):
        return jsonify({
            "error": "Send numeric ph, temperature, and turbidity values"
        }), 400

    import math

    if not all(map(math.isfinite, [ph, temperature, turbidity])):
        return jsonify({"error": "Values must be finite numbers"}), 400

    if not 0 <= ph <= 14:
        return jsonify({"error": "pH must be between 0 and 14"}), 400

    if not -50 <= temperature <= 100 or turbidity < 0:
        return jsonify({"error": "Sensor value is outside accepted limits"}), 400

    timestamp = now_utc()

    # Update the latest reading only. Do not add a history row here.
    with db_lock:
        with connect_db() as db:
            db.execute("""
                INSERT INTO latest_sensor_reading
                    (id, turbidity, temperature, ph, created_at)
                VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    turbidity = excluded.turbidity,
                    temperature = excluded.temperature,
                    ph = excluded.ph,
                    created_at = excluded.created_at
            """, (turbidity, temperature, ph, timestamp))
            db.commit()

    return jsonify({
        "message": "Latest sensor reading updated",
        "created_at": timestamp
    }), 200


@app.get("/api/readings")
def get_readings():
    try:
        limit = int(request.args.get("limit", 100))
    except ValueError:
        limit = 100

    limit = max(1, min(limit, 1000))

    with connect_db() as db:
        rows = db.execute("""
            SELECT * FROM water_quality_readings
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()

    return jsonify([dict(row) for row in rows])


def save_snapshot():
    # Only save if the ESP32 has sent at least one reading.
    with db_lock:
        with connect_db() as db:
            latest = db.execute("""
                SELECT turbidity, temperature, ph, created_at
                FROM latest_sensor_reading
                WHERE id = 1
            """).fetchone()

            if latest is None:
                print("No sensor data yet; snapshot skipped.")
                return

            db.execute("""
                INSERT INTO water_quality_readings
                    (turbidity, temperature, ph, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                latest["turbidity"],
                latest["temperature"],
                latest["ph"],
                now_utc()
            ))
            db.commit()

    print("Four-hour snapshot saved.")


def snapshot_scheduler():
    while True:
        time.sleep(LOG_INTERVAL_SECONDS)

        try:
            save_snapshot()
        except Exception as error:
            app.logger.exception("Snapshot failed: %s", error)


init_db()

# Start one scheduler for this process.
threading.Thread(
    target=snapshot_scheduler,
    daemon=True
).start()


if __name__ == "__main__":
    print("SWaMS Flask backend starting...")
    print(f"Database: {DB_PATH}")
    print(f"Snapshot interval: {LOG_INTERVAL_SECONDS} seconds")

    app.run(host="0.0.0.0", port=3000, debug=False)
