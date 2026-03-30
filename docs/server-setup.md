# Server Setup

This document describes the mandatory server configuration for a production erase.to deployment.

The application makes a specific promise: message content exists only in volatile RAM and is never written to persistent storage. Fulfilling this promise requires a kernel-level tmpfs mount for the message storage directory. This is not optional.

## Required: tmpfs Mount for message storage

`storage/messages/` must be a RAM-backed filesystem (tmpfs). Without this, ciphertext lands on a physical disk and the core privacy guarantee is broken, regardless of what the application code does.

### What tmpfs does

tmpfs is a filesystem that exists entirely in RAM. Any file written to a tmpfs mount is never flushed to a physical disk. When the system reboots, all data in the mount is gone. This is the physical implementation of the "volatile RAM" promise.

### /etc/fstab entry

Add the following line to `/etc/fstab`:

```
tmpfs  /path/to/erase-to/storage/messages  tmpfs  defaults,noatime,nosuid,nodev,noexec,mode=0700,size=64M  0  0
```

Replace `/path/to/erase-to/` with the actual path on your server.

Parameter notes:

| Option | Purpose |
|---|---|
| `noatime` | No access time writes, reduces noise |
| `nosuid` | Prevents setuid bits inside the mount |
| `nodev` | No device files allowed |
| `noexec` | No executables can be run from this mount |
| `mode=0700` | Only the process owner can read or write |
| `size=64M` | Hard RAM ceiling (adjust to traffic expectations) |

### Activate without reboot

```bash
mount /path/to/erase-to/storage/messages
```

Verify it is mounted:

```bash
mount | grep storage/messages
# Expected output contains: tmpfs on /path/to/.../storage/messages type tmpfs
```

Verify nothing is on disk:

```bash
df -h /path/to/erase-to/storage/messages
# Filesystem column must show tmpfs, not a block device
```

### Systemd unit alternative (optional)

If you prefer a systemd mount unit over /etc/fstab:

```ini
[Unit]
Description=erase.to volatile message storage
Before=php8.1-fpm.service nginx.service

[Mount]
What=tmpfs
Where=/path/to/erase-to/storage/messages
Type=tmpfs
Options=defaults,noatime,nosuid,nodev,noexec,mode=0700,size=64M

[Install]
WantedBy=multi-user.target
```

Save as `/etc/systemd/system/path-to-erase\x2dto-storage-messages.mount` (use actual escaped path), then:

```bash
systemctl enable --now path-to-erase\\x2dto-storage-messages.mount
```

## Full Setup Sequence

```bash
# 1. Clone
git clone https://github.com/RedCamel1312/erase.to.git /path/to/erase-to
cd /path/to/erase-to

# 2. Config
cp app/config.example.php app/config.php
# Set a random site_secret: php -r "echo bin2hex(random_bytes(32));"

# 3. Create the storage directory (will be the tmpfs mountpoint)
mkdir -p storage/messages
chmod 700 storage/messages

# 4. Add tmpfs to /etc/fstab (see above) and mount it
mount storage/messages

# 5. Add the .htaccess the app expects (blocks direct HTTP access)
echo "Deny from all" > storage/messages/.htaccess

# 6. Set ownership to your webserver user
chown -R www-data:www-data storage/messages

# 7. Point nginx document root at /path/to/erase-to/public (see README)

# 8. Add cron for expiry cleanup
# * * * * * www-data php /path/to/erase-to/bin/cleanup.php >> /var/log/erase-to-gc.log 2>&1
```

## After a Reboot

The tmpfs mount is empty after every reboot by definition. The `/etc/fstab` entry remounts it automatically on startup. Any messages that existed before the reboot are gone. This is the intended behavior.

If you use a VPS with frequent live migrations or memory snapshots, verify that your provider does not snapshot RAM contents. A standard KVM-based VPS with `/etc/fstab` tmpfs is sufficient.

## What this does NOT protect against

tmpfs does NOT protect against:

- An attacker with root access on the running system (they can read `/proc/$pid/mem` or the tmpfs directly)
- Memory forensics on a running machine
- Cold boot attacks if an attacker has physical hardware access

erase.to's threat model assumes a trusted server OS and targets passive data retention (disk forensics, storage seizure, backup leaks). It does not claim protection against an active attacker with root on your server.
