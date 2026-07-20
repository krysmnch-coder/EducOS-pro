const db = require('./db');
const { ROLES } = require('../../constants');

function getUserByEmail(email) {
  return db('users').where({ email }).first();
}

function getUserById(id) {
  return db('users').where({ id }).first();
}

/**
 * Récupère un utilisateur par son matricule.
 */
function getUserByMatricule(matricule) {
  return db('users').where({ matricule }).first();
}

function createUser({ name, email, password, role, establishment_id, approved = 0, subject = null, student_class = null, matricule = null, children, avatar_url = null, phone_number = null, date_of_birth = null, place_of_birth = null, address = null, parent_info, created_by = null, password_reset_required = false }, trx = db) {
  // Les propriétés 'children' et 'parent_info' sont maintenant obsolètes et gérées par la table 'parent_student_links'.
  // Elles sont conservées dans la signature pour la compatibilité mais ne sont pas insérées.
  return trx('users').insert({
    name, email, password, role, establishment_id, approved, subject, student_class, matricule, avatar_url, phone_number, date_of_birth, place_of_birth, address, created_by, password_reset_required
  }).returning('id');
}

function getAllUsers() {
  return db('users')
    .select('id', 'name', 'email', 'role', 'approved', 'created_at', 'avatar_url', 'phone_number', 'establishment_id')
    .whereNot('role', ROLES.SUPER_ADMIN) // On n'affiche jamais le super-admin dans les listes d'utilisateurs
    .orderBy('created_at', 'desc');
}

/**
 * Récupère tous les utilisateurs avec le rôle 'administrateur'.
 */
function getAllAdministrators() {
  // On fait une jointure pour récupérer le nom de l'établissement en même temps.
  return db('users as u')
    .leftJoin('establishments as e', 'u.establishment_id', 'e.id')
    .select(
      'u.id',
      'u.name',
      'u.email',
      'u.role',
      'u.approved',
      'u.created_at',
      'u.avatar_url',
      'e.name as establishment_name' // On récupère le nom de l'établissement
    )
    .where('u.role', ROLES.ADMINISTRATOR)
    .orderBy('u.created_at', 'desc');
}

/**
 * Récupère tous les utilisateurs avec le rôle 'eleve'.
 */
function getAllStudents() {
  return db('users as u')
    .select('u.*', 'creator.name as creator_name')
    .leftJoin('users as creator', 'u.created_by', 'creator.id')
    .where('u.role', 'eleve')
    .orderBy(['u.student_class', 'u.name']);
}

/**
 * Récupère tous les parents approuvés avec les informations de leurs enfants.
 */
function getApprovedParents() {
  return db('users')
    .select('id', 'name')
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
  // Réutilise la fonction plus générique
  return countUsersByRole('administrateur');
}

function updateRoleForUser(id, role) {
  return db('users').where({ id }).update({ role });
}

function deleteUserById(id) {
  return db('users').where({ id }).del();
}

function updateUserAvatar(userId, avatarUrl) {
  return db('users').where({ id: userId }).update({ avatar_url: avatarUrl });
}

function updateUserInfo(userId, { name, phone_number }) {
  return db('users').where({ id: userId }).update({ name, phone_number });
}

/**
 * Met à jour le mot de passe d'un utilisateur et désactive le flag de réinitialisation forcée.
 * @param {number} userId - L'ID de l'utilisateur.
 * @param {string} newPassword - Le nouveau mot de passe hashé.
 */
function updateUserPassword(userId, newPassword) {
  return db('users')
    .where({ id: userId })
    .update({
      password: newPassword,
      password_reset_required: false,
    });
}

/**
 * Compte le nombre total d'utilisateurs dans le système.
 */
async function countAllUsers() {
  const result = await db('users').count({ count: '*' }).first();
  // result est un objet comme { count: '5' } ou { count: 0 }.
  const count = result ? (result.count || 0) : 0;
  return parseInt(count, 10);
}

function updateStudentDetails(id, { name, matricule, student_class, date_of_birth, place_of_birth, address }, trx = db) {
    return trx('users').where({ id }).update({
        name,
        matricule,
        student_class,
        date_of_birth,
        place_of_birth,
        address,
        // Mettre à jour l'email si le matricule change, pour la cohérence
        email: `${matricule.toLowerCase().replace(/\s+/g, '')}@educos.local`
    });
}

/**
 * Récupère un utilisateur par son e-mail et l'ID de son établissement.
 * @param {string} email - L'adresse e-mail de l'utilisateur.
 * @param {number|null} establishmentId - L'ID de l'établissement, ou null pour le super-admin.
 */
function getUserByEmailAndEstablishment(email, establishmentId) {
  const query = db('users').where({ email });
  if (establishmentId === null) {
    query.whereNull('establishment_id');
  } else {
    query.where({ establishment_id: establishmentId });
  }
  return query.first();
}

