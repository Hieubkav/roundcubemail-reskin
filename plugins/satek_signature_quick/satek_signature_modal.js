(function () {
    'use strict';

    function textToHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\r?\n/g, '<br>');
    }

    function htmlToText(html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = String(html || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|tr)>/gi, '\n');
        return (tmp.textContent || tmp.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    }

    function initModal() {
        var env = window.rcmail && window.rcmail.env && window.rcmail.env.satek_sig_modal;
        if (!env) {
            return;
        }

        // Sync dark-mode class from parent immediately
        try {
            if (window.parent && window.parent.document && window.parent.document.documentElement.classList.contains('dark-mode')) {
                document.documentElement.classList.add('dark-mode');
            }
        } catch (e) { /* ignore */ }

        var iidSelect = document.getElementById('satek-sig-iid');
        var htmlToggle = document.getElementById('satek-sig-html');
        var toolbar = document.getElementById('satek-sig-toolbar');
        var richEl = document.getElementById('satek-sig-rich');
        var plainEl = document.getElementById('satek-sig-plain');
        var showSelect = document.getElementById('satek-sig-show');
        var belowCheck = document.getElementById('satek-sig-below');
        var stripCheck = document.getElementById('satek-sig-strip');
        var sepCheck = document.getElementById('satek-sig-sep');
        var saveBtn = document.getElementById('satek-sig-save');
        var saveInsertBtn = document.getElementById('satek-sig-save-insert');
        var statusEl = document.getElementById('satek-sig-status');

        if (!iidSelect || !richEl || !plainEl || !saveBtn) {
            return;
        }

        var drafts = {};
        var currentIid = env.selected_iid || '';
        var saving = false;

        (env.identities || []).forEach(function (item) {
            drafts[item.id] = {
                id: item.id,
                label: item.label,
                signature: item.signature || '',
                html_signature: !!item.html_signature
            };
            var opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.label;
            if (item.id === currentIid) {
                opt.selected = true;
            }
            iidSelect.appendChild(opt);
        });

        if (!currentIid && iidSelect.options.length) {
            currentIid = iidSelect.options[0].value;
            iidSelect.value = currentIid;
        }

        // Apply preferences
        var prefs = env.prefs || {};
        showSelect.value = String(typeof prefs.show_sig !== 'undefined' ? prefs.show_sig : 1);
        belowCheck.checked = !!prefs.sig_below;
        stripCheck.checked = !!prefs.strip_existing_sig;
        sepCheck.checked = !!prefs.sig_separator;

        var disabledPrefs = env.disabled_prefs || {};
        if (disabledPrefs.show_sig) {
            showSelect.disabled = true;
        }
        if (disabledPrefs.sig_below) {
            belowCheck.disabled = true;
        }
        if (disabledPrefs.strip_existing_sig) {
            stripCheck.disabled = true;
        }
        if (disabledPrefs.sig_separator) {
            sepCheck.disabled = true;
        }

        if (env.from_compose && saveInsertBtn) {
            saveInsertBtn.hidden = false;
        }

        function setStatus(text, type) {
            statusEl.textContent = text || '';
            statusEl.className = 'satek-sig-status' + (type ? ' is-' + type : '');
            statusEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
        }

        function applyEditorMode(isHtml) {
            htmlToggle.checked = !!isHtml;
            toolbar.hidden = !isHtml;
            richEl.hidden = !isHtml;
            plainEl.hidden = !!isHtml;
        }

        function loadIdentity(iid) {
            var d = drafts[iid];
            if (!d) {
                return;
            }
            currentIid = iid;
            applyEditorMode(d.html_signature);
            if (d.html_signature) {
                richEl.innerHTML = d.signature || '';
                plainEl.value = htmlToText(d.signature || '');
            } else {
                plainEl.value = d.signature || '';
                richEl.innerHTML = textToHtml(d.signature || '');
            }
        }

        function captureCurrentDraft() {
            if (!currentIid || !drafts[currentIid]) {
                return;
            }
            var isHtml = htmlToggle.checked;
            drafts[currentIid].html_signature = isHtml;
            drafts[currentIid].signature = isHtml ? richEl.innerHTML : plainEl.value;
        }

        loadIdentity(currentIid);

        iidSelect.addEventListener('change', function () {
            captureCurrentDraft();
            setStatus('', '');
            loadIdentity(iidSelect.value);
        });

        htmlToggle.addEventListener('change', function () {
            var toHtml = htmlToggle.checked;
            if (toHtml) {
                richEl.innerHTML = textToHtml(plainEl.value);
            } else {
                plainEl.value = htmlToText(richEl.innerHTML);
            }
            applyEditorMode(toHtml);
            captureCurrentDraft();
            (toHtml ? richEl : plainEl).focus();
        });

        toolbar.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) {
                e.preventDefault();
            }
        });

        toolbar.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-cmd]');
            if (!btn) {
                return;
            }
            var cmd = btn.getAttribute('data-cmd');
            richEl.focus();
            if (cmd === 'createLink') {
                var url = window.prompt((env.labels && env.labels.prompt_link) || 'URL:', 'https://');
                if (url && /^(https?:\/\/|mailto:)/i.test(url.trim())) {
                    document.execCommand('createLink', false, url.trim());
                }
            } else {
                document.execCommand(cmd, false, null);
            }
            captureCurrentDraft();
        });

        function setButtonsBusy(busy) {
            saving = busy;
            saveBtn.disabled = busy;
            if (saveInsertBtn) {
                saveInsertBtn.disabled = busy;
            }
        }

        function saveSettings(insertAfter) {
            if (saving) {
                return;
            }
            captureCurrentDraft();
            var d = drafts[currentIid];
            if (!d) {
                return;
            }

            setButtonsBusy(true);
            setStatus((env.labels && env.labels.saving) || 'Saving...', 'pending');

            var body = new URLSearchParams();
            body.set('_token', env.token || '');
            body.set('_iid', d.id);
            body.set('_signature', d.signature || '');
            body.set('_html_signature', d.html_signature ? '1' : '0');
            body.set('_show_sig', showSelect.value);
            body.set('_sig_below', belowCheck.checked ? '1' : '0');
            body.set('_strip_existing_sig', stripCheck.checked ? '1' : '0');
            body.set('_sig_separator', sepCheck.checked ? '1' : '0');

            fetch(env.save_url, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: body.toString()
            })
                .then(function (resp) {
                    return resp.json().then(function (json) {
                        if (!resp.ok || !json || !json.ok) {
                            throw new Error((json && json.message) || (env.labels && env.labels.saveerror) || 'Save failed');
                        }
                        return json;
                    });
                })
                .then(function (data) {
                    // Refresh local drafts from sanitized server response
                    (data.identities || []).forEach(function (row) {
                        drafts[row.id] = {
                            id: row.id,
                            label: row.label,
                            signature: row.signature || '',
                            html_signature: !!row.html_signature
                        };
                    });
                    loadIdentity(d.id);
                    setStatus(data.message || (env.labels && env.labels.saved) || 'Saved.', 'success');

                    if (window.parent && typeof window.parent.satekSignatureSync === 'function') {
                        window.parent.satekSignatureSync(data, !!insertAfter);
                    }
                })
                .catch(function (err) {
                    setStatus(err && err.message ? err.message : ((env.labels && env.labels.saveerror) || 'Error'), 'error');
                })
                .finally(function () {
                    setButtonsBusy(false);
                });
        }

        saveBtn.addEventListener('click', function () {
            saveSettings(false);
        });

        if (saveInsertBtn) {
            saveInsertBtn.addEventListener('click', function () {
                saveSettings(true);
            });
        }
    }

    if (window.rcmail) {
        window.rcmail.addEventListener('init', initModal);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initModal);
    } else {
        initModal();
    }
})();
