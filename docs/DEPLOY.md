# Deploy Roundcube (Vietnix cPanel)

## SSH (local)

```
Host vitrasau
  HostName host68.vietnix.vn
  User phuongv2
  Port 22
  IdentityFile ~/.ssh/id_rsa_vitrasau
  IdentitiesOnly yes
```

```bash
ssh vitrasau
# app: ~/roundcube.vitrasau.info.vn
```

Passphrase of `id_rsa_vitrasau` is not stored in this repository.

## What is on the server vs git

Git tracks application source (including `sogo-elastic` and PHP intl fallbacks).

**Not** in git (already on prod, do not `git clean`):

- `config/config.inc.php`
- `config/defaults.inc.php`, `config/mimetypes.php` (if still gitignored)
- `vendor/`
- `program/js/jquery.min.js`, `program/js/tinymce/`, `skins/elastic/deps/`
- `logs/`, `temp/`

DocumentRoot is `public_html/`. PHP on the vhost is 8.3; some intl APIs are missing (do not revert the IDNA/collator fallbacks).

## CI/CD

On every push to `master`, GitHub Actions SSHes as `phuongv2` and runs `~/bin/rc-deploy.sh` (`git fetch` + `git pull --ff-only` in the app directory).

Required repo secrets:

- `PROD_SSH_KEY` — private key of the **deploy** key (ed25519, no passphrase)
- `PROD_SSH_HOST` — `host68.vietnix.vn` (optional if hardcoded)
- `PROD_SSH_USER` — `phuongv2`

Public key of that deploy key must be in `~/.ssh/authorized_keys` on the server, restricted to `rc-deploy.sh`.
