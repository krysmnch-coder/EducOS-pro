const express = require('express');
const router = express.Router();
const { ensureAuthenticated, ensureRole } = require('../../authMiddleware');
const studentController = require('../controllers/studentController');
const { ROLES } = require('../../constants');

// Route pour afficher la liste de tous les élèves
router.get('/', ensureAuthenticated, studentController.listStudents);

// Route pour afficher le formulaire d'ajout, réservée à certains rôles
router.get('/new', ensureAuthenticated, ensureRole([ROLES.SECRETARY, ROLES.SCHOOL_LIFE_MANAGER]), studentController.renderNewStudentForm);

// Route pour afficher le formulaire de complétion d'un dossier élève
router.get('/complete/form', ensureAuthenticated, ensureRole([ROLES.ADMINISTRATOR, ROLES.SECRETARY, ROLES.SCHOOL_LIFE_MANAGER]), studentController.renderCompleteStudentForm);

// Route pour traiter l'ajout d'un nouvel élève
router.post('/new', ensureAuthenticated, ensureRole([ROLES.SECRETARY, ROLES.SCHOOL_LIFE_MANAGER]), studentController.createStudent);

// Route pour traiter la complétion d'un dossier élève
router.post('/complete', ensureAuthenticated, ensureRole([ROLES.ADMINISTRATOR, ROLES.SECRETARY, ROLES.SCHOOL_LIFE_MANAGER]), studentController.completeStudentRegistration);

// Route pour afficher le formulaire de modification d'un élève
router.get('/:id/edit', ensureAuthenticated, ensureRole([ROLES.ADMINISTRATOR, ROLES.SECRETARY, ROLES.SCHOOL_LIFE_MANAGER]), studentController.renderEditStudentForm);

// Route pour traiter la modification d'un élève
router.post('/:id/edit', ensureAuthenticated, ensureRole([ROLES.ADMINISTRATOR, ROLES.SECRETARY, ROLES.SCHOOL_LIFE_MANAGER]), studentController.updateStudent);

module.exports = router;