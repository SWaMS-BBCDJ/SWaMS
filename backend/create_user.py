
from getpass import getpass

from app import create_app, db
from app.models import User

app = create_app()

def setup_account(username, role):
    user = User.query.filter_by(username=username).first()

    if user:
        user.role = role
        print(f"Existing account '{username}' assigned role: {role}")
    else:
        password = getpass(f"Create password for {username}: ")
        confirm = getpass("Confirm password: ")

        if not password or password != confirm:
            raise ValueError("Password is empty or does not match.")

        user = User(username=username, role=role)
        user.set_password(password)
        db.session.add(user)

        print(f"Created {role} account: {username}")

    db.session.commit()


with app.app_context():
    admin_username = input("Admin username: ").strip()
    operator_username = input("Operator username: ").strip()

    if not admin_username or not operator_username:
        raise SystemExit("Usernames cannot be empty.")

    if admin_username == operator_username:
        raise SystemExit("Admin and operator usernames must be different.")

    setup_account(admin_username, "admin")
    setup_account(operator_username, "operator")

    print("\nBoth SWaMS accounts are ready!")