/**
 * Récupère tous les utilisateurs d'un établissement spécifique.
 * @param {number} establishmentId - L'ID de l'établissement.
 * @returns {Promise<Array>}
 */
function getUsersByEstablishmentId(establishmentId) {
  return db('users')
    .select('id', 'name', 'email', 'role', 'approved', 'created_at', 'avatar_url', 'phone_number')
    .where({ establishment_id: establishmentId })
    .orderBy('created_at', 'desc');
}

/**
 * Compte le nombre total d'utilisateurs dans un établissement spécifique.
 * @param {number} establishmentId - L'ID de l'établissement.
 * @returns {Promise<number>}
 */
async function countUsersInEstablishment(establishmentId) {
  if (!establishmentId) return 0;
  const result = await db('users').where({ establishment_id: establishmentId }).count({ count: '*' }).first();
  const count = result ? (result.count || 0) : 0;
  return parseInt(count, 10);
}

/**
 * Compte les utilisateurs approuvés pour une liste d'établissements.
 * @param {Array<number>} establishmentIds - Un tableau d'IDs d'établissements.
 * @returns {Promise<Object>} Un objet mappant establishment_id -> count.
 */
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

/**
 * Récupère tous les élèves réels ainsi que les dossiers à compléter
 * à partir de la table de liaison parent-élève.
 * @returns {Promise<Array>} Une liste combinée d'élèves et de dossiers à compléter.
 */
async function getStudentsAndPlaceholders() {
  // 1. Récupérer tous les élèves ayant un compte complet.
  const realStudents = await db('users')
    .where('role', ROLES.STUDENT)
    .select('*', db.raw('0 as is_placeholder'));

  const realStudentMatricules = realStudents.map(s => s.matricule).filter(Boolean);

  // 2. Récupérer les dossiers à compléter (liens) pour les matricules qui N'ONT PAS de compte complet.
  const placeholderLinks = await db('parent_student_links as psl')
    .join('users as p', 'psl.parent_id', 'p.id') // Jointure pour obtenir le nom du parent
    .whereNotIn('psl.student_matricule', realStudentMatricules)
    .distinct('psl.student_matricule') // Éviter les doublons si plusieurs parents inscrivent le même enfant
    .select(
      'psl.student_first_name',
      'psl.student_last_name',
      'psl.student_matricule',
      'psl.student_class',
      'psl.parent_id',
      'p.name as parent_name'
    );

  // 3. Transformer les données des dossiers à compléter pour qu'elles correspondent à la structure attendue.
  const placeholderStudents = placeholderLinks.map(p => ({
    id: `placeholder_${p.student_matricule}`,
    name: `${p.student_first_name} ${p.student_last_name}`,
    matricule: p.student_matricule,
    student_class: p.student_class,
    is_placeholder: 1,
    parent_id: p.parent_id,
    parent_name: p.parent_name,
    avatar_url: '/img/user.png'
    // Ajoutez d'autres champs avec des valeurs par défaut si nécessaire pour la vue
  }));

  // 4. Combiner les deux listes et retourner le résultat.
  return [...realStudents, ...placeholderStudents];
}

/**
 * Récupère les IDs des parents liés à un élève via son matricule.
 * @param {string} studentMatricule - Le matricule de l'élève.
 * @returns {Promise<Array<number>>} Un tableau d'IDs de parents.
 */
async function getLinkedParentIdsForStudent(studentMatricule) {
    if (!studentMatricule) {
        return [];
    }
    const parentIds = await db('parent_student_links')
        .where('student_matricule', studentMatricule)
        .pluck('parent_id');
    return parentIds;
}

/**
 * Récupère les enfants (utilisateurs existants) liés à un parent.
 * @param {number} parentId - L'ID du parent.
 */
function getLinkedChildrenForParent(parentId) {
    const studentMatriculesQuery = db('parent_student_links')
        .where('parent_id', parentId)
        .select('student_matricule');
    
    return db('users')
        .where('role', ROLES.STUDENT)
        .whereIn('matricule', studentMatriculesQuery);
}

/**
 * Crée un lien "placeholder" pour un enfant initié par un parent.
 * @param {object} data - Les données de l'enfant.
 */
function initiateChildRegistration(data) {
    // Vérifie si une demande pour ce matricule existe déjà pour éviter les doublons
    return db('parent_student_links')
        .where('student_matricule', data.student_matricule)
        .first()
        .then(existing => {
            if (existing) {
                // On pourrait choisir de lever une erreur ou simplement de ne rien faire.
                // Lever une erreur est plus informatif.
                throw new Error('Une demande pour ce matricule existe déjà.');
            }
            return db('parent_student_links').insert(data);
        });
}

/**
 * Récupère les administrateurs d'un établissement spécifique.
 * @param {number} establishmentId - L'ID de l'établissement.
 */
function getAdminsByEstablishment(establishmentId) {
  return db('users').where({ role: ROLES.ADMINISTRATOR, establishment_id: establishmentId });
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
  getAdminsByEstablishment
};
