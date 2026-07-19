const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Envoie un e-mail de réinitialisation de mot de passe.
 * @param {string} to - L'adresse e-mail du destinataire.
 * @param {string} token - Le jeton de réinitialisation.
 */
const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `http://localhost:5000/reset-password/${token}`; // Adaptez l'URL de base à votre environnement

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: 'Réinitialisation de votre mot de passe EducOS-pro',
    html: `
      <p>Bonjour,</p>
      <p>Vous avez demandé une réinitialisation de votre mot de passe. Veuillez cliquer sur le lien ci-dessous pour continuer :</p>
      <p><a href="${resetUrl}" style="padding: 10px 15px; background-color: #0d6efd; color: white; text-decoration: none; border-radius: 5px;">Réinitialiser mon mot de passe</a></p>
      <p>Si vous n'êtes pas à l'origine de cette demande, veuillez ignorer cet e-mail.</p>
      <p>Ce lien expirera dans une heure.</p>
      <br>
      <p>L'équipe EducOS-pro</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendPasswordResetEmail,
};