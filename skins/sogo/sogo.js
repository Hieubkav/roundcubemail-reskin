/**
 * Satek skin enhancements (inherits Elastic UI).
 * - Replaces Roundcube logo with sleek SOGo user card & date widget in desktop topbar/sidebar
 * - Adds a single green circular Compose FAB inside #layout-list on desktop mail view
 * - Automatically opens the HTML Rich Text Editor (TinyMCE) when composing a new message
 * - Syncs dark-mode state into the empty watermark iframe
 */
(function () {
    'use strict';

    try {
        document.cookie = 'rc_skin=sogo;path=/;max-age=31536000;samesite=lax';
    } catch (e) { /* ignore */ }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function decodeEntities(str) {
        return String(str)
            .replace(/&nbsp;/g, ' ')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    // Max quoted lines shown before collapsing (long quotes like cPanel notices).
    var SOGO_QUOTE_PREVIEW_LINES = 8;
    var SOGO_QUOTE_PREVIEW_CHARS = 1200;

    function replyPlaceholderText() {
        var lang = (document.documentElement.getAttribute('lang') || navigator.language || 'vi').toLowerCase();
        return lang.indexOf('vi') === 0 ? 'Nhập nội dung trả lời tại đây...' : 'Type your reply here...';
    }

    function inboxShortcutLabel() {
        var lang = (document.documentElement.getAttribute('lang') || navigator.language || 'vi').toLowerCase();
        return lang.indexOf('vi') === 0 ? 'Về Hộp thư' : 'Back to Inbox';
    }

    function quoteToggleText(expanded) {
        var lang = (document.documentElement.getAttribute('lang') || navigator.language || 'vi').toLowerCase();
        if (lang.indexOf('vi') === 0) {
            return expanded ? '— Thu gọn nội dung trích dẫn —' : '... Hiển thị nội dung trích dẫn ...';
        }
        return expanded ? '— Collapse quoted message —' : '... Show quoted message ...';
    }

    function makeQuoteToggle(editor, quote) {
        var btn = editor.dom.create('button', {
            'type': 'button',
            'class': 'sogo-quote-toggle',
            'contenteditable': 'false',
            'data-mce-bogus': '1'
        });
        btn.textContent = quoteToggleText(false);
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var collapsed = quote.classList.toggle('sogo-collapsed');
            btn.textContent = quoteToggleText(!collapsed);
            try { editor.nodeChanged(); } catch (err) { }
        });
        return btn;
    }

    function collapseLongQuote(editor, quote) {
        if (!quote || quote.getAttribute('data-sogo-collapse') === '1') {
            return;
        }
        quote.setAttribute('data-sogo-collapse', '1');
        var textLen = (quote.textContent || '').replace(/\s+/g, ' ').length;
        var blocks = quote.querySelectorAll('p, div, li');
        if (textLen < SOGO_QUOTE_PREVIEW_CHARS && blocks.length <= SOGO_QUOTE_PREVIEW_LINES + 2) {
            return;
        }
        quote.classList.add('sogo-quote', 'sogo-collapsed');
        var toggle = makeQuoteToggle(editor, quote);
        quote.parentNode.insertBefore(toggle, quote.nextSibling);
    }

    // Expand collapsed quotes + drop helper buttons so sent mail keeps full quote.
    function expandQuotesForSend(bodyEl) {
        var toggles = bodyEl.querySelectorAll('.sogo-quote-toggle');
        for (var i = 0; i < toggles.length; i++) {
            if (toggles[i].parentNode) {
                toggles[i].parentNode.removeChild(toggles[i]);
            }
        }
        var quotes = bodyEl.querySelectorAll('blockquote.sogo-collapsed');
        for (var q = 0; q < quotes.length; q++) {
            quotes[q].classList.remove('sogo-collapsed');
        }
    }

    function armQuoteExpandOnSend(editor) {
        var bodyEl = editor.getBody();
        if (!bodyEl || bodyEl.getAttribute('data-sogo-send-armed') === '1') {
            return;
        }
        bodyEl.setAttribute('data-sogo-send-armed', '1');
        var form = document.querySelector('form');
        if (form && form.addEventListener) {
            form.addEventListener('submit', function () {
                expandQuotesForSend(editor.getBody());
                try { editor.save(); } catch (e) { }
            });
        }
    }

    function makeEmptyEditorParagraph(editor, cls) {
        var p = editor.dom.create('p', cls ? { 'class': cls } : {});
        p.innerHTML = '<br data-mce-bogus="1">';
        return p;
    }

    function isNodeEmptyLine(node) {
        if (!node) {
            return false;
        }
        if (node.nodeType === 3) {
            return !node.nodeValue || !node.nodeValue.replace(/\u00a0|\s+/g, '');
        }
        if (node.nodeName === 'BR') {
            return true;
        }
        if (node.nodeName === 'P' || node.nodeName === 'DIV') {
            if (node.querySelector('img, table, blockquote, hr, iframe')) {
                return false;
            }
            return !(node.textContent || '').replace(/\u00a0|\s+/g, '');
        }
        return false;
    }

    function ensureReplyLeadingLines(editor, bodyEl, count) {
        while (bodyEl.firstChild && isNodeEmptyLine(bodyEl.firstChild)) {
            bodyEl.removeChild(bodyEl.firstChild);
        }
        var anchor = bodyEl.firstChild;
        for (var idx = 0; idx < count; idx++) {
            var cls = idx === 0 ? 'sogo-reply-start' : 'sogo-reply-spacer';
            var line = makeEmptyEditorParagraph(editor, cls);
            if (anchor) {
                bodyEl.insertBefore(line, anchor);
            } else {
                bodyEl.appendChild(line);
            }
        }
        return bodyEl.querySelector('.sogo-reply-start') || bodyEl.firstChild;
    }

    function beautifyComposeQuote() {
        var tm = window.tinymce;
        var editor = tm && tm.get ? tm.get('composebody') : null;
        if (!editor || !editor.initialized || !editor.getBody) {
            return false;
        }
        var bodyEl = editor.getBody();
        if (!bodyEl) {
            return false;
        }
        if (bodyEl.getAttribute('data-sogo-quote') === '1') {
            armQuoteExpandOnSend(editor);
            return true;
        }

        var intro = bodyEl.querySelector('#reply-intro, .sogo-reply-intro');
        var quotes = bodyEl.querySelectorAll('blockquote');
        var pre = bodyEl.querySelector('div.pre');
        var bodyText = (bodyEl.textContent || '').trim();
        var isForwardHtml = !intro && !quotes.length && !pre && /-{4,}/.test(bodyText);

        if (!intro && !quotes.length && !pre && !isForwardHtml) {
            bodyEl.setAttribute('data-sogo-quote', '1');
            armQuoteExpandOnSend(editor);
            return true;
        }

        if (pre && !quotes.length) {
            var chunks = pre.innerHTML.replace(/\r/g, '').split(/<br\s*\/?>/i);
            var introText = '';
            var quoteLines = [];
            var i;
            for (i = 0; i < chunks.length; i++) {
                var decoded = decodeEntities(chunks[i]).replace(/^\s+|\s+$/g, '');
                if (!decoded) {
                    continue;
                }
                var m = decoded.match(/^(>+)\s?(.*)$/);
                if (m) {
                    quoteLines.push(m[2]);
                } else if (!quoteLines.length) {
                    introText += (introText ? ' ' : '') + decoded;
                } else {
                    quoteLines.push(decoded);
                }
            }

            if (quoteLines.length) {
                var html = '';
                if (introText) {
                    var label = /[:：]$/.test(introText) ? introText : (introText + ':');
                    html += '<p class="sogo-reply-intro">' + escapeHtml(label) + '</p>';
                }
                html += '<blockquote class="sogo-quote">';
                for (i = 0; i < quoteLines.length; i++) {
                    html += '<p>' + (quoteLines[i] ? escapeHtml(quoteLines[i]) : '<br>') + '</p>';
                }
                html += '</blockquote>';

                var wrap = editor.dom.create('div');
                wrap.innerHTML = html;
                pre.parentNode.insertBefore(wrap, pre);
                pre.parentNode.removeChild(pre);
                while (wrap.firstChild) {
                    wrap.parentNode.insertBefore(wrap.firstChild, wrap);
                }
                wrap.parentNode.removeChild(wrap);
            }
        } else {
            if (intro) {
                intro.classList.add('sogo-reply-intro');
            }
            for (var q = 0; q < quotes.length; q++) {
                quotes[q].classList.add('sogo-quote');
            }
        }

        var firstLine = ensureReplyLeadingLines(editor, bodyEl, 2);

        var built = bodyEl.querySelectorAll('blockquote');
        for (var b = 0; b < built.length; b++) {
            collapseLongQuote(editor, built[b]);
        }

        bodyEl.setAttribute('data-sogo-quote', '1');
        armQuoteExpandOnSend(editor);
        if (firstLine && editor.selection) {
            editor.selection.setCursorLocation(firstLine, 0);
            editor.focus();
        }
        return true;
    }

    function initSogoSkin() {
        var html = document.documentElement;
        var body = document.body;

        if (!body || html.classList.contains('iframe') || body.classList.contains('task-login')) {
            return;
        }

        var layoutMenu = document.getElementById('layout-menu');
        var sidebar = document.querySelector('#layout-sidebar:not(.sidebar-right)');

        // 1. Unified sidebar header + date block in topbar (#layout-menu)
        // - Mail: disabled Mail icon button top-left + account email below
        // - Contacts/Settings: compact topbar-aligned Mail return button (no section title/avatar clutter)
        var sideTitle = document.querySelector('#layout-sidebar:not(.sidebar-right) > .header .header-title');
        if (sideTitle) {
            var sidebarHdr = sideTitle.parentElement;
            var isMailTask = body.classList.contains('task-mail') || sideTitle.classList.contains('username');
            if (sideTitle.classList.contains('username') && !sideTitle.querySelector('.sogo-username-text')) {
                var fullTitle = sideTitle.textContent.trim();
                sideTitle.setAttribute('title', fullTitle);
                sideTitle.innerHTML = '';
                var uIcon = document.createElement('span');
                uIcon.className = 'sogo-username-icon';
                uIcon.setAttribute('aria-hidden', 'true');
                var uText = document.createElement('span');
                uText.className = 'sogo-username-text';
                uText.setAttribute('title', fullTitle);
                var atIdx = fullTitle.indexOf('@');
                if (atIdx > 0) {
                    uText.appendChild(document.createTextNode(fullTitle.slice(0, atIdx)));
                    uText.appendChild(document.createElement('wbr'));
                    uText.appendChild(document.createTextNode(fullTitle.slice(atIdx)));
                } else {
                    uText.textContent = fullTitle;
                }
                sideTitle.appendChild(uIcon);
                sideTitle.appendChild(uText);
            }
            if (sidebarHdr) {
                sidebarHdr.classList.add(isMailTask ? 'sogo-has-usercard' : 'sogo-compact-nav');
                if (!sidebarHdr.querySelector('.sogo-sidebar-mail-btn')) {
                    var mailBtn = document.createElement('a');
                    var mailLabel = inboxShortcutLabel();
                    mailBtn.className = 'sogo-sidebar-mail-btn' + (isMailTask ? ' is-disabled' : '');
                    mailBtn.href = '?_task=mail&_mbox=INBOX';
                    mailBtn.setAttribute('title', mailLabel);
                    mailBtn.setAttribute('aria-label', mailLabel);
                    if (isMailTask) {
                        mailBtn.setAttribute('aria-disabled', 'true');
                        mailBtn.setAttribute('tabindex', '-1');
                        mailBtn.addEventListener('click', function (e) {
                            e.preventDefault();
                        });
                    } else {
                        var mailText = document.createElement('span');
                        mailText.className = 'sogo-mail-btn-label';
                        mailText.textContent = mailLabel;
                        mailBtn.appendChild(mailText);
                    }
                    sidebarHdr.insertBefore(mailBtn, sidebarHdr.firstChild);
                }
            }
        }
        if (layoutMenu && !layoutMenu.querySelector('.sogo-topbar-date')) {
            var userBadge = document.createElement('a');
            userBadge.className = 'sogo-topbar-user';
            userBadge.href = '?_task=settings';
            userBadge.setAttribute('title', 'Settings');
            userBadge.setAttribute('aria-label', 'Account settings');

            var now = new Date();
            var lang = (html.getAttribute('lang') || navigator.language || 'vi').toLowerCase();
            var locale = lang.indexOf('vi') === 0 ? 'vi-VN' : lang;
            var weekday = '';
            var monthYear = '';

            try {
                weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now);
                monthYear = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
                weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
                monthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
            } catch (e) {
                weekday = now.toDateString().slice(0, 3);
                monthYear = (now.getMonth() + 1) + '/' + now.getFullYear();
            }

            var dateEl = document.createElement('div');
            dateEl.className = 'sogo-topbar-date';
            dateEl.setAttribute('aria-hidden', 'true');
            dateEl.innerHTML =
                '<div class="sogo-date-day"></div>' +
                '<div class="sogo-date-meta">' +
                    '<span class="sogo-date-weekday"></span>' +
                    '<span class="sogo-date-monthyear"></span>' +
                '</div>';

            dateEl.querySelector('.sogo-date-day').textContent = String(now.getDate());
            dateEl.querySelector('.sogo-date-weekday').textContent = weekday;
            dateEl.querySelector('.sogo-date-monthyear').textContent = monthYear;

            var popHeader = layoutMenu.querySelector('.popover-header');
            var insertBeforeNode = popHeader ? popHeader.nextSibling : layoutMenu.firstChild;
            layoutMenu.insertBefore(userBadge, insertBeforeNode);
            layoutMenu.insertBefore(dateEl, insertBeforeNode);
        }

        // 2. Docked SOGo teal sidebar card (>= 1201px when #layout-sidebar is on the left)
        if (sidebar && !body.classList.contains('action-compose')) {
            body.classList.add('sogo-docked-sidebar');

            var sidebarHeader = sidebar.querySelector(':scope > .header');
            if (sidebarHeader && !sidebarHeader.querySelector('.sogo-sidebar-settings')) {
                var settingsLink = document.createElement('a');
                settingsLink.className = 'button icon sogo-sidebar-settings';
                settingsLink.href = '?_task=settings';
                settingsLink.setAttribute('title', 'Settings');
                settingsLink.setAttribute('aria-label', 'Settings');
                sidebarHeader.appendChild(settingsLink);
            }

            var syncTopbarOffset = function () {
                if (!layoutMenu) {
                    return;
                }
                if (window.innerWidth >= 1201 && sidebar.offsetWidth > 0) {
                    layoutMenu.style.setProperty('padding-left', (sidebar.offsetWidth + 16) + 'px', 'important');
                } else {
                    layoutMenu.style.removeProperty('padding-left');
                }
            };

            syncTopbarOffset();
            window.addEventListener('resize', syncTopbarOffset);
            if (typeof ResizeObserver === 'function') {
                new ResizeObserver(syncTopbarOffset).observe(sidebar);
            }
        }

        // 3. Green circular Compose FAB inside #layout-list (desktop mail view only, no duplicate)
        var layoutList = document.getElementById('layout-list');
        var isMailList = body.classList.contains('task-mail') && body.classList.contains('action-none');

        if (isMailList && layoutList && !layoutList.querySelector('.sogo-fab-compose')) {
            var origCompose = document.querySelector('#taskmenu a.compose');
            var label = (origCompose && (origCompose.getAttribute('title') || origCompose.textContent.trim())) || 'Compose';

            var fab = document.createElement('a');
            fab.href = '#compose';
            fab.className = 'sogo-fab-compose';
            fab.setAttribute('title', label);
            fab.setAttribute('aria-label', label);
            fab.setAttribute('role', 'button');
            fab.addEventListener('click', function (e) {
                e.preventDefault();
                if (window.rcmail && typeof window.rcmail.command === 'function') {
                    window.rcmail.command('compose', '', this, e);
                } else if (origCompose) {
                    origCompose.click();
                }
            });

            layoutList.appendChild(fab);
            body.classList.add('sogo-has-fab');
        }

        // 3b. Quick Inbox FAB on right corner (Compose, Contacts, Settings, non-INBOX folders)
        if (window.location.search.indexOf('_extwin=1') === -1 && !document.querySelector('.sogo-fab-inbox')) {
            var inboxFab = document.createElement('a');
            var inboxLabel = inboxShortcutLabel();
            inboxFab.href = '?_task=mail&_mbox=INBOX';
            inboxFab.className = 'sogo-fab-inbox';
            inboxFab.setAttribute('title', inboxLabel);
            inboxFab.setAttribute('aria-label', inboxLabel);
            inboxFab.setAttribute('role', 'button');

            var syncInboxFabVisibility = function () {
                var onMailList = body.classList.contains('task-mail') && body.classList.contains('action-none');
                var mbox = window.rcmail && window.rcmail.env ? window.rcmail.env.mailbox : null;
                var inInbox = false;
                if (onMailList) {
                    if (mbox) {
                        inInbox = (mbox === 'INBOX');
                    } else {
                        var qs = window.location.search;
                        inInbox = qs.indexOf('_mbox=') === -1 || /[?&]_mbox=INBOX(?:&|$)/.test(qs);
                    }
                }
                inboxFab.classList.toggle('sogo-fab-hidden', inInbox);
            };

            syncInboxFabVisibility();
            body.appendChild(inboxFab);

            if (window.rcmail && typeof window.rcmail.addEventListener === 'function') {
                window.rcmail.addEventListener('init', syncInboxFabVisibility);
                window.rcmail.addEventListener('listupdate', syncInboxFabVisibility);
                window.rcmail.addEventListener('selectfolder', syncInboxFabVisibility);
            }
        }

        // 4. Auto-open Rich Text Editor (TinyMCE) on Compose screen (once per load)
        if (body.classList.contains('task-mail') && body.classList.contains('action-compose')) {
            var scheduleQuoteBeautify = function () {
                var tries = 0;
                var waitEditor = function () {
                    if (beautifyComposeQuote() || ++tries > 50) {
                        return;
                    }
                    setTimeout(waitEditor, 80);
                };
                setTimeout(waitEditor, 60);
            };

            var autoEnableRichEditor = function () {
                var textarea = document.getElementById('composebody');
                if (!textarea || textarea.readOnly || textarea.disabled) {
                    return;
                }
                var parent = textarea.parentElement;
                if (!parent) {
                    return;
                }
                if (parent.classList.contains('ishtml')) {
                    scheduleQuoteBeautify();
                    return;
                }
                if (parent.dataset.sogoEditorInit) {
                    return;
                }
                parent.dataset.sogoEditorInit = '1';

                // Skip Roundcube's "switching editor may lose formatting" confirm
                // (auto-enable HTML is a skin default, not a user toggle).
                if (window.rcmail && window.rcmail.env) {
                    window.rcmail.env.editor_warned = true;
                }

                var htmlBtn = parent.querySelector('a.mce-i-html');
                if (htmlBtn) {
                    htmlBtn.click();
                } else if (window.rcmail && typeof window.rcmail.command === 'function') {
                    if (window.rcmail.command('toggle-editor', { id: textarea.id, html: true })) {
                        parent.classList.add('ishtml');
                    }
                }

                scheduleQuoteBeautify();
            };

            if (window.rcmail && typeof window.rcmail.addEventListener === 'function') {
                window.rcmail.addEventListener('init', function () {
                    setTimeout(autoEnableRichEditor, 60);
                });
                window.rcmail.addEventListener('editor-init', scheduleQuoteBeautify);
                window.rcmail.addEventListener('editor-load', scheduleQuoteBeautify);
            }
            setTimeout(autoEnableRichEditor, 180);
        }

        // 5. Keep empty watermark iframe dark-mode class in sync when toggling theme
        if (typeof MutationObserver === 'function') {
            new MutationObserver(function () {
                var dark = html.classList.contains('dark-mode');
                var frames = document.querySelectorAll('#layout-content iframe');
                for (var i = 0; i < frames.length; i++) {
                    try {
                        var doc = frames[i].contentDocument;
                        if (doc && doc.querySelector('.sogo-empty-icon')) {
                            doc.documentElement.classList.toggle('dark-mode', dark);
                        }
                    } catch (e) { }
                }
            }).observe(html, { attributes: true, attributeFilter: ['class'] });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSogoSkin);
    } else {
        initSogoSkin();
    }
})();
