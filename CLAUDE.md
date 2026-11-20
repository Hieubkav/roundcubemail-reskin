# Roundcube reskin — agent notes

## Production (Vietnix cPanel)

- URL: https://roundcube.vitrasau.info.vn
- Server: `host68.vietnix.vn` (103.200.23.68)
- SSH host alias: `vitrasau` (see `~/.ssh/config`)
  - User: `phuongv2`
  - Key: `~/.ssh/id_rsa_vitrasau` (encrypted; passphrase is **not** in this repo)
- App root: `/home/phuongv2/roundcube.vitrasau.info.vn`
- DocumentRoot: `.../public_html`
- Git remote: https://github.com/Hieubkav/roundcubemail-reskin.git

Do not commit `config/config.inc.php`, `config-server.inc.php`, `dist-deploy/`, `vendor/`, or JS deps (`program/js/jquery.min.js`, tinymce, `skins/elastic/deps`).

## Deploy

Push to `master` runs `.github/workflows/deploy.yml` (SSH + `git pull --ff-only` on the server). Secrets live in GitHub Actions, not in git. See [docs/DEPLOY.md](docs/DEPLOY.md).

`git push` without a successful deploy job does **not** update prod.
