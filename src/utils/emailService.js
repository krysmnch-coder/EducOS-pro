const sgMail = require('@sendgrid/mail');

/**
 * Initialise le service d'envoi d'e-mails.
 */
async function initializeEmailService() {
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('Service d\'e-mail (SendGrid) configuré.');
  } else {
    console.warn('SENDGRID_API_KEY non configurée. L\'envoi d\'e-mails sera simulé dans la console.');
  }
}

/**
 * Envoie un e-mail de réinitialisation de mot de passe.
 * @param {string} to - L'adresse e-mail du destinataire.
 * @param {string} token - Le jeton de réinitialisation.
 */
const sendPasswordResetEmail = async (to, token) => {
  // Si la clé API n'est pas configurée, on simule l'envoi dans la console au lieu de planter.
  if (!process.env.SENDGRID_API_KEY) {
    console.error('ERREUR: SENDGRID_API_KEY est manquante. Impossible d\'envoyer l\'e-mail.');
    console.log('--- EMAIL SIMULÉ ---');
    console.log(`À: ${to}`);
    console.log(`Sujet: Réinitialisation de votre mot de passe EducOS-pro`);
    const resetUrl = `${process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`}/reset-password/${token}`;
    console.log(`Lien (simulé): ${resetUrl}`);
    console.log('--------------------');
    // Lancer une erreur pour que le contrôleur puisse la gérer et afficher un message à l'utilisateur.
    throw new Error('Service d\'e-mail non configuré.');
  }

  // Utilise la variable d'environnement BASE_URL, avec un fallback pour le développement local.
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
  const resetUrl = `${baseUrl}/reset-password/${token}`;

  const msg = {
    to: to,
    from: process.env.EMAIL_FROM, // IMPORTANT: Doit être une adresse vérifiée sur SendGrid
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

  try {
    await sgMail.send(msg);
    console.log(`E-mail de réinitialisation envoyé à ${to} via SendGrid.`);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'e-mail via SendGrid:', error);
    if (error.response) {
      console.error(error.response.body);
    }
    // Lancer une erreur pour que le contrôleur puisse la gérer
    throw new Error('Impossible d\'envoyer l\'e-mail de réinitialisation.');
  }
};

module.exports = {
  initializeEmailService,
  sendPasswordResetEmail,
};