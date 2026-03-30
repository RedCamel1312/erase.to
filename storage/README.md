# storage/messages/

This directory is the **runtime storage** for encrypted message blobs.

- It is **not committed** to the repository (see `.gitignore`).
- Create it manually on your server: `mkdir -p storage/messages && chmod 700 storage/messages`
- The application will create a `.htaccess` file inside it automatically to block direct web access.
- Files here are plain JSON containing only the encrypted ciphertext. The server cannot decrypt them.
