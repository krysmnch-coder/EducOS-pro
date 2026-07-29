const userModel = require('../models/userModel');
const { ROLES } = require('../../constants');
const bcrypt = require('bcrypt');
const communicationModel = require('../models/communicationModel');
const crypto = require('crypto');
const db = require('../models/db');


/**
 * Affiche la page listant tous les élèves, groupés par classe.
 */
const listStudents = async (req, res) => {
  try {
    const allStudents = await userModel.getStudentsAndPlaceholders();

    // ==========================================================================
    // AJOUT DES PARENTS MANUELS POUR CHAQUE ÉLÈVE
    // ==========================================================================
    for (let student of allStudents) {
      // Récupérer les parents manuels depuis la colonne manual_parents (JSON)
      if (student.manual_parents) {
        try {
          student.manualParents = typeof student.manual_parents === 'string' 
            ? JSON.parse(student.manual_parents) 
            : student.manual_parents;
        } catch (e) {
          console.error(`Erreur parsing manual_parents pour l'élève ${student.id}:`, e);
          student.manualParents = [];
        }
      } else {
        student.manualParents = [];
      }

      // S'assurer que linkedParents existe aussi
      if (!student.linkedParents) {
        student.linkedParents = [];
      }
    }

    // Grouper les élèves par classe
    const studentsByClass = allStudents.reduce((acc, student) => {
      const className = student.student_class || 'Non classé';
      if (!acc[className]) {
        acc[className] = [];
      }
      acc[className].push(student);
      return acc;
    }, {});

    // Logique pour la vue restreinte des parents
    let parentChildrenClasses = [];
    if (req.user.role === ROLES.PARENT) {
        parentChildrenClasses = await db('parent_student_links')
            .where('parent_id', req.user.id)
            .distinct('student_class')
            .pluck('student_class');
    }

    res.render('students', {
      title: 'Liste des Élèves',
      studentsByClass: studentsByClass,
      user: req.user,
      ROLES: ROLES,
      parentChildrenClasses: parentChildrenClasses
    });
  } catch (error) {
    console.error('Erreur lors du chargement de la page des élèves:', error);
    req.flash('error_msg', 'Impossible de charger la liste des élèves.');
    res.redirect('/dashboard');
  }
};

/**
 * Génère un mot de passe aléatoire et sécurisé.
 */
function generateSecurePassword(length = 8) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Affiche le formulaire pour ajouter un nouvel élève.
 */
