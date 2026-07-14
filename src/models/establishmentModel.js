const db = require('./db');

const establishmentModel = {
  /**
   * Récupère tous les établissements pour les afficher dans un menu déroulant.
   * @returns {Promise<Array>} Une liste de tous les établissements.
   */
  getAll: async () => {
    // Utilisation du query builder Knex standard
    return db('establishments').select('id', 'name').orderBy('name', 'asc');
  },

  /**
   * Crée un nouvel établissement.
   * @param {string} name - Le nom de l'établissement.
   * @param {string} subdomain - Le sous-domaine unique pour l'établissement.
   * @returns {Promise<object>} L'objet avec l'ID du nouvel établissement.
   */
  create: async (name, subdomain) => {
    // Utilisation du query builder Knex standard
    return db('establishments').insert({ name, subdomain }).returning('id');
  },

  /**
   * Trouve un établissement par son nom ou son sous-domaine pour la validation.
   * @param {string} name - Le nom de l'établissement.
   * @param {string} subdomain - Le sous-domaine.
   * @returns {Promise<object|null>} L'établissement trouvé ou undefined.
   */
  findByNameOrSubdomain: async (name, subdomain) => {
    // Utilisation du query builder Knex standard
    return db('establishments').where({ name }).orWhere({ subdomain }).first();
  },

  /**
   * Récupère un établissement par son ID.
   * @param {number} id - L'ID de l'établissement.
   * @returns {Promise<object|undefined>} L'établissement trouvé.
   */
  getById: async (id) => {
    return db('establishments').where({ id }).first();
  },

  /**
   * Met à jour un établissement.
   * @param {number} id - L'ID de l'établissement à mettre à jour.
   * @param {object} data - Les nouvelles données (name, subdomain).
   */
  update: async (id, { name, subdomain }) => {
    return db('establishments').where({ id }).update({ name, subdomain });
  },

  /**
   * Supprime un établissement par son ID.
   */
  delete: async (id) => {
    return db('establishments').where({ id }).del();
  }
};

module.exports = establishmentModel;