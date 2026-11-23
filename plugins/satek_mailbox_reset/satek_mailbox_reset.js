if (window.rcmail) {
    rcmail.addEventListener('init', function () {
        var form = document.getElementById('login-form');
        if (!form || !rcmail.env.satek_reset_title) {
            return;
        }

        form.classList.add('satek-reset-form');

        if (!form.querySelector('.satek-reset-title')) {
            var title = document.createElement('div');
            title.className = 'satek-reset-title';
            title.textContent = rcmail.env.satek_reset_title;
            form.insertBefore(title, form.firstChild);
        }

        $('#login-form table tr').each(function () {
            var input = $('input,select', this);
            var label = $('label', this);
            if (!input.length) {
                return;
            }
            if (this.querySelector('.input-group')) {
                return;
            }

            var iconClass = input.data('icon') || String(input.attr('name') || '').replace(/_/g, '');
            var icon = $('<i>').attr('class', 'input-group-text icon ' + iconClass);
            label.parent().css('display', 'none');
            input.addClass('form-control')
                .attr('placeholder', label.text() || input.attr('placeholder') || '')
                .before($('<span class="input-group-prepend">').append(icon))
                .parent().addClass('input-group input-group-lg');
            $(this).addClass('form-group row');
        });
    });
}
