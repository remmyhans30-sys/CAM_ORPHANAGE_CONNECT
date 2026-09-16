document.querySelectorAll('.toggle-password').forEach(function (btn) {
    btn.addEventListener('click', function () {
        const input = document.getElementById(this.dataset.target);
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';

        const icon = this.querySelector('i');
        if (icon) {
            icon.classList.toggle('bi-eye');
            icon.classList.toggle('bi-eye-slash');
        } else {
            this.textContent = isHidden ? 'Hide' : 'Show';
        }
    });
});
