(function() {
    /**
     * Détermine le thème initial à appliquer.
     * Priorité : 1. Thème sauvegardé dans localStorage, 2. Préférence système, 3. Thème clair par défaut.
     * @returns {'light' | 'dark'}
     */
    function getInitialTheme() {
        try {
            const storedTheme = localStorage.getItem('theme');
            if (storedTheme) {
                return storedTheme;
            }
        } catch (e) {
            // Si localStorage n'est pas accessible, on continue sans erreur.
        }
        
        // Vérifie la préférence système de l'utilisateur
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }

        return 'light'; // Thème par défaut si rien n'est trouvé
    }

    /**
     * Applique un thème donné à l'élément <html>.
     * @param {'light' | 'dark'} theme 
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme); // Pour vos styles personnalisés
        document.documentElement.setAttribute('data-bs-theme', theme); // Pour les composants Bootstrap
    }

    /**
     * --- 1. Application instantanée du thème ---
     * S'exécute immédiatement pour éviter le "Flash of Unstyled Content" (FOUC).
     */
    const initialTheme = getInitialTheme();
    applyTheme(initialTheme);

    /**
     * --- 2. Logique du bouton de bascule ---
     * Cette partie attend que la page soit complètement chargée pour attacher l'écouteur d'événement.
     */
    document.addEventListener('DOMContentLoaded', () => {
        const themeToggle = document.getElementById('themeToggle');

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                
                applyTheme(newTheme);

                try {
                    localStorage.setItem('theme', newTheme);
                } catch (e) {
                    console.error('Impossible de sauvegarder le thème dans le localStorage :', e);
                }
            });
        }
    });
})();