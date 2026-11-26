<?php

/**
 * Satek Quick Signature Management
 * - Upgrades Compose toolbar "Signature" button into a popover menu consistent with "Responses"
 * - Opens a unified Signature Settings modal combining Identity Signature + Auto-Insert Prefs
 * - Saves to DB (identities + user prefs) and updates the Compose screen in real time without reload
 */
class satek_signature_quick extends rcube_plugin
{
    public $task = 'mail|settings';

    /** @var rcmail */
    private $rc;

    #[\Override]
    public function init()
    {
        $this->rc = rcmail::get_instance();
        $this->add_texts('localization/', false);

        if ($this->rc->task === 'mail') {
            if ($this->rc->action === 'compose') {
                $this->include_stylesheet('satek_signature_quick.css');
                $this->include_script('satek_signature_quick.js');
            }
            $this->add_hook('render_page', [$this, 'on_mail_render']);
        } elseif ($this->rc->task === 'settings') {
            $this->register_action('plugin.satek_signature', [$this, 'action_modal']);
            $this->register_action('plugin.satek_signature_save', [$this, 'action_save']);
        }
    }

    public function on_mail_render($args)
    {
        if (($args['template'] ?? '') !== 'compose') {
            return $args;
        }

        $identities = [];
        if ($this->rc->user && !empty($this->rc->user->ID)) {
            foreach ((array) $this->rc->user->list_identities() as $id) {
                $iid = (string) $id['identity_id'];
                $identities[] = [
                    'id' => $iid,
                    'label' => format_email_recipient(rcube_utils::idn_to_utf8($id['email']), $id['name']),
                    'has_sig' => trim((string) ($id['signature'] ?? '')) !== '',
                ];
            }
        }

        $this->rc->output->set_env('satek_sig_quick', [
            'identities' => $identities,
            'modal_url' => $this->rc->url(['_task' => 'settings', '_action' => 'plugin.satek_signature', '_framed' => 1]),
            'labels' => [
                'insertsig_section' => $this->gettext('insertsig_section'),
                'managesig_section' => $this->gettext('managesig_section'),
                'nosigavailable' => $this->gettext('nosigavailable'),
                'configsig' => $this->gettext('configsig'),
                'modaltitle' => $this->gettext('modaltitle'),
            ],
        ]);

        return $args;
    }

    public function action_modal()
    {
        if (!$this->rc->user || empty($this->rc->user->ID)) {
            $this->rc->output->show_message('sessionerror', 'error');
            $this->rc->output->send('iframe');
            return;
        }

        $this->include_stylesheet('satek_signature_quick.css');
        $this->include_script('satek_signature_modal.js');

        $selected_iid = rcube_utils::get_input_string('_iid', rcube_utils::INPUT_GET);
        $from_compose = rcube_utils::get_input_string('_compose', rcube_utils::INPUT_GET) === '1';
        $identities = [];
        $default_iid = '';

        foreach ((array) $this->rc->user->list_identities() as $row) {
            $iid = (string) $row['identity_id'];
            if ($default_iid === '' || !empty($row['standard'])) {
                $default_iid = $iid;
            }
            $identities[] = [
                'id' => $iid,
                'label' => format_email_recipient(rcube_utils::idn_to_utf8($row['email']), $row['name']),
                'signature' => (string) ($row['signature'] ?? ''),
                'html_signature' => !empty($row['html_signature']),
                'standard' => !empty($row['standard']),
            ];
        }

        if ($selected_iid === '' && $default_iid !== '') {
            $selected_iid = $default_iid;
        }

        $no_override = array_flip((array) $this->rc->config->get('dont_override'));
        $prefs = [
            'show_sig' => (int) $this->rc->config->get('show_sig', 1),
            'sig_below' => (bool) $this->rc->config->get('sig_below', false),
            'strip_existing_sig' => (bool) $this->rc->config->get('strip_existing_sig', true),
            'sig_separator' => (bool) $this->rc->config->get('sig_separator', true),
        ];

        $this->rc->output->set_env('satek_sig_modal', [
            'identities' => $identities,
            'selected_iid' => $selected_iid,
            'from_compose' => $from_compose,
            'prefs' => $prefs,
            'disabled_prefs' => [
                'show_sig' => isset($no_override['show_sig']),
                'sig_below' => isset($no_override['sig_below']),
                'strip_existing_sig' => isset($no_override['strip_existing_sig']),
                'sig_separator' => isset($no_override['sig_separator']),
            ],
            'save_url' => $this->rc->url(['_task' => 'settings', '_action' => 'plugin.satek_signature_save']),
            'token' => $this->rc->get_request_token(),
            'labels' => [
                'saving' => $this->gettext('saving'),
                'saved' => $this->gettext('saved'),
                'saveerror' => $this->gettext('saveerror'),
                'prompt_link' => $this->gettext('prompt_link'),
            ],
        ]);

        $this->rc->output->set_pagetitle($this->gettext('modaltitle'));
        $this->rc->output->send('satek_signature_quick.signature_modal');
    }

