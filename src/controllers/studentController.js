const userModel = require('../models/userModel');
const { ROLES } = require('../../constants');
const bcrypt = require('bcrypt');
const communicationModel = require('../models/communicationModel');
const crypto = require('crypto');
const db = require('../models/db'); // Importer db pour la logique des parents


/**
 * Affiche la page listant tous les élèves, groupés par classe.
 */
const listStudents = async (req, res) => {
  try {
    // La nouvelle fonction du modèle fait tout le travail lourd de manière optimisée.
    const allStudents = await userModel.getStudentsAndPlaceholders();

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
        // Récupère les classes des enfants directement depuis la nouvelle table
        parentChildrenClasses = await db('parent_student_links')
            .where('parent_id', req.user.id)
            .distinct('student_class')
            .pluck('student_class');
    }

    res.render('students', {
      title: 'Liste des Élèves',
      studentsByClass: studentsByClass,
      user: req.user, // Pour la gestion des droits (RBAC)
      ROLES: ROLES, // Pour vérifier les rôles dans la vue
      parentChildrenClasses: parentChildrenClasses // Passe la liste des classes des enfants à la vue
    });
  } catch (error) {
    console.error('Erreur lors du chargement de la page des élèves:', error);
    req.flash('error_msg', 'Impossible de charger la liste des élèves.');
    res.redirect('/dashboard');
  }
};

/**
 * Génère un mot de passe aléatoire et sécurisé.
 * @param {number} length - La longueur souhaitée du mot de passe.
 * @returns {string} Le mot de passe généré.
 */
function generateSecurePassword(length = 8) {
  // Génère des octets aléatoires et les convertit en une chaîne hexadécimale.
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}
/**
 * Crée un nouveau compte parent depuis le formulaire élève (via une modale).
 * Le compte est automatiquement approuvé.
 */
const createParentFromStudentForm = async (req, res) => {
    const { name, email } = req.body;
    const establishmentId = req.user.establishment_id;

    if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Le nom et l\'email sont requis.' });
    }

    try {
        const existingUser = await userModel.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Cette adresse e-mail est déjà utilisée.' });
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const [newUserIdObj] = await userModel.createUser({
            name, email, password: hashedPassword,
            role: ROLES.PARENT, approved: 1, // Approuvé automatiquement
            establishment_id: establishmentId,
            avatar_url: '/img/user.png'
        });
        
        const newParentId = newUserIdObj.id || newUserIdObj;

        res.status(201).json({ success: true, parent: {
            id: newParentId, name, email, defaultPassword
        }});

    } catch (error) {
        console.error("Erreur lors de la création du parent depuis le formulaire élève:", error);
        res.status(500).json({ success: false, message: 'Une erreur est survenue sur le serveur.' });
    }
};
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
            linkedParentIds: [] // Pas de parents liés pour un nouvel élève
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire d'ajout d'élève:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

/**
 * Gère la création d'un nouvel élève et la liaison avec ses parents.
 */
