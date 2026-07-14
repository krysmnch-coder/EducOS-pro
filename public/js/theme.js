(function() {
    /**
     * --- 1. Application instantanée du thème ---
     * Cette partie s'exécute immédiatement pour éviter le "Flash of Unstyled Content" (FOUC).
     * Elle applique le thème sauvegardé dans le localStorage à l'élément <html>.
     */
    try {
        const storedTheme = localStorage.getItem('theme');
        if (storedTheme) {
            document.documentElement.setAttribute('data-theme', storedTheme); // Pour vos styles personnalisés
            document.documentElement.setAttribute('data-bs-theme', storedTheme); // Pour les composants Bootstrap
        }
    } catch (e) {
        console.error("Erreur lors de l'application du thème initial :", e);
    }

    /**
     * --- 2. Logique du bouton de changement de thème ---
     * Cette partie attend que la page soit complètement chargée pour attacher l'écouteur d'événement.
     */
    document.addEventListener('DOMContentLoaded', () => {
        const themeToggle = document.getElementById('themeToggle');

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const root = document.documentElement;
                // Vérifie le thème actuel sur l'élément <html>, et prend 'light' par défaut s'il n'y en a pas.
                const currentTheme = root.getAttribute('data-theme') || 'light';
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                root.setAttribute('data-theme', newTheme); // Pour vos styles personnalisés
                root.setAttribute('data-bs-theme', newTheme); // Pour les composants Bootstrap

                // Sauvegarde le nouveau thème dans le localStorage pour la persistance.
                try {
                    localStorage.setItem('theme', newTheme);
                } catch (e) {
                    console.error('Impossible de sauvegarder le thème dans le localStorage :', e);
                }
            });
        }
    });
})();