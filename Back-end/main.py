from passlib.context import CryptContext
from fastapi import FastAPI
from sqlalchemy import create_engine
from fastapi import Form
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from datetime import date
# Basic setup


app = FastAPI()

DATABASE_URL = "postgresql://postgres:123@localhost/syncroll"

engine = create_engine(DATABASE_URL)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all (for development)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Add Password Hashing (bcrypt)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)



# Create User (Signup API)



@app.post("/signup")
def signup(username: str = Form(...), password: str = Form(...)):
    
    hashed_password = hash_password(password)

    with engine.connect() as conn:
        
        # check if user already exists
        result = conn.execute(
            text("SELECT * FROM faculty WHERE username = :username"),
            {"username": username}
        ).fetchone()

        if result:
            return {"message": "User already exists"}

        # insert new user
        conn.execute(
            text("INSERT INTO faculty (username, password_hash) VALUES (:username, :password)"),
            {"username": username, "password": hashed_password}
        )
        conn.commit()

    return {"message": "Signup successful"}


# Login API

@app.post("/login")
def login(username: str = Form(...), password: str = Form(...)):
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT * FROM faculty WHERE username = :u"),
            {"u": username}
        ).fetchone()

    if not result:
        return {"message": "User not found"}

    faculty_id = result[0]   # ✅ get ID
    stored_password = result[2]

    if verify_password(password, stored_password):
        return {
            "message": "Login successful",
            "faculty_id": faculty_id   # 🔥 THIS LINE FIXES EVERYTHING
        }
    else:
        return {"message": "Invalid password"}


#faculty dashboard connection

@app.get("/faculty/{faculty_id}")
def get_faculty_data(faculty_id: int):
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT fa.section_id, s.name as section_name,
                   fa.subject_id, sub.name as subject_name
            FROM faculty_assignments fa
            JOIN sections s ON fa.section_id = s.id
            JOIN subjects sub ON fa.subject_id = sub.id
            WHERE fa.faculty_id = :id
        """), {"id": faculty_id})

        return [dict(row._mapping) for row in result]


# Get students by section

@app.get("/students/{section_id}")
def get_students(section_id: int):
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT id, name FROM students WHERE section_id = :sid"),
            {"sid": section_id}
        )

        return [dict(row._mapping) for row in result]


# Submit attendance

@app.post("/attendance")
async def submit_attendance(request: Request):
    data = await request.json()

    faculty_id = data["faculty_id"]
    section_id = data["section_id"]
    subject_id = data["subject_id"]
    attendance_list = data["attendance"]

    today = date.today()

    with engine.connect() as conn:
        for record in attendance_list:
            student_id = record["student_id"]
            status = record["status"]

            conn.execute(
                text("""
                    INSERT INTO attendance 
                    (student_id, section_id, subject_id, faculty_id, date, status)
                    VALUES (:student_id, :section_id, :subject_id, :faculty_id, :date, :status)
                    ON CONFLICT (student_id, subject_id, date)
                    DO UPDATE SET status = EXCLUDED.status
                """),
                {
                    "student_id": student_id,
                    "section_id": section_id,
                    "subject_id": subject_id,
                    "faculty_id": faculty_id,
                    "date": today,
                    "status": status
                }
            )
        conn.commit()

    return {"message": "Attendance saved successfully"}