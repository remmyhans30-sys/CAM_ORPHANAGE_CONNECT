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

// Mock accounts (localStorage) — donor/orphanage roles have no backend yet.
const USERS_KEY = 'cocUsers';
const SESSION_KEY = 'cocSession';

function getUsers() {
    try {
        return JSON.parse(window.localStorage.getItem(USERS_KEY)) || [];
    } catch (err) {
        return [];
    }
}

function saveUsers(users) {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function destinationForRole(role) {
    if (role === 'admin') return '../admin/index.html';
    if (role === 'volunteer') return '../orphanage/index.html';
    return '../donor/index.html';
}

function startSession(user, remember) {
    const store = remember ? window.localStorage : window.sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify({ fullname: user.fullname, email: user.email, role: user.role }));
}

function showFormError(box, message) {
    box.textContent = message;
    box.classList.add('show');
}

function hideFormError(box) {
    box.classList.remove('show');
}

// Login form
const loginForm = document.querySelector('.login-form');
const loginError = document.getElementById('login-error');

if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember-me').checked;

        if (!email || !password) {
            showFormError(loginError, 'Please enter both email and password.');
            return;
        }

        const user = getUsers().find(function (u) {
            return u.email === email && u.password === password;
        });

        if (!user) {
            showFormError(loginError, 'Invalid email or password.');
            return;
        }

        hideFormError(loginError);
        startSession(user, remember);
        window.location.href = destinationForRole(user.role);
    });
}

// Register form
const registerForm = document.querySelector('.register-form');
const registerError = document.getElementById('register-error');

if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const fullname = document.getElementById('fullname').value.trim();
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const roleInput = registerForm.querySelector('input[name="role"]:checked');

        if (!fullname || !email || !password || !confirmPassword) {
            showFormError(registerError, 'Please fill in all fields.');
            return;
        }
        if (!roleInput) {
            showFormError(registerError, 'Please choose what you are registering as.');
            return;
        }
        if (password !== confirmPassword) {
            showFormError(registerError, 'Passwords do not match.');
            return;
        }
        if (password.length < 6) {
            showFormError(registerError, 'Password must be at least 6 characters.');
            return;
        }

        const users = getUsers();
        if (users.some(function (u) { return u.email === email; })) {
            showFormError(registerError, 'An account with this email already exists.');
            return;
        }

        const user = { fullname: fullname, email: email, password: password, role: roleInput.value };
        users.push(user);
        saveUsers(users);

        hideFormError(registerError);
        startSession(user, true);
        window.location.href = destinationForRole(user.role);
    });
}
