
from app.database import get_db_connection

try:
    conn = get_db_connection()

    if conn.is_connected():
        print("SUCCESS: SWaMS MySQL Connected!")

        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")

        print("Available tables:")
        for table in cursor.fetchall():
            print(table[0])

        cursor.close()
        conn.close()

except Exception as e:
    print("DATABASE CONNECTION FAILED:")
    print(e)
