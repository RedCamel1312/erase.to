<?php
namespace App\Security;

/**
 * Resource Isolation Policy helpers for erase.to
 * 
 * Used in conjunction with CspManager to enforce additional
 * server-side access controls beyond HTTP headers.
 */
class Policy {
    /**
     * Returns true if the current request context is considered safe
     * for serving sensitive content (same-origin, no embedding).
     */
    public static function isSafeContext(): bool {
        // Delegate to Fetch Metadata validation
        return \App\Http\Request::validateFetchMetadata();
    }
}
