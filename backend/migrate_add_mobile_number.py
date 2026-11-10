from app import create_app, db

app = create_app()

with app.app_context():
    columns = db.session.execute(
        db.text("PRAGMA table_info(users)")
    ).fetchall()

    column_names = [column[1] for column in columns]

    if "mobile_number" not in column_names:
        db.session.execute(
            db.text(
                "ALTER TABLE users ADD COLUMN mobile_number VARCHAR(20)"
            )
        )
        db.session.commit()
        print("Mobile number column added successfully.")
    else:
        print("Mobile number column already exists.")