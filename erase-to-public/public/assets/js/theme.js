// public/assets/js/theme.js
// Verwaltet den Dark-Mode-Schalter (sanft, präzise und diskret).

document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlEl = document.documentElement;

    if (!themeToggleBtn) return;

    // Der Klick auf den Button kehrt das Theme um und speichert die Wahl.
    themeToggleBtn.addEventListener('click', () => {
        const isDark = htmlEl.classList.toggle('theme-dark');
        
        // Speichere die explizite lokale Wahl des Nutzers
        if (isDark) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    });

    // Horcht zusätzlich auf System-Einstellungs-Wechsel.
    // Greift nur, wenn der Nutzer noch NIE explizit auf den Schalter geklickt hat.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            if (e.matches) {
                htmlEl.classList.add('theme-dark');
            } else {
                htmlEl.classList.remove('theme-dark');
            }
        }
    });
});
