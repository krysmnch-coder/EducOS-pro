document.addEventListener('DOMContentLoaded', () => {
    // Vérifier que ChatLogic est disponible
    if (typeof ChatLogic === 'undefined') {
        console.error('❌ ChatLogic non trouvé !');
        alert('Erreur: ChatLogic non chargé. Rafraîchissez la page.');
        return;
    }
    console.log('✅ ChatLogic chargé avec succès');
    
    const socket = io();
    // ... suite du code
});