/**
 * Fichier centralisant les constantes de l'application, notamment les rôles des utilisateurs.
 * Cela évite les erreurs de frappe et facilite la maintenance.
 */
const ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMINISTRATOR: 'administrateur',
  SCHOOL_LIFE_MANAGER: 'responsable vie scolaire',
  SECRETARY: 'secretaire',
  PROFESSOR: 'professeur',
  PARENT: 'parent',
  STUDENT: 'eleve',
};

module.exports = { ROLES };