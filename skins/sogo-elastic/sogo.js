/**
 * SOGo Elastic skin enhancements (inherits Elastic UI).
 * - Replaces Roundcube logo with sleek SOGo user card & date widget in desktop topbar/sidebar
 * - Adds a single green circular Compose FAB inside #layout-list on desktop mail view
 * - Automatically opens the HTML Rich Text Editor (TinyMCE) when composing a new message
 * - Syncs dark-mode state into the empty watermark iframe
 */
(function () {
    'use strict';

    function initSogoSkin() {
        var html = document.documentElement;
        var body = document.body;

        if (!body || html.classList.contains('iframe') || body.classList.contains('task-login')) {
            return;
        }

        var layoutMenu = document.getElementById('layout-menu');
        var sidebar = document.querySelector('#layout-sidebar:not(.sidebar-right)');

        // 1. Sleek SOGo-style user badge + date block in topbar (#layout-menu)
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

        // 4. Auto-open Rich Text Editor (TinyMCE) on Compose screen (once per load)
        if (body.classList.contains('task-mail') && body.classList.contains('action-compose')) {
            var autoEnableRichEditor = function () {
                var textarea = document.getElementById('composebody');
                if (!textarea || textarea.readOnly || textarea.disabled) {
                    return;
                }
                var parent = textarea.parentElement;
                if (!parent || parent.classList.contains('ishtml') || parent.dataset.sogoEditorInit) {
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
            };

            if (window.rcmail && typeof window.rcmail.addEventListener === 'function') {
                window.rcmail.addEventListener('init', function () {
                    setTimeout(autoEnableRichEditor, 60);
                });
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
