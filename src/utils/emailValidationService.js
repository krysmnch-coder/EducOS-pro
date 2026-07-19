const axios = require('axios');

const API_KEY = process.env.MAILBOXLAYER_API_KEY;

/**
 * Valide une adresse e-mail en utilisant l'API Mailboxlayer.
 * @param {string} email L'adresse e-mail à valider.
 * @returns {Promise<{isValid: boolean, reason: string|null}>} Un objet indiquant si l'e-mail est valide et la raison en cas d'invalidité.
 */
async function validateEmail(email) {
  if (!API_KEY) {
    console.warn('MAILBOXLAYER_API_KEY non configurée. La validation d\'e-mail est désactivée.');
    // En l'absence de clé, on considère l'e-mail comme valide pour ne pas bloquer le développement.
    return { isValid: true, reason: null };
  }

  try {
    const response = await axios.get('http://apilayer.net/api/check', {
      params: {
        access_key: API_KEY,
        email: email,
        smtp: 1, // Activer la vérification SMTP (la plus importante)
        format: 1
      }
    });

    const data = response.data;

    // Mailboxlayer peut renvoyer une erreur dans sa réponse JSON (ex: clé invalide)
    if (data.success === false) {
        console.error('Erreur de l\'API Mailboxlayer:', data.error.info);
        // En cas d'erreur API, on ne bloque pas l'utilisateur par précaution
        return { isValid: true, reason: 'api_error' };
    }

    // Vérifier les indicateurs clés pour refuser un e-mail
    if (!data.format_valid) return { isValid: false, reason: 'Le format de l\'e-mail est invalide.' };
    if (data.disposable) return { isValid: false, reason: 'Les adresses e-mail jetables ne sont pas autorisées.' };
    if (!data.smtp_check) return { isValid: false, reason: 'Cette adresse e-mail ne semble pas exister.' };

    // Si toutes les vérifications passent
    return { isValid: true, reason: null };

  } catch (error) {
    console.error('Erreur lors de la communication avec Mailboxlayer:', error.message);
    // En cas d'échec de la requête, on ne bloque pas l'utilisateur par précaution.
    return { isValid: true, reason: 'request_failed' };
  }
}

module.exports = { validateEmail };