(function () {
    'use strict';

    var activeDialog = null;

    function initQuickSignature() {
        if (!window.rcmail || !rcmail.env || !rcmail.env.satek_sig_quick) {
            return;
        }

        var cfg = rcmail.env.satek_sig_quick;
        var labels = cfg.labels || {};
        // Note: Elastic's UI.toolbar_init() replaces #messagetoolbar with ul#toolbar-menu before rcmail.init()
        var $toolbarBtn = $('#toolbar-menu a.signature, #messagetoolbar a.signature, #layout-content .header a.signature').first();
        if (!$toolbarBtn.length || $toolbarBtn.data('satek-sig-ready')) {
            return;
        }
        $toolbarBtn.data('satek-sig-ready', true);

        // Detach this button from Roundcube's insert-sig button registry so enable_command('insert-sig', false)
        // never re-adds .disabled / aria-disabled="true" / tabindex="-1"
        var btnId = $toolbarBtn.attr('id');
        if (btnId && rcmail.buttons && Array.isArray(rcmail.buttons['insert-sig'])) {
            rcmail.buttons['insert-sig'] = rcmail.buttons['insert-sig'].filter(function (b) {
                return b && b.id !== btnId;
            });
        }

        // Build popover menu mirroring Elastic's #responses-menu (flat <li> items under ul.menu.listing)
        var $menu = $('#satek-signature-menu');
        var $ul;
        if (!$menu.length) {
            $menu = $('<div id="satek-signature-menu" class="popupmenu">');
            $ul = $('<ul class="menu listing" role="menu">');
            $ul.append($('<li role="separator" class="separator satek-sig-insert-sep">').append($('<label>').text(labels.insertsig_section || 'Insert signature')));
            $ul.append($('<li role="separator" class="separator satek-sig-manage-sep">').append($('<label>').text(labels.managesig_section || 'Manage signatures')));
            $ul.append(
                $('<li role="menuitem">').append(
                    $('<a href="#satek-sig-config" class="satek-sig-manage active">').text(labels.configsig || 'Configure & edit signature')
                )
            );
            $menu.append($ul).appendTo(document.body);
        } else {
            $ul = $menu.children('ul.menu');
        }

        function keepTriggerActive() {
            $toolbarBtn
                .addClass('signature satek-sig-trigger')
                .removeClass('disabled')
                .attr({
                    'aria-disabled': 'false',
                    'aria-haspopup': 'true',
                    tabindex: '2'
                });
            if ($toolbarBtn[0]) {
                $toolbarBtn[0].onclick = null;
            }
            $toolbarBtn.removeAttr('onclick');
        }

        function renderMenuItems() {
            var $manageSep = $ul.children('li.satek-sig-manage-sep');
            if (!$ul.length || !$manageSep.length) {
                return;
            }
            $ul.children('li.satek-sig-dynamic').remove();

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
                $('<li role="menuitem" class="satek-sig-dynamic">').append($a).insertBefore($manageSep);
            });

            if (count === 0) {
                $('<li role="menuitem" class="satek-sig-dynamic">').append(
                    $('<a href="#no-sig" class="satek-sig-empty disabled" aria-disabled="true" tabindex="-1">')
                        .text(labels.nosigavailable || 'No signature configured')
                ).insertBefore($manageSep);
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

        function closeSignatureMenu() {
            try {
                $toolbarBtn.popover('hide');
            } catch (err) { /* ignore */ }
        }

        // Convert toolbar button into an Elastic native popup trigger (identical to #responses-menu)
        document.body.classList.add('satek-sig-enabled');
        keepTriggerActive();
        renderMenuItems();

        $toolbarBtn
            .attr({
                href: '#satek-signature',
                'data-popup': 'satek-signature-menu',
                'data-popup-pos': 'bottom'
            })
            .data('popup', 'satek-signature-menu')
            .data('popup-pos', 'bottom')
            .off('click');

        if (window.UI && typeof window.UI.popup_init === 'function') {
            window.UI.popup_init($toolbarBtn[0]);
            $toolbarBtn
                .on('show.bs.popover.sateksig', function () {
                    renderMenuItems();
                })
                .on('click.sateksig', function (e) {
                    e.preventDefault();
                });
        } else {
            // Non-Elastic fallback
            $toolbarBtn.on('click.sateksig', function (e) {
                e.preventDefault();
                e.stopPropagation();
                renderMenuItems();
                rcmail.triggerEvent('menu-open', {
                    event: 'menu-open',
                    name: 'satek-signature-menu',
                    obj: $menu,
                    props: { link: this },
                    originalEvent: e
                });
            });
        }

        // Refresh menu items when identity changes
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
                closeSignatureMenu();
                insertSignatureById(iid);
            })
            .on('click.sateksig', '#satek-signature-menu a.satek-sig-manage, #satek-signature-menu-clone a.satek-sig-manage', function (e) {
                e.preventDefault();
                closeSignatureMenu();
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
