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
    });
}
