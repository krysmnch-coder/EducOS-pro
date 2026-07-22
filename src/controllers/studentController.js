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
    const { name, phone_number } = req.body;
    const establishmentId = req.user.establishment_id;

    if (!name || !phone_number) {
        return res.status(400).json({ success: false, message: 'Le nom et le numéro de téléphone sont requis.' });
    }

    try {
        // Création d'un email factice et unique pour permettre la connexion,
        // puisque le formulaire ne demande que le numéro de téléphone.
        const email = `${phone_number.replace(/\s+/g, '')}@educos.parent.local`;

        const existingUser = await userModel.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Un utilisateur avec un identifiant similaire (basé sur le numéro de téléphone) existe déjà.' });
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const [newUserIdObj] = await userModel.createUser({
            name, email, password: hashedPassword,
            role: ROLES.PARENT, approved: 1, // Approuvé automatiquement
            establishment_id: establishmentId,
            phone_number: phone_number, // Enregistre le vrai numéro de téléphone
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
const renderCompleteStudentForm = async (req, res) => {
    // On ne récupère que le nom et le matricule depuis l'URL.
    const { name, matricule } = req.query;

    try {
        // On récupère les informations de liaison directement depuis la base de données
        // pour garantir que les données (classe, nom du parent, téléphone) sont correctes.
        const linkDetails = await db('parent_student_links as psl')
            .join('users as p', 'psl.parent_id', 'p.id')
            .where('psl.student_matricule', matricule)
            .select(
                'psl.student_class',
                'psl.parent_id',
                'p.name as parent_name',
                'p.phone_number as parent_phone_number'
            )
            .orderBy('psl.created_at', 'asc')
            .first();

        if (!linkDetails) {
            req.flash('error_msg', "Dossier de liaison introuvable pour cet élève.");
            return res.redirect('/students');
        }

        // Créer un objet "student" partiel pour pré-remplir le formulaire
        const student = { 
            name, matricule, 
            student_class: linkDetails.student_class, 
            parent_id: linkDetails.parent_id, 
            parent_name: linkDetails.parent_name, 
            parent_phone_number: linkDetails.parent_phone_number, 
            parent_profession: null 
        };

        res.render('studentForm', {
            title: `Compléter le dossier de ${name}`,
            student: student,
            isCompletion: true // Indique au formulaire qu'il s'agit d'une complétion
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
    const { name, matricule, parent_id, student_class, date_of_birth, place_of_birth, address, parent_phone_number } = req.body;
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

        // Utilisation d'une transaction pour garantir que la mise à jour du parent et la création de l'élève sont atomiques.
        await db.transaction(async trx => {
            // 1. Mettre à jour le numéro de téléphone du parent.
            if (parent_id) {
                const parentUpdateData = { phone_number: parent_phone_number };
                await trx('users').where({ id: parent_id }).update(parentUpdateData);
            }

            // 2. On crée l'utilisateur élève.
            await userModel.createUser({
                name, email, password: hashedPassword,
                role: ROLES.STUDENT, approved: 1,
                establishment_id: req.user.establishment_id, password_reset_required: true,
                matricule, student_class, date_of_birth, place_of_birth, address,
                created_by: creatorId,
                avatar_url: '/img/user.png'
            }, trx);
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
        const parents = await userModel.getApprovedParents(); // Tous les parents pour le dropdown

        // Récupérer les informations complètes des parents déjà liés pour les afficher.
        const selectColumns = ['u.id', 'u.name', 'u.phone_number'];

        const linkedParents = await db('parent_student_links as psl')
            .join('users as u', 'psl.parent_id', 'u.id')
            .where('psl.student_matricule', student.matricule)
            .select(selectColumns);

        // Extraire les IDs pour pré-sélectionner les options dans le dropdown.
        const linkedParentIds = linkedParents.map(p => p.id);

        res.render('studentForm', {
            title: `Modifier le dossier de ${student.name}`,
            student: student,
            isCompletion: false,
            parents: parents,
            linkedParentIds: linkedParentIds,
            linkedParents: linkedParents // On passe aussi les objets parents complets à la vue.
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
 * Placeholder pour l'ancienne route d'ajout d'enfant (GET).
 * Redirige vers le tableau de bord pour éviter un crash de l'application,
 * car la route est probablement toujours définie dans studentRoutes.js.
 * C'est une mesure de sécurité pour assurer la stabilité du démarrage.
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
  createParentFromStudentForm,
  renderAddChildForm,
  postAddChild,
};