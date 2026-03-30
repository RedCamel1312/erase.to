<?php
// app/config.php
// Copy this file to config.php and fill in your own values.
// config.php is excluded from the repository via .gitignore.

return [
    // A random secret used to generate Proof-of-Work challenges.
    // Generate with: php -r "echo bin2hex(random_bytes(32));"
    // This value must be kept private on your server.
    'site_secret' => 'REPLACE_ME_WITH_A_RANDOM_STRING_FOR_PRODUCTION',
];
