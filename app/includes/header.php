<?php
// app/includes/header.php
// Obere Navigation: Leicht, prÃ¤zise, architektonisch. Drei Zonen.
?>
    <header class="site-header">
        <!-- Links: Wortzeichen, souverÃ¤n klein -->
        <div class="header-left">
            <a href="/" class="logo-link" aria-label="erase.to Startseite">
                <!-- Dezentes kleines Schlosssymbol als Einstieg -->
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="logo-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span class="logo-text">erase.to</span>
            </a>
        </div>

        <!-- Mitte: Bewusst leere Zone fÃ¼r absolute Ruhe -->
        <div class="header-center"></div>

        <!-- Rechts: NÃ¶tigste Links und Theme-Toggle, keine volle Button-Bar -->
        <nav class="header-right">
            <a href="/create.php" class="nav-link">Create</a>
            <a href="/privacy.php" class="nav-link">Privacy</a>
            
            <button type="button" id="theme-toggle" class="btn-icon" aria-label="Toggle Theme" title="Toggle Theme">
                <!-- Sun Icon fÃ¼r Light Mode -->
                <svg class="icon-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                <!-- Moon Icon fÃ¼r Dark Mode -->
                <svg class="icon-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: none;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            </button>
        </nav>
    </header>
