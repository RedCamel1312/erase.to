<?php
// public/terms.php
// Öffentliche Hülle für die Nutzungsbedingungen.

$page_title = "Terms of Service";
$extra_css = "/assets/css/pages-static.css";

require_once __DIR__ . '/../app/includes/head.php';
require_once __DIR__ . '/../app/includes/layout-open.php';
require_once __DIR__ . '/../app/includes/header.php';

// Inkludiere den echten Textinhalt
require_once __DIR__ . '/../app/content/terms.php';

require_once __DIR__ . '/../app/includes/footer.php';
require_once __DIR__ . '/../app/includes/layout-close.php';
?>
