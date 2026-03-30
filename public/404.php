<?php
// public/404.php
// Die reduzierte 404 Fehlerseite.

http_response_code(404);

$page_title = "404 Not Found";
$extra_css = "/assets/css/pages-static.css";

require_once __DIR__ . '/../app/includes/head.php';
require_once __DIR__ . '/../app/includes/layout-open.php';
?>

<div class="workspace-header">
    <span class="workspace-marker" style="background-color: var(--color-border-subtle);"></span>
    <h1>404 Not Found</h1>
    <p class="text-sm text-muted">The requested document could not be found.</p>
</div>

<div class="static-content" style="margin-top: var(--space-xl);">
    <p>This path does not lead to any active content.</p>
    <p style="margin-top: var(--space-md);">
        If you clicked a link to a message, it has likely already been securely destroyed according to its single-use or expiration policy. 
        <strong>erase.to</strong> leaves no digital residue of expired payloads.
    </p>
    
    <div style="margin-top: var(--space-xl);">
        <a href="/" class="btn btn-primary" style="text-decoration: none; display: inline-block;">Return to Start</a>
    </div>
</div>

<?php 
require_once __DIR__ . '/../app/includes/layout-close.php';
require_once __DIR__ . '/../app/includes/footer.php'; 
?>