const createStudent = async (req, res) => {
    const { name, matricule, student_class, date_of_birth, place_of_birth, address, parent_ids } = req.body;

    try {
        const existingStudent = await userModel.getUserByMatricule(matricule);
        if (existingStudent) {
            req.flash('error_msg', 'Ce matricule est déjà utilisé pour un autre élève.');
            return res.redirect('/students/new');
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        const email = `${matricule.toLowerCase().replace(/\s+/g, '')}@educos.local`;

        await db.transaction(async trx => {
            // 1. Créer l'utilisateur élève
            await userModel.createUser({
                name, email, password: hashedPassword,
                role: ROLES.STUDENT, approved: 1,
                establishment_id: req.user.establishment_id, password_reset_required: true,
                matricule, student_class, date_of_birth, place_of_birth, address,
                created_by: req.user.id,
                avatar_url: '/img/user.png'
            }, trx);

            // 2. Créer les liens avec les parents
            if (parent_ids && parent_ids.length > 0) {
                const links = [].concat(parent_ids).map(parentId => ({
                    parent_id: parentId,
                    student_matricule: matricule,
                    student_first_name: name.split(' ')[0] || '',
                    student_last_name: name.split(' ').slice(1).join(' ') || '',
                    student_class: student_class
                }));
                await trx('parent_student_links').insert(links);
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
const renderCompleteStudentForm = (req, res) => {
    const { name, matricule, student_class, parent_id, parent_name } = req.query;

    // Créer un objet "student" partiel pour pré-remplir le formulaire
    const student = { name, matricule, student_class, parent_id, parent_name };

    res.render('studentForm', {
        title: `Compléter le dossier de ${name}`,
        student: student,
        isCompletion: true // Indique au formulaire qu'il s'agit d'une complétion
    });
};

/**
 * Finalise la création d'un compte élève et envoie une notification au parent.
 */
const completeStudentRegistration = async (req, res) => {
    const { name, matricule, parent_id, student_class, date_of_birth, place_of_birth, address } = req.body;
    const creatorId = req.user.id; // L'expéditeur du message est l'utilisateur connecté (l'admin)
    try {
        const existingStudent = await userModel.getUserByMatricule(matricule);
        if (existingStudent) {
            req.flash('error_msg', 'Ce matricule est déjà utilisé. Impossible de compléter le dossier.');
            return res.redirect('/students');
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        const email = `${matricule.toLowerCase().replace(/\s+/g, '')}@educos.local`;

        // On ne touche pas à la table parent_student_links, le lien existe déjà.
        // On crée juste l'utilisateur élève.
        await userModel.createUser({
            name, email, password: hashedPassword,
            role: ROLES.STUDENT, approved: 1,
            establishment_id: req.user.establishment_id, password_reset_required: true,
            matricule, student_class, date_of_birth, place_of_birth, address,
            created_by: creatorId,
            avatar_url: '/img/user.png'
        });

        // --- Animation du raccourci ---
        // On notifie le parent pour faire briller le raccourci "Documents"
        const authIo = req.app.get('authIo');
        if (authIo) {
            authIo.to(`user_${parent_id}`).emit('shortcutHighlight', { shortcutKey: 'documents' });
        }

        // Envoyer un message interne au parent avec les identifiants
        const messageBody = `Bonjour,
Le dossier de votre enfant ${name} a été finalisé par l'administration.
Voici ses informations de connexion à la plateforme EducOS-pro :<br>
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

        const successMessage = `Le compte de l'élève ${name} a été créé. Identifiant : ${email}, Mot de passe : ${defaultPassword}. Ces informations ont aussi été envoyées au parent.`;
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
        const student = await userModel.getUserById(req.params.id);
        if (!student || student.role !== ROLES.STUDENT) {
            req.flash('error_msg', 'Élève non trouvé.');
            return res.redirect('/students');
        }
        const parents = await userModel.getApprovedParents();
        const linkedParentIds = await userModel.getLinkedParentIdsForStudent(student.matricule);

        res.render('studentForm', {
            title: `Modifier le dossier de ${student.name}`,
            student: student,
            isCompletion: false,
            parents: parents,
            linkedParentIds: linkedParentIds
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire de modification:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

const updateStudent = async (req, res) => {
    const studentId = req.params.id;
    const {
        name,
        matricule,
        student_class,
        date_of_birth,
        place_of_birth,
        address,
        parent_ids
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

        await db.transaction(async trx => {
            // 1. Mettre à jour les détails de l'élève
            await userModel.updateStudentDetails(studentId, {
                name, matricule, student_class, date_of_birth, place_of_birth, address
            }, trx);

            // 2. Mettre à jour les liens parents
            // D'abord, supprimer les anciens liens pour cet élève (basé sur l'ancien matricule)
            await trx('parent_student_links').where('student_matricule', student.matricule).del();
            // Si le matricule a changé, on s'assure de nettoyer les liens potentiels sur le nouveau matricule aussi
            if (matricule !== student.matricule) {
                await trx('parent_student_links').where('student_matricule', matricule).del();
            }

            // Créer les nouveaux liens
            if (parent_ids && parent_ids.length > 0) {
                const links = [].concat(parent_ids).map(parentId => ({
                    parent_id: parentId,
                    student_matricule: matricule,
                    student_first_name: name.split(' ')[0] || '',
                    student_last_name: name.split(' ').slice(1).join(' ') || '',
                    student_class: student_class
                }));
                await trx('parent_student_links').insert(links);
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
 * Affiche le formulaire permettant à un parent d'initier l'inscription de son enfant.
 */
const renderAddChildForm = (req, res) => {
    if (req.user.role !== ROLES.PARENT) {
        req.flash('error_msg', 'Action non autorisée.');
        return res.redirect('/dashboard');
    }
    res.render('add-child', {
        title: 'Inscrire un enfant'
    });
};

/**
 * Gère la soumission du formulaire d'inscription d'enfant par un parent.
 * Crée un "placeholder" dans la base de données.
 */
const postAddChild = async (req, res) => {
    if (req.user.role !== ROLES.PARENT) {
        req.flash('error_msg', 'Action non autorisée.');
        return res.redirect('/dashboard');
    }

    const { name, matricule, student_class } = req.body; // 'name' est une chaîne unique ici
    const parent_id = req.user.id;

    try {
        // --- VALIDATION ROBUSTE ---
        const nameParts = name ? name.trim().split(/\s+/) : [];
        const student_first_name = nameParts.shift() || '';
        const student_last_name = nameParts.join(' ');

        if (!student_first_name || !student_last_name) {
            req.flash('error_msg', "Veuillez fournir au moins un prénom et un nom pour l'enfant.");
            return res.redirect('/students/add-child');
        }
        if (!matricule || !student_class) {
            req.flash('error_msg', "Le matricule et la classe de l'enfant sont obligatoires.");
            return res.redirect('/students/add-child');
        }

        // Vérifier si un élève avec ce matricule existe déjà
        const existingStudent = await userModel.getUserByMatricule(matricule);
        if (existingStudent) {
            req.flash('error_msg', 'Un élève avec ce matricule existe déjà dans le système.');
            return res.redirect('/students/add-child');
        }

        // Créer le lien d'inscription en attente
        await userModel.initiateChildRegistration({
            parent_id: parent_id,
            student_matricule: matricule,
            student_first_name: student_first_name,
            student_last_name: student_last_name,
            student_class: student_class
        });

        req.flash('success_msg', `La demande d'inscription pour ${name} a été envoyée à l'administration. Vous serez notifié lorsque le dossier sera finalisé.`);
        res.redirect('/dashboard');

    } catch (error) {
        console.error("Erreur lors de l'initiation de l'inscription par le parent:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students/add-child');
    }
};

module.exports = {
  listStudents,
  renderNewStudentForm,
  createStudent,
  renderCompleteStudentForm,
  completeStudentRegistration,
  renderEditStudentForm,
  updateStudent,
  createParentFromStudentForm,
  renderAddChildForm,
  postAddChild
};