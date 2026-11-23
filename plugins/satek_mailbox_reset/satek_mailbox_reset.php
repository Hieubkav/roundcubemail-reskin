<?php

/**
 * Forgot / reset mailbox password via Satek CRM public API.
 * Matches MailboxForgotPassword mail: {reseturl}?email=&token=
 */
class satek_mailbox_reset extends rcube_plugin
{
    public $task = 'login';
    public $noajax = true;
    public $noframe = true;

    /** @var rcmail */
    private $rc;

    #[Override]
    public function init()
    {
        $this->rc = rcmail::get_instance();
        $this->load_config();
        $this->add_texts('localization/');
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('unauthenticated', [$this, 'unauthenticated']);
        $this->add_hook('loginform_content', [$this, 'loginform_content']);
        $this->include_stylesheet('satek_mailbox_reset.css');
        $this->include_script('satek_mailbox_reset.js');
    }

    public function startup($args)
    {
        $this->hydrate_query();
        $mode = $this->mode();
        if ($mode === 'satek_forgot' || $mode === 'satek_reset') {
            $args['task'] = 'login';
            $args['action'] = $mode;
            $this->rc->action = $mode;
        }

        return $args;
    }

    public function unauthenticated($args)
    {
        $mode = $this->mode();
        if ($mode === 'satek_forgot' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
            $this->handle_forgot();
        }
        if ($mode === 'satek_reset' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
            $this->handle_reset();
        }

        if (!empty($_SESSION['satek_mailbox_flash']) && is_array($_SESSION['satek_mailbox_flash'])) {
            $flash = $_SESSION['satek_mailbox_flash'];
            unset($_SESSION['satek_mailbox_flash']);
            $text = isset($flash['text']) ? (string) $flash['text'] : '';
            $type = isset($flash['type']) ? (string) $flash['type'] : 'confirmation';
            if ($text !== '') {
                $message = !empty($flash['raw']) ? $text : $this->gettext($text);
                $this->rc->output->show_message($message, $type);
            }
        }

        $args['task'] = 'login';

        return $args;
    }

    public function loginform_content(array $form)
    {
        $mode = $this->mode();

        if ($mode === 'satek_forgot') {
            return $this->forgot_form($form);
        }
        if ($mode === 'satek_reset') {
            return $this->reset_form($form);
        }

        $form['buttons']['satek_forgot'] = [
            'outterclass' => 'satek-mailbox-reset-link',
            'content' => html::a([
                'href' => $this->rc->url(['_task' => 'login', '_action' => 'satek_forgot']),
            ], rcube::Q($this->gettext('forgotlink'))),
        ];

        return $form;
    }

    private function mode()
    {
        $action = (string) $this->rc->action;
        if (str_contains($action, 'satek_reset')) {
            return 'satek_reset';
        }
        if (str_contains($action, 'satek_forgot')) {
            return 'satek_forgot';
        }

        $email = $this->query_email();
        $token = $this->query_token();
        if ($email !== '' && $token !== '') {
            return 'satek_reset';
        }

        return $action;
    }

    private function hydrate_query()
    {
        $qs = str_replace('?', '&', (string) ($_SERVER['QUERY_STRING'] ?? ''));
        parse_str($qs, $params);
        foreach (['email', 'token', '_mailbox_email', '_reset_token'] as $key) {
            if (!empty($params[$key]) && is_string($params[$key])) {
                $_GET[$key] = $params[$key];
                $_REQUEST[$key] = $params[$key];
            }
        }
    }

    private function query_email()
    {
        $email = trim(rcube_utils::get_input_string('_mailbox_email', rcube_utils::INPUT_GPC));
        if ($email === '') {
            $email = trim(rcube_utils::get_input_string('email', rcube_utils::INPUT_GPC));
        }

        return $email;
    }

    private function query_token()
    {
        $token = trim(rcube_utils::get_input_string('_reset_token', rcube_utils::INPUT_GPC));
        if ($token === '') {
            $token = trim(rcube_utils::get_input_string('token', rcube_utils::INPUT_GPC));
        }

        return $token;
    }