const renderNewStudentForm = async (req, res) => {
    try {
        const parents = await userModel.getApprovedParents();
        res.render('studentForm', {
            title: 'Ajouter un élève',
            student: null,
            isCompletion: false,
            parents: parents,
            linkedParentIds: [],
            linkedParents: [],
            manualParents: [] // Ajouté pour la vue
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire d'ajout d'élève:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

/**
 * Crée un tableau d'objets de liaison parent-élève pour l'insertion en base de données.
 */
function createParentLinkObjects(parent_ids, studentData) {
    const { name, matricule, student_class } = studentData;
    const parentIdsArray = [].concat(parent_ids || []);
    return parentIdsArray.map(parentId => ({
        parent_id: parentId,
        student_matricule: matricule,
        student_first_name: name.split(' ')[0] || '',
        student_last_name: name.split(' ').slice(1).join(' ') || '',
        student_class: student_class
    }));
}

/**
 * Gère la création d'un nouvel élève et la liaison avec ses parents.
 */
const createStudent = async (req, res) => {
    const { 
        name, matricule, student_class, date_of_birth, place_of_birth, address, 
        parent_ids, manual_parents 
    } = req.body;

    try {
        const existingStudent = await userModel.getUserByMatricule(matricule);
        if (existingStudent) {
            req.flash('error_msg', 'Ce matricule est déjà utilisé pour un autre élève.');
            return res.redirect('/students/new');
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        const email = `${matricule.toLowerCase().replace(/\s+/g, '')}@educos.local`;

        // Parser les parents manuels
        let manualParentsData = [];
        if (manual_parents) {
            try {
                manualParentsData = typeof manual_parents === 'string' 
                    ? JSON.parse(manual_parents) 
                    : manual_parents;
            } catch (e) {
                console.error('Erreur parsing manual_parents:', e);
            }
        }

        await db.transaction(async trx => {
            // 1. Créer l'utilisateur élève avec les parents manuels
            await userModel.createUser({
                name, email, password: hashedPassword,
                role: ROLES.STUDENT, approved: 1,
                establishment_id: req.user.establishment_id, password_reset_required: true,
                matricule, student_class, date_of_birth, place_of_birth, address,
                created_by: req.user.id,
                avatar_url: '/img/user.png',
                manual_parents: JSON.stringify(manualParentsData) // Stocker les parents manuels
            }, trx);

            // 2. Créer les liens avec les parents (comptes existants)
            if (parent_ids && parent_ids.length > 0) {
                const links = createParentLinkObjects(parent_ids, { name, matricule, student_class });
                if (links.length > 0) await trx('parent_student_links').insert(links);
            }
        });

        req.flash('success_msg', `L'élève ${name} a été ajouté. Identifiant : ${email}, Mot de passe : ${defaultPassword}.`);
        res.redirect('/students');

    } catch (error) {
        console.error("Erreur lors de la création de l'élève:", error);
        req.flash('error_msg', "Une erreur est survenue lors de l'ajout de l'élève.");
        res.redirect('/students/new');
    }
};

/**
 * Affiche le formulaire pour compléter un dossier d'élève initié par un parent.
 */
const renderCompleteStudentForm = async (req, res) => {
    const { name, matricule, parent_id, parent_name, parent_phone_number } = req.query;
    let { student_class } = req.query;

    try {
        if (!student_class) {
            const linkDetails = await db('parent_student_links').where({ student_matricule: matricule }).first();
            if (linkDetails && linkDetails.student_class) {
                student_class = linkDetails.student_class;
            }
        }

        const student = { name, matricule, student_class };
        const allParents = await userModel.getApprovedParents();

        const linkedParents = parent_id ? [{ id: parent_id, name: parent_name, phone_number: parent_phone_number }] : [];
        const linkedParentIds = parent_id ? [parent_id] : [];

        res.render('studentForm', {
            title: `Compléter le dossier de ${name}`,
            student: student,
            isCompletion: true,
            parents: allParents,
            linkedParentIds: linkedParentIds,
            linkedParents: linkedParents,
            manualParents: [] // Ajouté pour la vue
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire de complétion:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

/**
 * Finalise la création d'un compte élève et envoie une notification au parent.
 */
const completeStudentRegistration = async (req, res) => {
    const { 
        name, matricule, parent_id, student_class, date_of_birth, place_of_birth, 
        address, parent_phone_number, manual_parents 
    } = req.body;
    const creatorId = req.user.id;

    try {
        const existingStudent = await userModel.getUserByMatricule(matricule);
        if (existingStudent) {
            req.flash('error_msg', 'Ce matricule est déjà utilisé. Impossible de compléter le dossier.');
            return res.redirect('/students');
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        const email = `${matricule.toLowerCase().replace(/\s+/g, '')}@educos.local`;

        // Parser les parents manuels
        let manualParentsData = [];
        if (manual_parents) {
            try {
                manualParentsData = typeof manual_parents === 'string' 
                    ? JSON.parse(manual_parents) 
                    : manual_parents;
            } catch (e) {
                console.error('Erreur parsing manual_parents:', e);
            }
        }

        await db.transaction(async trx => {
            // 1. Mettre à jour le numéro de téléphone du parent si fourni
            if (parent_id && parent_phone_number) {
                await trx('users').where({ id: parent_id }).update({ phone_number: parent_phone_number });
            }

            // 2. Créer l'utilisateur élève avec les parents manuels
            await userModel.createUser({
                name, email, password: hashedPassword,
                role: ROLES.STUDENT, approved: 1,
                establishment_id: req.user.establishment_id, password_reset_required: true,
                matricule, student_class, date_of_birth, place_of_birth, address,
                created_by: creatorId,
                avatar_url: '/img/user.png',
                manual_parents: JSON.stringify(manualParentsData) // Stocker les parents manuels
            }, trx);
        });

        // Notification au parent
        const authIo = req.app.get('authIo');
        if (authIo) {
            authIo.to(`user_${parent_id}`).emit('shortcutHighlight', { shortcutKey: 'documents' });
        }

        const messageBody = `Bonjour,
Le dossier de votre enfant ${name} a été finalisé par l'administration.
Voici ses informations de connexion à la plateforme EducOS-pro :<br />
- <strong>Identifiant :</strong> ${email}<br>
- <strong>Mot de passe :</strong> ${defaultPassword}

Vous pouvez les lui communiquer. Cordialement.`;

        await communicationModel.sendCommunication({
            senderId: creatorId,
            recipientType: 'user',
            recipientId: parent_id,
            subject: `Dossier finalisé et identifiants pour ${name}`,
            message: messageBody
        });

        const successMessage = `Le compte de l'élève ${name} a été créé. Identifiant : ${email}, Mot de passe : ${defaultPassword}.`;
        req.flash('success_msg', successMessage);
        res.redirect('/students');
    } catch (error) {
        console.error("Erreur lors de la complétion du dossier de l'élève:", error);
        req.flash('error_msg', "Une erreur est survenue lors de la complétion du dossier.");
        res.redirect('/students');
    }
};

/**
 * Affiche le formulaire pour modifier un élève existant.
 */
const renderEditStudentForm = async (req, res) => {
    try {
        const student = await db('users').where({ id: req.params.id, role: ROLES.STUDENT }).first();

        if (!student) {
            req.flash('error_msg', 'Élève non trouvé.');
            return res.redirect('/students');
        }

        // Parser les parents manuels
        let manualParents = [];
        if (student.manual_parents) {
            try {
                manualParents = typeof student.manual_parents === 'string' 
                    ? JSON.parse(student.manual_parents) 
                    : student.manual_parents;
            } catch (e) {
                console.error('Erreur parsing manual_parents:', e);
            }
        }

        const parents = await userModel.getApprovedParents();

        const selectColumns = ['u.id', 'u.name', 'u.phone_number'];
        const linkedParents = await db('parent_student_links as psl')
            .join('users as u', 'psl.parent_id', 'u.id')
            .where('psl.student_matricule', student.matricule)
            .select(selectColumns);

        const linkedParentIds = linkedParents.map(p => p.id);

        res.render('studentForm', {
            title: `Modifier le dossier de ${student.name}`,
            student: student,
            isCompletion: false,
            parents: parents,
            linkedParentIds: linkedParentIds,
            linkedParents: linkedParents,
            manualParents: manualParents // Passer les parents manuels à la vue
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire de modification:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

/**
 * Met à jour les informations d'un élève.
 */
const updateStudent = async (req, res) => {
    const studentId = req.params.id;
    const {
        name, matricule, student_class, date_of_birth, place_of_birth, 
        address, parent_ids, manual_parents
    } = req.body;

    try {
        const student = await userModel.getUserById(studentId);
        if (!student) {
            req.flash('error_msg', 'Élève non trouvé.');
            return res.redirect('/students');
        }

        if (matricule !== student.matricule) {
            const existingStudent = await userModel.getUserByMatricule(matricule);
            if (existingStudent) {
                req.flash('error_msg', 'Ce matricule est déjà utilisé pour un autre élève.');
                return res.redirect(`/students/${studentId}/edit`);
            }
        }

        // Parser les parents manuels
        let manualParentsData = [];
        if (manual_parents) {
            try {
                manualParentsData = typeof manual_parents === 'string' 
                    ? JSON.parse(manual_parents) 
                    : manual_parents;
            } catch (e) {
                console.error('Erreur parsing manual_parents:', e);
            }
        }

        await db.transaction(async trx => {
            // 1. Mettre à jour les détails de l'élève AVEC les parents manuels
            await userModel.updateStudentDetails(studentId, {
                name, matricule, student_class, date_of_birth, place_of_birth, address,
                manual_parents: JSON.stringify(manualParentsData) // Mettre à jour les parents manuels
            }, trx);

            // 2. Mettre à jour les liens parents si le champ est présent
            if (parent_ids !== undefined) {
                await trx('parent_student_links').where('student_matricule', student.matricule).del();
                if (matricule !== student.matricule) {
                    await trx('parent_student_links').where('student_matricule', matricule).del();
                }

                const links = createParentLinkObjects(parent_ids, { name, matricule, student_class });
                if (links.length > 0) await trx('parent_student_links').insert(links);
            }
        });

        req.flash('success_msg', `Les informations de l'élève ${name} ont été mises à jour.`);
        res.redirect('/students');

    } catch (error) {
        console.error(`Erreur lors de la mise à jour de l'élève ${studentId}:`, error);
        req.flash('error_msg', "Une erreur est survenue lors de la mise à jour.");
        res.redirect(`/students/${studentId}/edit`);
    }
};

/**
 * Placeholder pour l'ancienne route d'ajout d'enfant (GET).
 */
const renderAddChildForm = (req, res) => {
    req.flash('info_msg', "L'ajout d'un enfant se fait désormais uniquement lors de l'inscription du parent.");
    res.redirect('/dashboard');
};

/**
 * Placeholder pour l'ancienne route d'ajout d'enfant (POST).
 */
const postAddChild = (req, res) => {
    res.redirect('/dashboard');
};

module.exports = {
  listStudents,
  renderNewStudentForm,
  createStudent,
  renderCompleteStudentForm,
  completeStudentRegistration,
  renderEditStudentForm,
  updateStudent,
  renderAddChildForm,
  postAddChild,
};