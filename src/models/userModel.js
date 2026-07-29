const db = require('./db');
const { ROLES } = require('../../constants');

function getUserByEmail(email) {
  return db('users').where({ email }).first();
}

function getUserById(id) {
  return db('users').where({ id }).first();
}

function getUserByMatricule(matricule) {
  return db('users').where({ matricule }).first();
}

async function createUser({ name, email, password, role, establishment_id, approved = 0, subject = null, student_class = null, matricule = null, children, avatar_url = null, phone_number = null, date_of_birth = null, place_of_birth = null, address = null, parent_info, manual_parents = null, created_by = null, password_reset_required = false }, trx = db) {
  const userData = {
    name, email, password, role, establishment_id, approved, subject, student_class, matricule, avatar_url, phone_number, date_of_birth, place_of_birth, address, manual_parents, created_by, password_reset_required
  };

  // Utiliser insert et récupérer l'ID - compatible MySQL
  const [result] = await trx('users').insert(userData);
  // MySQL retourne l'ID directement, Knex le met dans result[0] ou result selon la config
  const insertedId = Array.isArray(result) ? result[0] : result;
  return [{ id: insertedId }];
}

function getAllUsers() {
  return db('users')
    .select('id', 'name', 'email', 'role', 'approved', 'created_at', 'avatar_url', 'phone_number', 'establishment_id')
    .whereNot('role', ROLES.SUPER_ADMIN)
    .orderBy('created_at', 'desc');
}

function getAllAdministrators() {
  return db('users as u')
    .leftJoin('establishments as e', 'u.establishment_id', 'e.id')
    .select(
      'u.id', 'u.name', 'u.email', 'u.role', 'u.approved',
      'u.created_at', 'u.avatar_url', 'e.name as establishment_name'
    )
    .where('u.role', ROLES.ADMINISTRATOR)
    .orderBy('u.created_at', 'desc');
}

function getAllStudents() {
  return db('users as u')
    .select('u.*', 'creator.name as creator_name')
    .leftJoin('users as creator', 'u.created_by', 'creator.id')
    .where('u.role', 'eleve')
    .orderBy(['u.student_class', 'u.name']);
}

function getApprovedParents() {
  return db('users')
    .select('id', 'name', 'phone_number')
    .where({ role: 'parent', approved: 1 })
    .orderBy('name', 'asc');
}

function getPendingUsers() {
  return db('users')
    .select('id', 'name', 'email', 'role', 'approved', 'created_at', 'avatar_url', 'phone_number')
    .where({ approved: 0 })
    .orderBy('created_at', 'desc');
}

async function countPendingUsers() {
  const result = await db('users').where({ approved: 0 }).count('id as count').first();
  return result ? result.count : 0;
}

async function countUsersByRole(role) {
  const result = await db('users').where({ role, approved: 1 }).count({ count: '*' }).first();
  if (result && result.count) {
    return parseInt(result.count, 10);
  }
  return 0;
}

function getUserCountsByRole() {
  return db('users').select('role').where({ approved: 1 }).count('id as count').groupBy('role');
}

function approveUserById(id) {
  return db('users').where({ id }).update({ approved: 1 });
}

async function countApprovedAdmins() {
  return countUsersByRole('administrateur');
}

function updateRoleForUser(id, role) {
  return db('users').where({ id }).update({ role });
}

function deleteUserById(id) {
  return db('users').where({ id }).del();
}

function updateUserAvatar(userId, avatarUrl) {
  return db('users').where({ id: userId }).update({ 
    avatar_url: avatarUrl || null 
  });
}

function updateUserInfo(userId, { name, phone_number }) {
  return db('users').where({ id: userId }).update({ name, phone_number });
}

function updateUserPassword(userId, newPassword) {
  return db('users')
    .where({ id: userId })
    .update({
      password: newPassword,
      password_reset_required: false,
    });
}

async function countAllUsers() {
  const result = await db('users').count({ count: '*' }).first();
  const count = result ? (result.count || 0) : 0;
  return parseInt(count, 10);
}

/**
 * Met à jour les détails d'un élève.
 * CORRIGÉ - Compatible MySQL, sans returning()
 */
async function updateStudentDetails(id, { name, matricule, student_class, date_of_birth, place_of_birth, address, manual_parents }, trx = db) {
    try {
        console.log('🔄 updateStudentDetails - ID:', id);
        console.log('📝 Données:', { name, matricule, student_class, date_of_birth, place_of_birth, address, manual_parents });
        
        const updateData = {
            name,
            matricule,
            student_class,
            date_of_birth: date_of_birth || null,
            place_of_birth: place_of_birth || null,
            address: address || null,
            manual_parents: manual_parents || null,
            email: `${matricule.toLowerCase().replace(/\s+/g, '')}@educos.local`
        };
        
        // Ne mettre à jour l'email que si le matricule a changé
        const currentStudent = await trx('users').where({ id }).select('matricule').first();
        if (currentStudent && currentStudent.matricule === matricule) {
            delete updateData.email; // Garder l'ancien email si le matricule n'a pas changé
        }
        
        const result = await trx('users').where({ id }).update(updateData);
        
        console.log('✅ updateStudentDetails résultat:', result);
        return result;
    } catch (error) {
        console.error('❌ Erreur updateStudentDetails:', error);
        throw error;
    }
}

function getUserByEmailAndEstablishment(email, establishmentId) {
  const query = db('users').where({ email });
  if (establishmentId === null) {
    query.whereNull('establishment_id');
  } else {
    query.where({ establishment_id: establishmentId });
  }
  return query.first();
}

function getUsersByEstablishmentId(establishmentId) {
  return db('users')
    .select('id', 'name', 'email', 'role', 'approved', 'created_at', 'avatar_url', 'phone_number')
    .where({ establishment_id: establishmentId })
    .orderBy('created_at', 'desc');
}

