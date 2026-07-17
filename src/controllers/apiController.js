const userModel = require('../models/userModel');
const db = require('../models/db');

const getAllUsersApi = (req, res) => {
  res.json({ message: 'Placeholder: API pour lister tous les utilisateurs.' });
};

const getDashboardStatsApi = async (req, res) => {
  try {
    const totalUserCountResult = await db('users').where('status', 'active').count('id as count').first();
    const professorCount = await userModel.countUsersByRole('professeur');
    const establishmentCountResult = await db('establishments').count('id as count').first();
    const pendingCount = await userModel.countPendingUsers();

    res.json({
      totalUserCount: totalUserCountResult ? totalUserCountResult.count : 0,
      professorCount,
      establishmentCount: establishmentCountResult ? establishmentCountResult.count : 0,
      pendingCount
    });
  } catch (error) {
    console.error('Erreur API getDashboardStatsApi:', error);
    res.status(500).json({ error: 'Impossible de récupérer les statistiques.' });
  }
};

module.exports = {
  getAllUsersApi,
  getDashboardStatsApi
};