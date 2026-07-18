// Fichier : src/controllers/authController.js (APRÈS la migration)

const db = require('../models/db'); // NOUVELLE instance Knex partagée
const bcrypt = require('bcrypt');
const { ROLES } = require('../../constants'); // Bonne pratique : utiliser des constantes pour les rôles

/**
 * Gère l'inscription d'un nouvel utilisateur en utilisant Knex et async/await.
 * Ce code est portable entre SQLite et PostgreSQL.
 */
exports.registerUser = async (req, res) => {
  // On récupère l'ID de l'établissement pour une architecture multi-tenant
  const { name, email, password, establishment_id } = req.body;

  try {
    // Étape 1 : Vérifier si l'utilisateur existe déjà.
    // .first() récupère le premier résultat ou undefined, c'est très pratique.
    const existingUser = await db('users').where({ email: email }).first();

    if (existingUser) {
      req.flash('error_msg', 'Cet email est déjà utilisé.');
      return res.redirect('/register');
    }

    // Étape 2 : Hasher le mot de passe. await simplifie la gestion de l'asynchronisme.
    const hashedPassword = await bcrypt.hash(password, 10);

    // Étape 3 : Insérer le nouvel utilisateur.
    // Knex gère la protection contre les injections SQL.
    await db('users').insert({
      name: name,
      email: email,
      password: hashedPassword,
      role: ROLES.PROFESSOR, // Utilisation de la constante depuis `constants.js`
      approved: false,      // Knex gère les booléens correctement
      establishment_id: establishment_id // Crucial pour séparer les données par établissement
    });

    req.flash('success_msg', 'Inscription réussie ! Votre compte est en attente d\'approbation.');
    res.redirect('/login');

  } catch (error) {
    console.error("Erreur lors de l'inscription :", error);
    req.flash('error_msg', 'Une erreur est survenue lors de l\'inscription.');
    res.redirect('/register');
  }
};