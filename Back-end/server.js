const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");


const { Pool } = require("pg");

// ---------- Basic setup ----------
const app = express();


app.use(express.json());

app.use(express.urlencoded({ extended: true })); // handles form-encoded bodies

app.use(cors()); // allow all origins

const pool = new Pool({
  connectionString: "postgresql://postgres:123@localhost/syncroll",
});

const SALT_ROUNDS = 10;

// ---------- Password hashing helpers ----------
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

// ---------- Signup ----------
app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await hashPassword(password);

    const existing = await pool.query(
      "SELECT * FROM faculty WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      return res.json({ message: "User already exists" });
    }

    await pool.query(
      "INSERT INTO faculty (username, password_hash) VALUES ($1, $2)",
      [username, hashedPassword]
    );

    return res.json({ message: "Signup successful" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- Login ----------


app.post("/login", async (req, res) => {

  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM faculty WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ message: "User not found" });
    }

    const row = result.rows[0];
    const facultyId = row.id;            // adjust column name if different
    const storedPassword = row.password_hash; // adjust column name if different

    const valid = await verifyPassword(password, storedPassword);

    if (valid) {
      return res.json({
        message: "Login successful",
        faculty_id: facultyId,
      });
    } else {
      return res.json({ message: "Invalid password" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- Faculty dashboard connection ----------
app.get("/faculty/:facultyId", async (req, res) => {
  const { facultyId } = req.params;

  try {
    const result = await pool.query(
      `SELECT fa.section_id, s.name as section_name,
              fa.subject_id, sub.name as subject_name
       FROM faculty_assignments fa
       JOIN sections s ON fa.section_id = s.id
       JOIN subjects sub ON fa.subject_id = sub.id
       WHERE fa.faculty_id = $1`,
      [facultyId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- Get students by section ----------
app.get("/students/:sectionId", async (req, res) => {
  const { sectionId } = req.params;

  try {
    const result = await pool.query(
      "SELECT id, name FROM students WHERE section_id = $1",
      [sectionId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- Maps (frontend strings -> DB IDs) ----------
const SECTION_MAP = { A1: 1, A2: 2 };
const SUBJECT_MAP = { Maths: 1, English: 2 };

// ---------- Submit attendance ----------
app.post("/attendance", async (req, res) => {
  const {
    faculty_id,
    username,
    password,
    course,
    semester,
    section,
    subject,
    roll_numbers,
    date,
  } = req.body;

  console.log("Received section:", JSON.stringify(section));
  console.log("Received subject:", JSON.stringify(subject));

  const secId = SECTION_MAP[section];
  const subId = SUBJECT_MAP[subject];

  if (secId === undefined) {
    return res.status(400).json({
      message: `Unknown section "${section}". Expected one of: ${Object.keys(SECTION_MAP).join(", ")}`,
    });
  }

  if (subId === undefined) {
    return res.status(400).json({
      message: `Unknown subject "${subject}". Expected one of: ${Object.keys(SUBJECT_MAP).join(", ")}`,
    });
  }

  try {
    await pool.query(
      `INSERT INTO attendance
        (section_id, subject_id, faculty_username, date, status, course, semester, roll_numbers_present)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (section_id, subject_id, date)
       DO UPDATE SET roll_numbers_present = EXCLUDED.roll_numbers_present, status = EXCLUDED.status`,
      [secId, subId, username, date, "present", course, semester, roll_numbers]
    );

    return res.json({ message: "Attendance saved successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- Start server ----------
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