    public function action_save()
    {
        header('Content-Type: application/json; charset=UTF-8');

        if (!$this->rc->user || empty($this->rc->user->ID)) {
            http_response_code(401);
            echo json_encode(['ok' => false, 'message' => $this->gettext('saveerror')]);
            exit;
        }

        if (!$this->rc->check_request()) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'message' => $this->gettext('saveerror')]);
            exit;
        }

        $iid = rcube_utils::get_input_string('_iid', rcube_utils::INPUT_POST);
        $identity = $iid !== '' ? $this->rc->user->get_identity($iid) : null;
        if (!$identity || empty($identity['identity_id'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'message' => $this->gettext('invalididentity')]);
            exit;
        }

        $html_sig = rcube_utils::get_input_string('_html_signature', rcube_utils::INPUT_POST) === '1' ? 1 : 0;
        $signature = rcube_utils::get_input_string('_signature', rcube_utils::INPUT_POST, true);

        if ($html_sig && $signature !== '') {
            $signature = rcmail_action::wash_html($signature);
            // Treat visually empty HTML (<br>, empty <p>, whitespace only) as empty signature
            $plain_check = trim(html_entity_decode(strip_tags($signature), \ENT_QUOTES | \ENT_HTML5, 'UTF-8'));
            if ($plain_check === '' && stripos($signature, '<img') === false) {
                $signature = '';
            }
        } else {
            $signature = trim($signature, "\r\n");
        }

        $save_data = $identity;
        unset($save_data['changed'], $save_data['del'], $save_data['user_id'], $save_data['identity_id']);
        $save_data['signature'] = $signature;
        $save_data['html_signature'] = $html_sig;

        $plugin = $this->rc->plugins->exec_hook('identity_update', ['id' => $iid, 'record' => $save_data]);
        $save_data = $plugin['record'];
        if (!empty($save_data['email'])) {
            $save_data['email'] = rcube_utils::idn_to_ascii($save_data['email']);
        }

        $updated_id = false;
        if (empty($plugin['abort'])) {
            $updated_id = $this->rc->user->update_identity($iid, $save_data);
        }

        if (!$updated_id) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'message' => $this->gettext('saveerror')]);
            exit;
        }
        $this->rc->plugins->exec_hook('identity_update_after', ['id' => $iid, 'record' => $save_data]);

        // Save signature preferences (respecting dont_override)
        $no_override = array_flip((array) $this->rc->config->get('dont_override'));
        $save_prefs = [];

        if (!isset($no_override['show_sig'])) {
            $show_sig = (int) rcube_utils::get_input_string('_show_sig', rcube_utils::INPUT_POST);
            if ($show_sig < 0 || $show_sig > 3) {
                $show_sig = 1;
            }
            $save_prefs['show_sig'] = $show_sig;
        }
        if (!isset($no_override['sig_below'])) {
            $save_prefs['sig_below'] = rcube_utils::get_input_string('_sig_below', rcube_utils::INPUT_POST) === '1';
        }
        if (!isset($no_override['strip_existing_sig'])) {
            $save_prefs['strip_existing_sig'] = rcube_utils::get_input_string('_strip_existing_sig', rcube_utils::INPUT_POST) === '1';
        }
        if (!isset($no_override['sig_separator'])) {
            $save_prefs['sig_separator'] = rcube_utils::get_input_string('_sig_separator', rcube_utils::INPUT_POST) === '1';
        }

        if (!empty($save_prefs)) {
            $this->rc->user->save_prefs($save_prefs);
        }

        // Rebuild compose signatures map matching rcmail_sendmail::compose_header_from()
        $sig_below = isset($save_prefs['sig_below']) ? $save_prefs['sig_below'] : (bool) $this->rc->config->get('sig_below', false);
        $add_separator = isset($save_prefs['sig_separator']) ? $save_prefs['sig_separator'] : (bool) $this->rc->config->get('sig_separator', true);
        $strip_existing = isset($save_prefs['strip_existing_sig']) ? $save_prefs['strip_existing_sig'] : (bool) $this->rc->config->get('strip_existing_sig', true);
        $show_sig_val = isset($save_prefs['show_sig']) ? $save_prefs['show_sig'] : (int) $this->rc->config->get('show_sig', 1);

        $signatures = [];
        $identities_out = [];
        foreach ((array) $this->rc->user->list_identities() as $row) {
            $row_id = (string) $row['identity_id'];
            $sig_raw = (string) ($row['signature'] ?? '');
            $has_sig = trim($sig_raw) !== '';
            $identities_out[] = [
                'id' => $row_id,
                'label' => format_email_recipient(rcube_utils::idn_to_utf8($row['email']), $row['name']),
                'has_sig' => $has_sig,
                'signature' => $sig_raw,
                'html_signature' => !empty($row['html_signature']),
            ];

            if ($has_sig) {
                $text = $html = $sig_raw;
                if (!empty($row['html_signature'])) {
                    $text = trim($this->rc->html2text($html, ['links' => false]), "\r\n");
                } else {
                    $t2h = new rcube_text2html($text, false);
                    $html = $t2h->get_html();
                }

                if ($add_separator && !preg_match('/^--[ -]\r?\n/m', $text)) {
                    $text = "-- \n" . ltrim($text, "\r\n");
                    $html = '-- <br>' . $html;
                }

                $signatures[$row_id] = [
                    'text' => $text,
                    'html' => $html,
                ];
            }
        }

        echo json_encode([
            'ok' => true,
            'message' => $this->gettext('saved'),
            'iid' => (string) $iid,
            'signatures' => (object) $signatures,
            'identities' => $identities_out,
            'prefs' => [
                'show_sig' => $show_sig_val,
                'sig_below' => $sig_below,
                'strip_existing_sig' => $strip_existing,
                'sig_separator' => $add_separator,
            ],
        ]);
        exit;
    }
}
