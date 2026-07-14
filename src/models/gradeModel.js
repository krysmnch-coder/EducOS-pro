const db = require('./db');

const getGradesForUser = (user) => {
  const query = db('grades as g')
    .select('g.*', 'u.name as student_name')
    .join('users as u', 'g.student_id', 'u.id');
  
    if (user.role === 'eleve') {
      query.where('g.student_id', user.id);
    } else if (user.role === 'parent') {
      const children = JSON.parse(user.children || '[]');
      const matricules = children.map(c => c.matricule).filter(Boolean);
      if (matricules.length === 0) {
        return Promise.resolve([]); // Return empty array if parent has no children listed
      }
      query.whereIn('u.matricule', matricules);
    } else if (user.role === 'professeur') {
      query.where('g.professor_id', user.id);
    }
  
    return query.orderBy('g.created_at', 'desc');
};

const createGrade = ({ student_id, professor_id, subject, grade, comment }) => {
  return db('grades')
    .insert({
      student_id,
      professor_id,
      subject,
      grade,
      comment
    })
    .returning('id');
};

const getGradeById = (id) => {
  return db('grades').where({ id }).first();
};

const updateGrade = (id, { student_id, subject, grade, comment }) => {
  return db('grades')
    .where({ id })
    .update({
      student_id,
      subject,
      grade,
      comment
    });
};

const deleteGrade = (id) => {
  return db('grades').where({ id }).del();
};

module.exports = {
  getGradesForUser,
  createGrade,
  getGradeById,
  updateGrade,
  deleteGrade
};