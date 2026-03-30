<?php
// public/privacy.php
// Öffentliche Hülle für die Datenschutzrichtlinie.

$page_title = "Privacy Policy";
$extra_css = "/assets/css/pages-static.css";

require_once __DIR__ . '/../app/includes/head.php';
require_once __DIR__ . '/../app/includes/layout-open.php';
require_once __DIR__ . '/../app/includes/header.php';

// Inkludiere den echten Textinhalt
require_once __DIR__ . '/../app/content/privacy.php';

require_once __DIR__ . '/../app/includes/footer.php';
require_once __DIR__ . '/../app/includes/layout-close.php';
?>
