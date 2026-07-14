const db = require('./db');

// NOTE: This model appears to be unused in the current application.
// The main application uses the 'users' table for students.
// This operates on a separate 'students' table which is not in the migrations.

async function createStudentRecord({ first_name, last_name, student_class }) {
  const [idObj] = await db('students').insert({ first_name, last_name, student_class }).returning('id');
  const id = idObj.id || idObj;
  return { id, first_name, last_name, student_class };
}

function getAllStudents() {
  return db('students').orderBy(['last_name', 'first_name']);
}

function getStudentById(id) {
  return db('students').where({ id }).first();
}

function updateStudentRecord(id, { first_name, last_name, student_class }) {
  return db('students').where({ id }).update({ first_name, last_name, student_class });
}

function deleteStudentById(id) {
  return db('students').where({ id }).del();
}

// NOTE: The 'grades' table is also not defined in the current migrations.
async function createGrade({ student_id, subject, grade, comment }) {
  const [idObj] = await db('grades').insert({ student_id, subject, grade, comment }).returning('id');
  const id = idObj.id || idObj;
  return { id, student_id, subject, grade, comment };
}

function getGradeById(id) {
  return db('grades')
    .select('grades.*', 'students.first_name', 'students.last_name')
    .join('students', 'grades.student_id', 'students.id')
    .where('grades.id', id)
    .first();
}

function updateGradeById(id, { student_id, subject, grade, comment }) {
  return db('grades').where({ id }).update({ student_id, subject, grade, comment });
}

function deleteGradeById(id) {
  return db('grades').where({ id }).del();
}

function getGradesForUser(user) {
  // This function seems to get all grades for all students, not for a specific user.
  // The 'user' parameter is not used. I will keep the original logic.
  return db('grades')
    .select('grades.*', 'students.first_name', 'students.last_name')
    .join('students', 'grades.student_id', 'students.id')
    .orderBy('grades.created_at', 'desc');
}

module.exports = {
  createStudentRecord,
  getAllStudents,
  getStudentById,
  updateStudentRecord,
  deleteStudentById,
  createGrade,
  getGradeById,
  updateGradeById,
  deleteGradeById,
  getGradesForUser
};
