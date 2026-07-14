const renderProfile = (req, res) => {
  res.render('profile', {
    title: 'Mon Profil | EducOS-pro'
  });
};

module.exports = {
  renderProfile
};