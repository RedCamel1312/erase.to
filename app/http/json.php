<?php
namespace App\Http;

class Json {
    public static function decode(string $json): ?array {
        $data = json_decode($json, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }
        return $data;
    }
}
