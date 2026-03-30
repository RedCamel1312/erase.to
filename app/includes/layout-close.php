<?php
// app/includes/layout-close.php
// Schließt den äußeren Container und lädt asynchrone Skripte.
?>
</div> <!-- Ende .container -->

<!-- Globale App-Funktionalitäten -->
<script src="/assets/js/theme.js"></script>
<script src="/assets/js/app.js"></script>

<?php if(isset($extra_js)): ?>
    <?php if(is_array($extra_js)): ?>
        <?php foreach($extra_js as $script): ?>
            <script src="<?= htmlspecialchars($script) ?>"></script>
        <?php endforeach; ?>
    <?php else: ?>
        <script src="<?= htmlspecialchars($extra_js) ?>"></script>
    <?php endif; ?>
<?php endif; ?>

</body>
</html>
