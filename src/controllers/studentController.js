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

      if (!student.linkedParents) {
        student.linkedParents = [];
      }
    }

    const studentsByClass = allStudents.reduce((acc, student) => {
      const className = student.student_class || 'Non classé';
      if (!acc[className]) {
        acc[className] = [];
      }
      acc[className].push(student);
      return acc;
    }, {});

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

function generateSecurePassword(length = 8) {
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
        const email = `${phone_number.replace(/\s+/g, '')}@educos.parent.local`;

        const existingUser = await userModel.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Un utilisateur avec un identifiant similaire existe déjà.' });
        }

        const defaultPassword = generateSecurePassword(8);
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        const [newUserIdObj] = await userModel.createUser({
            name, email, password: hashedPassword,
            role: ROLES.PARENT, approved: 1,
            establishment_id: establishmentId,
            phone_number: phone_number,
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
            manualParents: []
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire d'ajout d'élève:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

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
            await userModel.createUser({
                name, email, password: hashedPassword,
                role: ROLES.STUDENT, approved: 1,
                establishment_id: req.user.establishment_id, password_reset_required: true,
                matricule, student_class, date_of_birth, place_of_birth, address,
                created_by: req.user.id,
                avatar_url: '/img/user.png',
                manual_parents: JSON.stringify(manualParentsData)
            }, trx);

            if (parent_ids && parent_ids.length > 0) {
                const parentIdsArray = Array.isArray(parent_ids) ? parent_ids : [parent_ids];
                const links = createParentLinkObjects(parentIdsArray, { name, matricule, student_class });
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
            manualParents: []
        });
    } catch (error) {
        console.error("Erreur lors du chargement du formulaire de complétion:", error);
        req.flash('error_msg', "Une erreur est survenue.");
        res.redirect('/students');
    }
};

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
            if (parent_id && parent_phone_number) {
                await trx('users').where({ id: parent_id }).update({ phone_number: parent_phone_number });
            }

            await userModel.createUser({
                name, email, password: hashedPassword,
                role: ROLES.STUDENT, approved: 1,
                establishment_id: req.user.establishment_id, password_reset_required: true,
                matricule, student_class, date_of_birth, place_of_birth, address,
                created_by: creatorId,
                avatar_url: '/img/user.png',
                manual_parents: JSON.stringify(manualParentsData)
            }, trx);
        });

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

        req.flash('success_msg', `Le compte de l'élève ${name} a été créé. Identifiant : ${email}, Mot de passe : ${defaultPassword}.`);
        res.redirect('/students');
    } catch (error) {
        console.error("Erreur lors de la complétion du dossier de l'élève:", error);
        req.flash('error_msg', "Une erreur est survenue lors de la complétion du dossier.");
        res.redirect('/students');
    }
};

const renderEditStudentForm = async (req, res) => {
    try {
        const student = await db('users').where({ id: req.params.id, role: ROLES.STUDENT }).first();

        if (!student) {
            req.flash('error_msg', 'Élève non trouvé.');
            return res.redirect('/students');
        }

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

        const linkedParents = await db('parent_student_links as psl')
            .join('users as u', 'psl.parent_id', 'u.id')
            .where('psl.student_matricule', student.matricule)
            .select('u.id', 'u.name', 'u.phone_number');

        const linkedParentIds = linkedParents.map(p => p.id);

        res.render('studentForm', {
            title: `Modifier le dossier de ${student.name}`,
            student: student,
            isCompletion: false,
            parents: parents,
            linkedParentIds: linkedParentIds,
            linkedParents: linkedParents,
            manualParents: manualParents
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
        name, matricule, student_class, date_of_birth, place_of_birth, 
        address, parent_ids, manual_parents
    } = req.body;

    console.log('🔄 UPDATE STUDENT - ID:', studentId);
    console.log('📝 Body:', { name, matricule, student_class, parent_ids, manual_parents });

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

        console.log('📋 Manual parents parsés:', manualParentsData);

        await db.transaction(async trx => {
            // 1. Mettre à jour les détails de l'élève
            await userModel.updateStudentDetails(studentId, {
                name, matricule, student_class, date_of_birth, place_of_birth, address,
                manual_parents: JSON.stringify(manualParentsData)
            }, trx);

            // 2. Mettre à jour les liens parents
            if (parent_ids !== undefined) {
                // Supprimer les anciens liens
                await trx('parent_student_links').where('student_matricule', student.matricule).del();
                if (matricule !== student.matricule) {
                    await trx('parent_student_links').where('student_matricule', matricule).del();
                }

                // Créer les nouveaux liens
                const parentIdsArray = Array.isArray(parent_ids) ? parent_ids : [parent_ids];
                if (parentIdsArray.length > 0) {
                    const links = createParentLinkObjects(parentIdsArray, { name, matricule, student_class });
                    if (links.length > 0) {
                        await trx('parent_student_links').insert(links);
                    }
                }
            }
        });

        console.log('✅ Mise à jour réussie');
        req.flash('success_msg', `Les informations de l'élève ${name} ont été mises à jour.`);
        res.redirect('/students');

    } catch (error) {
        console.error(`❌ Erreur lors de la mise à jour de l'élève ${studentId}:`, error);
        req.flash('error_msg', "Une erreur est survenue lors de la mise à jour.");
        res.redirect(`/students/${studentId}/edit`);
    }
};

const renderAddChildForm = (req, res) => {
    req.flash('info_msg', "L'ajout d'un enfant se fait désormais uniquement lors de l'inscription du parent.");
    res.redirect('/dashboard');
};

const postAddChild = (req, res) => {
    res.redirect('/dashboard');
};

// ==========================================================================
// EXPORTS - VÉRIFIEZ QUE TOUTES LES FONCTIONS SONT EXPORTÉES
// ==========================================================================
module.exports = {
  listStudents,
  renderNewStudentForm,
  createStudent,
  renderCompleteStudentForm,
  completeStudentRegistration,
  renderEditStudentForm,
  updateStudent,
  createParentFromStudentForm,  // ← AJOUTÉ
  renderAddChildForm,
  postAddChild,
};