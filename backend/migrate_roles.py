
from app import create_app, db

app = create_app()

with app.app_context():
    columns = db.session.execute(
        db.text("PRAGMA table_info(users)")
    ).fetchall()

    column_names = [column[1] for column in columns]

    if "role" not in column_names:
        db.session.execute(
            db.text(
                "ALTER TABLE users "
                "ADD COLUMN role VARCHAR(20) "
                "NOT NULL DEFAULT 'operator'"
            )
        )
        db.session.commit()
        print("Role column added successfully.")
    else:
        print("Role column already exists.")