    private function forgot_form(array $form)
    {
        $email = $this->query_email();
        $personal = rcube_utils::get_input_string('_email_personal', rcube_utils::INPUT_GPC);

        $form['hidden'] = [
            'task' => (new html_hiddenfield(['name' => '_task', 'value' => 'login']))->show(),
            'action' => (new html_hiddenfield(['name' => '_action', 'value' => 'satek_forgot']))->show(),
            'token' => (new html_hiddenfield(['name' => '_token', 'value' => $this->rc->get_request_token()]))->show(),
        ];
        $this->rc->output->set_env('satek_reset_title', $this->gettext('forgottitle'));
        $form['inputs'] = [
            'mailbox' => [
                'title' => html::label('satek-mailbox-email', rcube::Q($this->gettext('mailboxemail'))),
                'content' => (new html_inputfield([
                    'type' => 'email',
                    'name' => '_mailbox_email',
                    'id' => 'satek-mailbox-email',
                    'required' => true,
                    'class' => 'form-control',
                    'autocomplete' => 'username',
                    'data-icon' => 'user',
                ]))->show($email),
            ],
            'personal' => [
                'title' => html::label('satek-email-personal', rcube::Q($this->gettext('personalemail'))),
                'content' => (new html_inputfield([
                    'type' => 'email',
                    'name' => '_email_personal',
                    'id' => 'satek-email-personal',
                    'required' => true,
                    'class' => 'form-control',
                    'autocomplete' => 'email',
                    'data-icon' => 'email',
                ]))->show($personal),
            ],
        ];
        $form['buttons'] = [
            'submit' => [
                'outterclass' => 'formbuttons',
                'content' => html::tag('button', [
                    'type' => 'submit',
                    'id' => 'rcmloginsubmit',
                    'class' => 'button mainaction submit',
                ], rcube::Q($this->gettext('sendreset'))),
            ],
            'back' => [
                'outterclass' => 'satek-mailbox-reset-link',
                'content' => html::a([
                    'href' => $this->rc->url(['_task' => 'login']),
                ], rcube::Q($this->gettext('backtologin'))),
            ],
        ];

        return $form;
    }

    private function reset_form(array $form)
    {
        $email = $this->query_email();
        $token = $this->query_token();

        $form['hidden'] = [
            'task' => (new html_hiddenfield(['name' => '_task', 'value' => 'login']))->show(),
            'action' => (new html_hiddenfield(['name' => '_action', 'value' => 'satek_reset']))->show(),
            'csrf' => (new html_hiddenfield(['name' => '_token', 'value' => $this->rc->get_request_token()]))->show(),
            'reset_token' => (new html_hiddenfield(['name' => '_reset_token', 'value' => $token]))->show(),
            'email' => (new html_hiddenfield(['name' => '_mailbox_email', 'value' => $email]))->show(),
        ];
        $this->rc->output->set_env('satek_reset_title', $this->gettext('resettitle'));
        $form['inputs'] = [
            'mailbox' => [
                'title' => html::label('satek-mailbox-email', rcube::Q($this->gettext('mailboxemail'))),
                'content' => (new html_inputfield([
                    'type' => 'email',
                    'name' => '_mailbox_display',
                    'id' => 'satek-mailbox-email',
                    'class' => 'form-control',
                    'readonly' => true,
                    'data-icon' => 'user',
                ]))->show($email),
            ],
            'password' => [
                'title' => html::label('satek-new-password', rcube::Q($this->gettext('newpassword'))),
                'content' => (new html_passwordfield([
                    'name' => '_new_password',
                    'id' => 'satek-new-password',
                    'required' => true,
                    'class' => 'form-control',
                    'autocomplete' => 'new-password',
                    'data-icon' => 'pass',
                    'placeholder' => $this->gettext('newpassword'),
                ]))->show(),
            ],
            'confirm' => [
                'title' => html::label('satek-confirm-password', rcube::Q($this->gettext('confirmpassword'))),
                'content' => (new html_passwordfield([
                    'name' => '_confirm_password',
                    'id' => 'satek-confirm-password',
                    'required' => true,
                    'class' => 'form-control',
                    'autocomplete' => 'new-password',
                    'data-icon' => 'pass',
                    'placeholder' => $this->gettext('confirmpassword'),
                ]))->show(),
            ],
        ];
        $form['buttons'] = [
            'submit' => [
                'outterclass' => 'formbuttons',
                'content' => html::tag('button', [
                    'type' => 'submit',
                    'id' => 'rcmloginsubmit',
                    'class' => 'button mainaction submit',
                ], rcube::Q($this->gettext('savereset'))),
            ],
            'back' => [
                'outterclass' => 'satek-mailbox-reset-link',
                'content' => html::a([
                    'href' => $this->rc->url(['_task' => 'login']),
                ], rcube::Q($this->gettext('backtologin'))),
            ],
        ];

        if ($email === '' || $token === '') {
            $this->rc->output->show_message($this->gettext('missingresettoken'), 'warning');
        }

        return $form;
    }

