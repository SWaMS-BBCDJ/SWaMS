from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app(config_class="config.Config"):
    app = Flask(__name__)
    app.config.from_object(config_class)
    CORS(app, origins=["http://localhost:5173"])
    db.init_app(app)

    from app.routes import main
    app.register_blueprint(main)

    with app.app_context():
        db.create_all()

    return app
