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

// Accounts live in the backend (server/). Start it with `npm start` inside server/.
const API_BASE = 'http://localhost:4000/api/users';
const SESSION_KEY = 'cocSession';

function destinationForRole(role) {
    if (role === 'volunteer') return '../orphanage/index.html';
    return '../donor/index.html';
}

function startSession(user, token, remember) {
    const store = remember ? window.localStorage : window.sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify({ fullname: user.fullname, email: user.email, role: user.role, token: token }));
}

function showFormError(box, message) {
    box.textContent = message;
    box.classList.add('show');
}

function hideFormError(box) {
    box.classList.remove('show');
}

function setLoading(form, loading) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = loading;
    button.style.opacity = loading ? '0.7' : '';
}

async function postJson(path, body) {
    let response;
    try {
        response = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new Error('Cannot reach the server. Please make sure it is running and try again.');
    }

    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    return data;
}

// Login form
const loginForm = document.querySelector('.login-form');
const loginError = document.getElementById('login-error');

if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const remember = document.getElementById('remember-me').checked;

        if (!email || !password) {
            showFormError(loginError, 'Please enter both email and password.');
            return;
        }

        hideFormError(loginError);
        setLoading(loginForm, true);
        try {
            const data = await postJson('/login', { email: email, password: password });
            startSession(data.user, data.token, remember);
            window.location.href = destinationForRole(data.user.role);
        } catch (err) {
            showFormError(loginError, err.message);
            setLoading(loginForm, false);
        }
    });
}

// Register form
const registerForm = document.querySelector('.register-form');
const registerError = document.getElementById('register-error');

if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
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

        hideFormError(registerError);
        setLoading(registerForm, true);
        try {
            const data = await postJson('/register', { fullname: fullname, email: email, password: password, role: roleInput.value });
            startSession(data.user, data.token, true);
            window.location.href = destinationForRole(data.user.role);
        } catch (err) {
            showFormError(registerError, err.message);
            setLoading(registerForm, false);
        }
    });
}

// Forgot password form
const forgotForm = document.querySelector('.forgot-password-form');
const forgotError = document.getElementById('forgot-error');
const forgotSuccess = document.getElementById('forgot-success');

if (forgotForm) {
    forgotForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        forgotSuccess.classList.remove('show');

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showFormError(forgotError, 'Please enter a valid email address.');
            return;
        }

        hideFormError(forgotError);
        setLoading(forgotForm, true);
        try {
            const data = await postJson('/forgot-password', { email: email });
            forgotSuccess.textContent = data.message;
            forgotSuccess.classList.add('show');
            forgotForm.reset();
        } catch (err) {
            showFormError(forgotError, err.message);
        }
        setLoading(forgotForm, false);
    });
}
