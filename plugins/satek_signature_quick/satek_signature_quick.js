(function () {
    'use strict';

    var activeDialog = null;

    function initQuickSignature() {
        if (!window.rcmail || !rcmail.env || !rcmail.env.satek_sig_quick) {
            return;
        }

        var cfg = rcmail.env.satek_sig_quick;
        var labels = cfg.labels || {};
        var $toolbarBtn = $('#messagetoolbar a.signature').first();
        if (!$toolbarBtn.length || $toolbarBtn.data('satek-sig-ready')) {
            return;
        }
        $toolbarBtn.data('satek-sig-ready', true);

        // Build popover menu mirroring Elastic's #responses-menu
        var $menu = $('#satek-signature-menu');
        if (!$menu.length) {
            $menu = $('<div id="satek-signature-menu" class="popupmenu">');
            var $ul = $('<ul class="menu listing" role="menu">');
            $ul.append($('<li role="separator" class="separator">').append($('<label>').text(labels.insertsig_section || 'Insert signature')));
            $ul.append($('<ul id="satek-sig-list" class="rounded-0">'));
            $ul.append($('<li role="separator" class="separator">').append($('<label>').text(labels.managesig_section || 'Manage signatures')));
            $ul.append(
                $('<li role="menuitem">').append(
                    $('<a href="#satek-sig-config" class="satek-sig-manage active">').text(labels.configsig || 'Configure & edit signature')
                )
            );
            $menu.append($ul).appendTo(document.body);
        }

        function keepTriggerActive() {
            $toolbarBtn
                .addClass('satek-sig-trigger')
                .removeClass('disabled')
                .attr('aria-disabled', 'false')
                .attr('aria-haspopup', 'true');
        }

        function renderMenuItems() {
            var $list = $('#satek-sig-list');
            if (!$list.length) {
                return;
            }
            $list.empty();

            var sigs = rcmail.env.signatures || {};
            var currentIid = String($('[name="_from"]').val() || rcmail.env.identity || '');
            var count = 0;

            (cfg.identities || []).forEach(function (item) {
                var id = String(item.id);
                if (!sigs[id]) {
                    return;
                }
                count++;
                var $a = $('<a href="#insert-sig" class="satek-sig-item active">')
                    .attr('data-iid', id)
                    .text(item.label || id);
                if (id === currentIid) {
                    $a.addClass('is-current');
                }
                $list.append($('<li role="menuitem">').append($a));
            });

            if (count === 0) {
                $list.append(
                    $('<li role="menuitem">').append(
                        $('<a href="#no-sig" class="satek-sig-empty disabled" aria-disabled="true" tabindex="-1">')
                            .text(labels.nosigavailable || 'No signature configured')
                    )
                );
            }
        }

        function openSignatureModal() {
            var currentIid = String($('[name="_from"]').val() || rcmail.env.identity || '');
            var sep = cfg.modal_url.indexOf('?') > -1 ? '&' : '?';
            var src = cfg.modal_url + sep + '_compose=1' + (currentIid ? '&_iid=' + encodeURIComponent(currentIid) : '');
            var $iframe = $('<iframe>').attr({
                id: 'satek-sig-frame',
                src: src,
                title: labels.modaltitle || 'Signature settings'
            }).css({
                width: '100%',
                height: '100%',
                border: 0
            });

            activeDialog = rcmail.simple_dialog($iframe, labels.modaltitle || 'Signature settings', null, {
                cancel_button: 'close',
                height: 540,
                width: 580
            });
        }

        function insertSignatureById(iid) {
            var sigs = rcmail.env.signatures || {};
            if (!iid || !sigs[iid]) {
                return;
            }
            var $from = $('[name="_from"]');
            if ($from.length && String($from.val()) !== String(iid)) {
                $from.val(String(iid));
                rcmail.change_identity($from[0], true);
            } else if (rcmail.editor && typeof rcmail.editor.change_signature === 'function') {
                rcmail.editor.change_signature(String(iid), true);
                rcmail.display_message('siginserted', 'confirmation');
            } else if ($from.length) {
                rcmail.change_identity($from[0], true);
            }
            keepTriggerActive();
        }

        // Convert toolbar button into popover trigger (mirrors #responses-menu)
        document.body.classList.add('satek-sig-enabled');
        keepTriggerActive();
        renderMenuItems();

        $toolbarBtn.removeAttr('onclick').off('click');
        $toolbarBtn[0].addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }
            renderMenuItems();
            rcmail.command('menu-open', 'satek-signature-menu', this, e);
        }, true);

        // Prevent Roundcube's change_identity / enable_command from graying out the Signature menu button
        rcmail.addEventListener('change_identity', function () {
            keepTriggerActive();
            renderMenuItems();
        });
        rcmail.addEventListener('enable-command', function (p) {
            if (p && p.command === 'insert-sig') {
                setTimeout(keepTriggerActive, 0);
            }
        });
        setTimeout(keepTriggerActive, 120);

        // Delegated handlers cover both desktop popover & mobile cloned popover
        $(document).off('.sateksig')
            .on('click.sateksig', '#satek-signature-menu a.satek-sig-item, #satek-signature-menu-clone a.satek-sig-item', function (e) {
                e.preventDefault();
                var iid = $(this).attr('data-iid');
                rcmail.command('menu-close', 'satek-signature-menu', null, e);
                insertSignatureById(iid);
            })
            .on('click.sateksig', '#satek-signature-menu a.satek-sig-manage, #satek-signature-menu-clone a.satek-sig-manage', function (e) {
                e.preventDefault();
                rcmail.command('menu-close', 'satek-signature-menu', null, e);
                openSignatureModal();
            });

        // Realtime callback invoked from inside the modal iframe after server-confirmed save
        window.satekSignatureSync = function (data, insertNow) {
            if (!data) {
                return;
            }
            rcmail.env.signatures = data.signatures || {};
            if (data.prefs && typeof data.prefs.sig_below !== 'undefined') {
                rcmail.env.sig_below = !!data.prefs.sig_below;
            }
            if (Array.isArray(data.identities)) {
                cfg.identities = data.identities;
            }

            keepTriggerActive();
            renderMenuItems();

            if (insertNow) {
                if (activeDialog && typeof activeDialog.dialog === 'function') {
                    try {
                        activeDialog.dialog('close');
                    } catch (err) { /* ignore */ }
                }
                if (data.iid && rcmail.env.signatures[String(data.iid)]) {
                    insertSignatureById(String(data.iid));
                } else if (data.message) {
                    rcmail.display_message(data.message, 'confirmation');
                }
            }
        };
    }

    if (window.rcmail) {
        window.rcmail.addEventListener('init', initQuickSignature);
    }
})();
