const db = require('./db');

function createGradesTable() {
  return new Promise((resolve, reject) => {
    const sql = `
      CREATE TABLE IF NOT EXISTS grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        professor_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        grade REAL NOT NULL,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (professor_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
    db.run(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function getGradesForUser(user) {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT g.*, u.first_name, u.last_name
      FROM grades g
      JOIN users u ON g.student_id = u.id
    `;
    const params = [];

    if (user.role === 'eleve') {
      query += ' WHERE g.student_id = ?';
      params.push(user.id);
    } else if (user.role === 'parent') {
      const children = JSON.parse(user.children || '[]');
      const matricules = children.map(c => c.matricule).filter(Boolean);
      if (matricules.length === 0) {
        return resolve([]);
      }
      const placeholders = matricules.map(() => '?').join(',');
      query += ` WHERE u.matricule IN (${placeholders})`;
      params.push(...matricules);
    } else if (user.role === 'professeur') {
      query += ' WHERE g.professor_id = ?';
      params.push(user.id);
    }

    query += ' ORDER BY g.created_at DESC';

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createGrade({ student_id, professor_id, subject, grade, comment }) {
    return new Promise((resolve, reject) => {
        const sql = `INSERT INTO grades (student_id, professor_id, subject, grade, comment) VALUES (?, ?, ?, ?, ?)`;
        db.run(sql, [student_id, professor_id, subject, grade, comment], function(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID });
        });
    });
}

function getGradeById(id) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM grades WHERE id = ?`;
        db.get(sql, [id], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function updateGrade(id, { student_id, subject, grade, comment }) {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE grades SET student_id = ?, subject = ?, grade = ?, comment = ? WHERE id = ?`;
        db.run(sql, [student_id, subject, grade, comment, id], function(err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    });
}

function deleteGrade(id) {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM grades WHERE id = ?`;
        db.run(sql, [id], function(err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    });
}

module.exports = {
  createGradesTable,
  getGradesForUser,
  createGrade,
  getGradeById,
  updateGrade,
  deleteGrade
};