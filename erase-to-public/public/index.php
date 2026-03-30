<?php
// public/index.php
// Die Startseite: Ruhig, präzise, kontrolliert. Kein "VC-Katalog".

$page_title = "Encrypted messages with minimal traces";
$extra_css = "/assets/css/pages-home.css";
$extra_js = "/assets/js/home.js";

// Layout & Frame (offen)
require_once __DIR__ . '/../app/includes/head.php';
require_once __DIR__ . '/../app/includes/layout-open.php';
require_once __DIR__ . '/../app/includes/header.php';

// Inhaltsblock
require_once __DIR__ . '/../app/content/home.php';

// Footer & Frame (geschlossen)
require_once __DIR__ . '/../app/includes/footer.php';
require_once __DIR__ . '/../app/includes/layout-close.php';
