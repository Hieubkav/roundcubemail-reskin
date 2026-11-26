<?php

// Satek Mailcow (CRM mailboxes). Overrides local cPanel IMAP/SMTP.
$config['imap_host'] = 'ssl://mailpro.satek.vn:993';
$config['smtp_host'] = 'tls://mailpro.satek.vn:587';
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';

// Default UI language to Vietnamese on first visit (ignores browser Accept-Language).
// Respect last-chosen language cookie (rc_lang) after user sets language in Settings.
$config['language'] = 'vi_VN';
if (
    !empty($_COOKIE['rc_lang'])
    && is_string($_COOKIE['rc_lang'])
    && preg_match('/^[a-zA-Z0-9_-]{2,15}$/', $_COOKIE['rc_lang'])
    && is_dir(__DIR__ . '/../program/localization/' . $_COOKIE['rc_lang'])
) {
    $config['language'] = $_COOKIE['rc_lang'];
}

// Enable unified quick signature popover & settings modal on Compose screen.
if (!isset($config['plugins']) || !is_array($config['plugins'])) {
    $config['plugins'] = [];
}
if (!in_array('satek_signature_quick', $config['plugins'], true)) {
    $config['plugins'][] = 'satek_signature_quick';
}
