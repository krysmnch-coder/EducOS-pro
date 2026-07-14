const getAllUsersApi = (req, res) => {
  res.json({ message: 'Placeholder: API pour lister tous les utilisateurs.' });
};

const getDashboardStatsApi = (req, res) => {
  res.json({
    studentCount: 0,
    professorCount: 0,
    totalMessageCount: 0,
    pendingCount: 0
  });
};

module.exports = {
  getAllUsersApi,
  getDashboardStatsApi
};