if (window.rcmail) {
    rcmail.addEventListener('init', function () {
        var form = document.getElementById('login-form');
        if (!form || !rcmail.env.satek_reset_title) {
            return;
        }

        form.classList.add('satek-reset-form');
        form.setAttribute('data-skin', rcmail.env.skin || '');

        if (!form.querySelector('.satek-reset-title')) {
            var title = document.createElement('div');
            title.className = 'satek-reset-title';
            title.textContent = rcmail.env.satek_reset_title;
            form.insertBefore(title, form.firstChild);
        }

        $('#login-form.satek-reset-form td.input').each(function () {
            var $td = $(this);
            if ($td.children('.satek-field').length) {
                return;
            }

            var $input = $td.find('input,select').first();
            if (!$input.length) {
                return;
            }

            $td.siblings('td.title').hide();

            var iconName = $input.data('icon') || 'pass';
            if (iconName === 'lock') {
                iconName = 'pass';
            }

            var $wrap = $('<div class="input-group input-group-lg satek-field">');
            var $icon = $('<i>').attr('class', 'input-group-text icon ' + iconName);
            $wrap.append($('<span class="input-group-prepend">').append($icon));
            $td.children('.input-group-prepend').remove();
            $input.addClass('form-control');
            $wrap.append($input);
            $td.removeClass('input-group').empty().append($wrap);
        });
    });
}
