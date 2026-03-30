<?php
// app/includes/head.php
// Beinhaltet alles, was im HTML-Kopf gleich bleibt.
require_once __DIR__ . '/../security/csp.php';
\App\Security\CspManager::sendHeader();
$nonce = \App\Security\CspManager::getNonce();

$site_name = "erase.to";
$title = isset($page_title) ? $page_title . " - " . $site_name : $site_name;
$description = isset($page_desc) ? $page_desc : "Create a message, share a link, let it disappear.";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($title) ?></title>
    <meta name="description" content="<?= htmlspecialchars($description) ?>">

    <?php if (isset($prevent_indexing) && $prevent_indexing): ?>
    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
    <?php else: ?>
    <meta property="og:title" content="<?= htmlspecialchars($title) ?>">
    <meta property="og:description" content="<?= htmlspecialchars($description) ?>">
    <meta property="og:image" content="/assets/img/og-default.jpg">
    <meta property="og:type" content="website">
    <?php endif; ?>

    <!-- Verhindert FOUC (Flash of unstyled content) beim Dark Mode -->
    <script nonce="<?= $nonce ?>">
        (function() {
            var theme = localStorage.getItem('theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('theme-dark');
            }
        })();
    </script>

    <!-- Statische Architektur laden -->
    <link rel="stylesheet" href="/assets/css/tokens.css">
    <link rel="stylesheet" href="/assets/css/base.css">
    <link rel="stylesheet" href="/assets/css/layout.css">
    <link rel="stylesheet" href="/assets/css/components.css">
    <?php if(isset($extra_css)): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($extra_css) ?>">
    <?php endif; ?>
    <link rel="stylesheet" href="/assets/css/dark.css">

    <link rel="icon" href="/favicon.ico" type="image/x-icon">
</head>
<body>