    private function handle_forgot()
    {
        if (!$this->rc->check_request(rcube_utils::INPUT_POST)) {
            $this->rc->output->show_message($this->gettext('invalidrequest'), 'error');
            return;
        }

        $email = trim(rcube_utils::get_input_string('_mailbox_email', rcube_utils::INPUT_POST));
        $personal = trim(rcube_utils::get_input_string('_email_personal', rcube_utils::INPUT_POST));

        if ($email === '' || $personal === '') {
            $this->rc->output->show_message($this->gettext('fieldsrequired'), 'warning');
            return;
        }

        $result = $this->call_api('/shared/mailservers/mailbox-forgot-password', [
            'email' => $email,
            'email_personal' => $personal,
            'reseturl' => $this->public_reset_url(),
        ]);

        if ($result['ok']) {
            $this->redirect_login('forgotsent', 'confirmation');
        }

        $this->rc->output->show_message($result['message'], 'error');
    }

    private function handle_reset()
    {
        if (!$this->rc->check_request(rcube_utils::INPUT_POST)) {
            $this->rc->output->show_message($this->gettext('invalidrequest'), 'error');
            return;
        }

        $email = trim(rcube_utils::get_input_string('_mailbox_email', rcube_utils::INPUT_POST));
        $token = trim(rcube_utils::get_input_string('_reset_token', rcube_utils::INPUT_POST));
        $password = rcube_utils::get_input_string('_new_password', rcube_utils::INPUT_POST, true);
        $confirm = rcube_utils::get_input_string('_confirm_password', rcube_utils::INPUT_POST, true);

        if ($email === '' || $token === '' || $password === '') {
            $this->rc->output->show_message($this->gettext('fieldsrequired'), 'warning');
            return;
        }
        if ($password !== $confirm) {
            $this->rc->output->show_message($this->gettext('passwordmismatch'), 'warning');
            return;
        }

        $result = $this->call_api('/shared/mailservers/mailbox-reset-password', [
            'email' => $email,
            'token' => $token,
            'password' => $password,
        ]);

        if ($result['ok']) {
            $this->redirect_login('resetsuccess', 'confirmation');
        }

        $this->redirect_login($result['message'], 'error', true);
    }

    private function redirect_login($text, $type, $raw = false)
    {
        $_SESSION['satek_mailbox_flash'] = ['text' => $text, 'type' => $type, 'raw' => $raw];
        header('Location: ' . $this->rc->url(['_task' => 'login']), true, 303);
        exit;
    }

    private function public_reset_url()
    {
        $configured = rtrim((string) $this->rc->config->get('satek_mailbox_reset_url', ''), '/');
        if ($configured !== '') {
            return $configured;
        }

        $https = rcube_utils::https_check();
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $script = $_SERVER['SCRIPT_NAME'] ?? '/';

        // Mail template appends ?email=&token=
        return ($https ? 'https://' : 'http://') . $host . $script;
    }

    /**
     * @param array<string,string> $body
     * @return array{ok:bool,message:string,status:int}
     */
    private function call_api($path, array $body)
    {
        $base = rtrim((string) $this->rc->config->get(
            'satek_crm_api_base',
            'https://crm-api.satek.vn/v1'
        ), '/');
        $url = $base . $path;
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
        $status = 0;
        $raw = '';

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => [
                    'Accept: application/json',
                    'Content-Type: application/json',
                ],
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 20,
            ]);
            $raw = (string) curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($raw === '' && $status === 0) {
                $err = curl_error($ch);
                curl_close($ch);
                return ['ok' => false, 'status' => 0, 'message' => $err !== '' ? $err : $this->gettext('apierror')];
            }
            curl_close($ch);
        } else {
            $ctx = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => "Accept: application/json\r\nContent-Type: application/json\r\n",
                    'content' => $payload,
                    'ignore_errors' => true,
                    'timeout' => 20,
                ],
            ]);
            $raw = (string) file_get_contents($url, false, $ctx);
            if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
                $status = (int) $m[1];
            }
        }

        $decoded = json_decode($raw, true);
        if ($status >= 200 && $status < 300) {
            return ['ok' => true, 'status' => $status, 'message' => $this->gettext('forgotsent')];
        }

        $message = $this->gettext('apierror');
        if (is_array($decoded)) {
            if (!empty($decoded['message']) && is_string($decoded['message'])) {
                $message = $decoded['message'];
            }
            if (!empty($decoded['errors']) && is_array($decoded['errors'])) {
                $parts = [];
                foreach ($decoded['errors'] as $fieldErrors) {
                    if (is_array($fieldErrors)) {
                        foreach ($fieldErrors as $item) {
                            if (is_string($item) && $item !== '') {
                                $parts[] = $item;
                            }
                        }
                    }
                }
                if ($parts) {
                    $message = implode(' ', $parts);
                }
            }
        }

        return ['ok' => false, 'status' => $status, 'message' => $message];
    }
}
