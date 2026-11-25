# AGENTS.md — Roundcube Reskin (Satek Webmail)

Guidelines and lessons learned from git history so recurring CSS, icon, PHP, and deployment regressions do not happen again.

## 1. Skins Architecture & LESS Build Rule (CRITICAL)

This repo maintains two custom skins extending `elastic`:
- **Satek** (`skins/sogo/`): teal/green SOGo-style skin (`sogo.js`, `styles/sogo.less`).
- **Satek Dark** (`skins/satek-dark/`): black/orange skin (`satekd.js`, `styles/satekd.less`).

Both skins load via `skins_allowed = ['sogo', 'satek-dark']` in prod `config/config.inc.php`, and Roundcube serves `styles/styles.min.css` in production (`devel_mode = false`).

### Always compile LESS with `--rewrite-urls=all`
Both `skins/sogo/styles/styles.less` and `skins/satek-dark/styles/styles.less` import `../../elastic/styles/styles.less`.

**NEVER run `lessc` without `--rewrite-urls=all`.** Always build BOTH `styles.css` and `styles.min.css` for any edited skin:

```powershell
# Satek (skins/sogo)
.\node_modules\.bin\lessc.cmd --rewrite-urls=all --clean-css="--s1 --advanced" skins/sogo/styles/styles.less skins/sogo/styles/styles.css
.\node_modules\.bin\lessc.cmd --rewrite-urls=all --clean-css="--s1 --advanced" skins/sogo/styles/styles.less skins/sogo/styles/styles.min.css

# Satek Dark (skins/satek-dark)
.\node_modules\.bin\lessc.cmd --rewrite-urls=all skins/satek-dark/styles/styles.less skins/satek-dark/styles/styles.css
.\node_modules\.bin\lessc.cmd --rewrite-urls=all --clean-css="--s1 --advanced" skins/satek-dark/styles/styles.less skins/satek-dark/styles/styles.min.css
```

- **Why (git history: `1906f0a` -> `180ba54` -> `592f29f` -> `07a0318` -> `e7a2658`)**:
  - Without `--rewrite-urls=all`, `lessc` leaves Elastic's `@font-face` and asset URLs as `url("../fonts/fa-solid-900.woff2")`, `url("../fonts/roboto-v29-...")`, and `url("images/google-icon.svg")`, and skips `data-uri('../images/corner-handle.svg')`.
  - Because `skins/sogo/fonts/` only bundles `be-vietnam-pro-*.woff2` (not FontAwesome), compiling without `--rewrite-urls=all` causes **every FontAwesome icon in `Satek` to render as `□`** (the exact regression that happened in `satek-dark` at `1906f0a` and in `sogo` at `e7a2658`).
  - With `--rewrite-urls=all`, Elastic's fonts/images rewrite cleanly to `../../elastic/fonts/...` and `../../elastic/styles/images/...`, SVGs inline properly, and `fonts.less` keeps `../fonts/be-vietnam-pro-*.woff2`.
- **Verification after every LESS compile**: Confirm `styles.min.css` contains `../../elastic/fonts/fa-solid-900.woff2` (never `../fonts/fa-solid-900.woff2` in `sogo`) and zero `Skipped data-uri embedding` warnings appeared during build.
- **Debugging missing icon glyphs (`□`)**: First inspect `@font-face` `src: url(...)` in the compiled `styles.min.css` and browser Network 404s before touching icon CSS rules (`180ba54` / `592f29f` stripped button CSS before realizing the font URL itself was 404).

## 2. Skin Parity & CSS Traps

- **Keep `skins/sogo` and `skins/satek-dark` in sync**: Changes to shared UX (`sogo.js` / `satekd.js`, sidebar card, compose quote, login layout) must be applied to **both** skins and checked in **both** Light Mode and Dark Mode (`html.dark-mode`).
- **Sidebar account header (`#layout-sidebar > .header`)**:
  - Desktop Mail (`>= 1201px`) uses `.sogo-has-usercard`: **one** 34px `.sogo-username-icon` on top-left, `.sogo-sidebar-settings` (`⚙`) + `.sidebar-menu` (`⋮`) pinned top-right, and full-width `.sogo-username-text` below (`<wbr>` inserted before `@` in JS).
  - Never add `:before` on `.header-title.username` (`1eb0e58` left the 42px `.header-title:before` active alongside `.sogo-username-icon`, rendering 2 user icons and truncating email to `god...`). Keep `:before` scoped strictly to `.header-title:not(.username):before` (used by Addressbook/Settings).
  - Elastic's `#layout > div > .header` sets `white-space: nowrap` and `line-height: @layout-header-height`. Any wrapping header text must explicitly set `white-space: normal !important` and an explicit `line-height`.
  - In `satekd.less`, keep `#layout-sidebar > .header` light/dark overrides scoped inside `@media screen and (min-width: 481px)` so they do not override the `<= 480px` mobile header text color.
- **Compose rich editor & reply quotes (`8f24c30`, `98a1aa5`, `2e5b1d0`)**:
  - Always set `window.rcmail.env.editor_warned = true` before auto-toggling TinyMCE so Roundcube does not pop a confirmation dialog.
  - Ensure form `submit` expands collapsed quotes and strips `.sogo-quote-toggle` helper buttons before sending.

## 3. Production Environment & PHP Constraints

- **URL / Server**: `https://roundcube.vitrasau.info.vn` on `host68.vietnix.vn` (`103.200.23.68`), SSH alias `vitrasau` (`phuongv2`, key `~/.ssh/id_rsa_vitrasau`), app root `/home/phuongv2/roundcube.vitrasau.info.vn`, DocumentRoot `.../public_html`.
- **Static assets URL**: Production serves skin files through `public_html/static.php/skins/...` (direct `/skins/...` returns 404).
- **PHP 8.3 intl fallbacks (`930a3cb`)**: Vietnix cPanel PHP lacks full `intl` APIs (`INTL_IDNA_VARIANT_UTS46`, `collator_create`). Never revert the fallbacks in `program/lib/Roundcube/rcube_imap.php` and `program/lib/Roundcube/rcube_utils.php`.
- **Mailcow & Reset Password (`e42dd2a`, `d10db9a`–`33484c2`)**: Prod IMAP/SMTP uses Satek Mailcow (`config/satek-mailcow.inc.php`, included by prod `config/config.inc.php`); forgot/reset password on login is handled by `plugins/satek_mailbox_reset`.

## 4. Git Hygiene & CI/CD Deploy

- **Never commit**: `config/config.inc.php`, `config-server.inc.php`, `dist-deploy/`, `vendor/`, `node_modules/`, or JS deps (`program/js/jquery.min.js`, `tinymce`, `skins/elastic/deps`).
- **Deploy flow**: Pushing to `master` triggers `.github/workflows/deploy.yml`, which SSHes via deploy key (`PROD_SSH_KEY`) and runs `/home/phuongv2/bin/rc-deploy.sh` (`git fetch origin master` + `git reset --hard origin/master`). Untracked/gitignored files on prod (`config/config.inc.php`, `vendor/`, `logs/`, `temp/`) are preserved — never run `git clean` on prod.
- **Post-deploy verification**: Verify `.github/workflows/deploy.yml` succeeds, confirm prod commit via `ssh vitrasau`, and check live assets via `https://roundcube.vitrasau.info.vn/static.php/skins/...`.