async function countUsersInEstablishment(establishmentId) {
  if (!establishmentId) return 0;
  const result = await db('users').where({ establishment_id: establishmentId }).count({ count: '*' }).first();
  const count = result ? (result.count || 0) : 0;
  return parseInt(count, 10);
}

async function countApprovedUsersInEstablishments(establishmentIds) {
  if (!establishmentIds || establishmentIds.length === 0) {
    return {};
  }
  const counts = await db('users')
    .select('establishment_id')
    .count('id as count')
    .whereIn('establishment_id', establishmentIds)
    .andWhere('approved', 1)
    .groupBy('establishment_id');
  
  return counts.reduce((acc, row) => ({ ...acc, [row.establishment_id]: row.count }), {});
}

async function getStudentsAndPlaceholders() {
  const realStudents = await db('users')
    .where('role', ROLES.STUDENT)
    .select(
      'id', 'name', 'email', 'matricule', 'student_class', 'date_of_birth',
      'place_of_birth', 'address', 'avatar_url', 'created_at', 'manual_parents',
      db.raw('0 as is_placeholder')
    );

  const realStudentMatricules = new Set(realStudents.map(s => s.matricule).filter(Boolean));

  const allParentLinks = await db('parent_student_links as psl')
    .join('users as p', 'psl.parent_id', 'p.id')
    .select(
      'psl.student_matricule',
      'psl.student_first_name',
      'psl.student_last_name',
      'psl.student_class',
      'psl.parent_id',
      'p.name as parent_name',
      'p.phone_number as parent_phone_number'
    );

  const parentsByMatricule = allParentLinks.reduce((acc, link) => {
    if (!acc[link.student_matricule]) {
      acc[link.student_matricule] = [];
    }
    acc[link.student_matricule].push({
      id: link.parent_id,
      name: link.parent_name,
      phone_number: link.parent_phone_number
    });
    return acc;
  }, {});

  const studentsWithParents = realStudents.map(student => ({
    ...student,
    linkedParents: parentsByMatricule[student.matricule] || []
  }));

  const placeholderMatricules = new Set(allParentLinks.map(link => link.student_matricule));
  realStudentMatricules.forEach(matricule => placeholderMatricules.delete(matricule));

  const placeholderStudents = [];
  for (const matricule of placeholderMatricules) {
    const firstLinkForMatricule = allParentLinks.find(link => link.student_matricule === matricule);
    if (firstLinkForMatricule) {
      const firstParent = (parentsByMatricule[matricule] || [])[0];
      const name = `${firstLinkForMatricule.student_first_name} ${firstLinkForMatricule.student_last_name}`;
      placeholderStudents.push({
        id: `placeholder_${matricule}`,
        name: name,
        matricule: matricule,
        student_class: firstLinkForMatricule.student_class,
        is_placeholder: 1,
        avatar_url: '/img/user.png',
        linkedParents: parentsByMatricule[matricule] || [],
        parent_id: firstParent ? firstParent.id : null,
        parent_name: firstParent ? firstParent.name : null,
        parent_phone_number: firstParent ? firstParent.phone_number : null
      });
    }
  }

  return [...studentsWithParents, ...placeholderStudents].sort((a, b) => {
    const classA = a.student_class || '';
    const classB = b.student_class || '';
    if (classA < classB) return -1;
    if (classA > classB) return 1;
    const nameA = a.name || '';
    const nameB = b.name || '';
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });
}

async function getLinkedParentIdsForStudent(studentMatricule) {
    if (!studentMatricule) return [];
    const parentIds = await db('parent_student_links')
        .where('student_matricule', studentMatricule)
        .pluck('parent_id');
    return parentIds;
}

function getLinkedChildrenForParent(parentId) {
    const studentMatriculesQuery = db('parent_student_links')
        .where('parent_id', parentId)
        .select('student_matricule');
    
    return db('users')
        .where('role', ROLES.STUDENT)
        .whereIn('matricule', studentMatriculesQuery);
}

async function initiateChildRegistration(data, trx = db) {
    const existing = await trx('parent_student_links')
        .where('student_matricule', data.student_matricule)
        .first();

    if (existing) {
        throw new Error(`Une demande pour le matricule ${data.student_matricule} existe déjà.`);
    }
    
    return trx('parent_student_links').insert(data);
}

function getAdminsByEstablishment(establishmentId) {
  return db('users').where({ role: ROLES.ADMINISTRATOR, establishment_id: establishmentId });
}

async function countAdminsInEstablishment(establishmentId) {
  if (!establishmentId) return 0;
  const result = await db('users')
    .where({ establishment_id: establishmentId, role: ROLES.ADMINISTRATOR })
    .count({ count: '*' })
    .first();
  return result ? parseInt(result.count, 10) : 0;
}

module.exports = {
  getUserByEmail,
  getUserById,
  getUserByMatricule,
  createUser,
  getAllUsers,
  getAllAdministrators,
  getAllStudents,
  getApprovedParents,
  getPendingUsers,
  approveUserById,
  countPendingUsers,
  getUserCountsByRole,
  updateRoleForUser,
  countUsersByRole,
  deleteUserById,
  updateUserAvatar,
  updateUserInfo,
  updateUserPassword,
  countApprovedAdmins,
  updateStudentDetails,
  countAllUsers,
  getUserByEmailAndEstablishment,
  getUsersByEstablishmentId,
  countApprovedUsersInEstablishments,
  countUsersInEstablishment,
  getStudentsAndPlaceholders,
  getLinkedParentIdsForStudent,
  getLinkedChildrenForParent,
  initiateChildRegistration,
  getAdminsByEstablishment,
  countAdminsInEstablishment
};