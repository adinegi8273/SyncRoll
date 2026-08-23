const API_BASE = "http://127.0.0.1:8000";
const DB_NAME = "syncroll_offline_db";
const DB_VERSION = 1;

function openSyncRollDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("attendance_records")) {
        database.createObjectStore("attendance_records", {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!database.objectStoreNames.contains("assignments")) {
        database.createObjectStore("assignments", { keyPath: "faculty_id" });
      }

      if (!database.objectStoreNames.contains("students")) {
        database.createObjectStore("students", { keyPath: "section_id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runStore(storeName, mode, callback) {
  return openSyncRollDB().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const result = callback(store);

        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
      }),
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const SyncRollDB = {
  async saveAssignments(facultyId, assignments) {
    const record = {
      faculty_id: Number(facultyId),
      assignments,
      updated_at: new Date().toISOString(),
    };

    localStorage.setItem("assignments", JSON.stringify(assignments));
    await runStore("assignments", "readwrite", (store) => store.put(record));
  },

  async getAssignments(facultyId) {
    const record = await openSyncRollDB().then(
      (database) =>
        new Promise((resolve, reject) => {
          const transaction = database.transaction("assignments", "readonly");
          const store = transaction.objectStore("assignments");
          const request = store.get(Number(facultyId));

          request.onsuccess = () => {
            database.close();
            resolve(request.result);
          };
          request.onerror = () => {
            database.close();
            reject(request.error);
          };
        }),
    );

    if (record && record.assignments) {
      return record.assignments;
    }

    const cached = localStorage.getItem("assignments");
    return cached ? JSON.parse(cached) : [];
  },

  async saveStudents(sectionId, students) {
    await runStore("students", "readwrite", (store) =>
      store.put({
        section_id: Number(sectionId),
        students,
        updated_at: new Date().toISOString(),
      }),
    );
  },

  async getStudents(sectionId) {
    const record = await openSyncRollDB().then(
      (database) =>
        new Promise((resolve, reject) => {
          const transaction = database.transaction("students", "readonly");
          const store = transaction.objectStore("students");
          const request = store.get(Number(sectionId));

          request.onsuccess = () => {
            database.close();
            resolve(request.result);
          };
          request.onerror = () => {
            database.close();
            reject(request.error);
          };
        }),
    );

    return record ? record.students : [];
  },

  async addAttendance(record) {
    const offlineRecord = {
      ...record,
      faculty_id: Number(record.faculty_id),
      synced: false,
      created_at: new Date().toISOString(),
    };

    await runStore("attendance_records", "readwrite", (store) =>
      store.add(offlineRecord),
    );
  },

  async getPendingAttendance() {
    const database = await openSyncRollDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction("attendance_records", "readonly");
      const store = transaction.objectStore("attendance_records");
      const request = store.getAll();

      request.onsuccess = () => {
        database.close();
        resolve(request.result.filter((record) => !record.synced));
      };
      request.onerror = () => {
        database.close();
        reject(request.error);
      };
    });
  },

  async markAttendanceSynced(id) {
    const database = await openSyncRollDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction("attendance_records", "readwrite");
      const store = transaction.objectStore("attendance_records");
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const record = getRequest.result;

        if (!record) {
          resolve();
          return;
        }

        record.synced = true;
        record.synced_at = new Date().toISOString();
        store.put(record);
      };

      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    });
  },

  async syncPendingAttendance() {
    if (!navigator.onLine) {
      return { synced: 0, pending: 0 };
    }

    const pending = await this.getPendingAttendance();
    let synced = 0;
    const failures = [];

    for (const record of pending) {
      // Skip records missing required fields (e.g. stale entries saved before
      // section/subject were added to the form). Mark them synced so they stop
      // being retried forever, instead of letting one bad record block the queue.
      if (!record.section || !record.subject) {
        console.warn(
          "Skipping invalid queued attendance record (missing section/subject):",
          record,
        );
        await this.markAttendanceSynced(record.id);
        continue;
      }

      try {
        const response = await fetch(`${API_BASE}/attendance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            faculty_id: record.faculty_id,
            username: record.username,
            password: record.password,
            course: record.course,
            semester: record.semester,
            section: record.section,
            subject: record.subject,
            roll_numbers: record.roll_numbers,
            date: record.date,
          }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          console.error(
            `Sync failed for record ${record.id}:`,
            errBody.message || response.status,
          );
          failures.push(record.id);
          continue; // don't let one bad record block the rest of the queue
        }

        await this.markAttendanceSynced(record.id);
        synced += 1;
      } catch (err) {
        console.error(`Network error syncing record ${record.id}:`, err);
        failures.push(record.id);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Attendance sync failed for ${failures.length} record(s)`);
    }

    return { synced, pending: pending.length - synced };
  },
};

window.SyncRollDB = SyncRollDB;
window.API_BASE = API_BASE;

// indexedDB.deleteDatabase("syncroll_offline_db") -> for clearing indexDB write in developers toolkit console