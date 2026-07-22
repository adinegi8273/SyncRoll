# SyncRoll

**Offline-first attendance system that automatically syncs with your ERP.**

SyncRoll is a web application that lets faculty mark student attendance even when the ERP is unreachable due to internet or server issues. Attendance is stored locally and automatically synchronized with the ERP backend as soon as connectivity is restored.

---

## Problem Statement

- Teachers often can't mark attendance directly into the ERP due to internet or server downtime.
- As a workaround, they resort to manual methods — pen and paper, or noting roll numbers separately — and re-enter the data later.
- This is time-consuming, since faculty must repeatedly check ERP/internet availability before they can mark attendance properly.

## Why SyncRoll

Existing offline-attendance tools (e.g. AttendFy, Jibble) solve basic offline capture and auto-sync, but share common gaps:

- **No sync visibility** — users can't tell if data is still unsynced on their device.
- **Weak conflict/duplicate handling** — edge cases like the same record being edited twice aren't well managed.
- **Poor error feedback** — failed syncs don't give clear next steps.
- **Storage dependency risk** — data can be lost if local storage fills up or gets corrupted.
- **Rigid integrations** — most tools are locked to their own backend rather than flexible ERP/database schemas.

SyncRoll is designed specifically for classroom/ERP workflows, with robust sync visibility, conflict resolution, and error handling built in from the start.

## Objectives

- Synchronize attendance with the backend in real time whenever internet is available.
- Show faculty a clear dashboard of **synced**, **pending**, and **failed** attendance records, with failed requests retained for retry.
- Provide a feedback mechanism for surfacing app issues and enabling continuous improvement.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Dexie.js, Axios, UUID |
| Backend | Python, FastAPI, SQLAlchemy ORM |
| Local DB | IndexedDB (via Dexie.js) |
| Server DB | PostgreSQL |
| Security | JWT tokens, password hashing (passlib) |

## System Architecture

```
CLIENT SIDE (Browser / React)                 SERVER SIDE
┌───────────────────────────┐
│   UI Components            │
│ (Attendance Interface,     │
│  Selectors)                │
└─────────────┬───────────────┘
              │
   ┌──────────┴──────────┐
   │                      │
┌────────────┐   ┌─────────────────┐        ┌──────────────────┐
│ Local       │   │ Sync Engine     │        │ FastAPI Backend  │
│ Storage     │◄─►│ (Network Monitor,│──HTTPS─►│ (Python)         │
│ (IndexedDB/ │   │  Conflict Logic)│  REST   └────────┬──────────┘
│  Dexie.js)  │   └─────────────────┘  (Axios          │
└────────────┘                          + JWT)  ┌──────┴───────────┐
                                                 │ Auth Service     │
                                                 │ (JWT & Passlib)  │
                                                 └──────┬───────────┘
                                                         │ SQLAlchemy ORM
                                                 ┌──────┴───────────┐
                                                 │ PostgreSQL        │
                                                 │ (Main Database)   │
                                                 └────────────────────┘
```

### Core Components

- **Frontend (The Vault)** — Built with React + Vite, using IndexedDB (via Dexie.js) as local storage so faculty can mark attendance directly on-device even when offline.
- **Sync Engine (The Brain)** — The project's core innovation. Continuously monitors network status; once online, automatically pushes records to the server with retry logic and conflict detection to prevent duplicates.
- **Backend (The Validator)** — A FastAPI (Python) server that validates incoming sync requests and ensures data integrity.
- **Database & Security** — Permanent records live in PostgreSQL. The system is secured with JWT-based authentication and password hashing.

---

## Development Roadmap

### Phase 1 — Setup (Days 1–2)
- Install Node.js, Python, PostgreSQL
- Create React frontend with Vite
- Set up FastAPI backend
- Connect frontend to backend API

### Phase 2 — Authentication (Days 3–5)
- Build login system with JWT tokens
- Create faculty user database table
- Implement password hashing
- Add login UI component

### Phase 3 — Offline Storage (Days 6–8)
- Set up IndexedDB using Dexie.js
- Create tables: `attendance_logs`, `subjects`, `sections`, `students`
- Generate unique IDs (UUID) for offline records
- Build offline storage service functions

### Phase 4 — UI Components (Days 9–12)
- Create attendance marking interface
- Add subject and section selectors
- Build student list with present/absent toggles
- Implement bulk actions (mark all present/absent)
- Show sync status indicators

### Phase 5 — Sync Engine (Days 13–16) — *Core Innovation*
- Build network monitor to detect online/offline status
- Create sync service to push pending records to backend
- Implement conflict detection (duplicate prevention)
- Add retry logic for failed syncs
- Generate checksums to verify data integrity
- Use device fingerprinting to prevent duplicate submissions

### Phase 6 — Backend API (Days 17–19)
- Create sync endpoint: `POST /api/sync/attendance`
- Validate incoming data from frontend
- Check for duplicate records in database
- Save valid records to PostgreSQL
- Return sync results (success/error) per record

### Phase 7 — Testing (Days 20–21)
- Test online mode: mark attendance → verify in database
- Test offline mode: stop backend → mark attendance → check IndexedDB
- Restart backend → verify automatic sync within 30 seconds
- Test conflict detection with duplicate submissions

---

## Future Enhancements

- **Mobile Apps** — Bring SyncRoll to smartphones with biometric auth and QR scanning
- **Admin Dashboard** — Monitor system activity, generate reports, resolve conflicts
- **Student/Parent Portal** — Let students track attendance and keep parents informed
- **AI Features** — Facial recognition, pattern detection, smart suggestions
- **ERP Integration** — Connect with existing institutional systems via APIs

---

## Getting Started

```bash
# Clone the repository
git clone <repo-url>
cd syncroll

# Backend setup
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend setup
cd frontend
npm install
npm run dev
```

> Update this section once your actual folder structure and setup scripts are finalized.

## License

Specify your project's license here.
