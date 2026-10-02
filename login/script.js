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
// Local copies talk to the server on this computer; the live site uses its own address.
const API_ROOT = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api';
const API_BASE = API_ROOT + '/users';
const PARTNER_API = API_ROOT + '/partner-auth';
const SESSION_KEY = 'cocSession';

function destinationForRole(role, isNewAccount) {
    if (role === 'volunteer') return '../orphanage/index.html';
    return isNewAccount ? '../donor/profile.html' : '../donor/index.html';
}

// The partner portal reads its own login keys, so partners are stored the way it expects.
function startPartnerSession(partner, token) {
    window.localStorage.setItem('partnerToken', token);
    window.localStorage.setItem('partnerEmail', partner.email);
}

function destinationForPartner(partner) {
    return partner.verificationStatus === 'draft' ? '../partner/profile.html' : '../partner/dashboard.html';
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

async function postJson(path, body, base) {
    let response;
    try {
        response = await fetch((base || API_BASE) + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new Error('Cannot reach the server. Please make sure it is running and try again.');
    }

    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
        const error = new Error(data.error || 'Something went wrong. Please try again.');
        error.status = response.status;
        throw error;
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
            let data;
            try {
                data = await postJson('/login', { email: email, password: password });
            } catch (err) {
                // Not a donor or orphanage account: partners have their own accounts.
                if (err.status !== 401) throw err;
                const partnerData = await postJson('/login', { email: email, password: password }, PARTNER_API);
                startPartnerSession(partnerData.partner, partnerData.token);
                window.location.href = destinationForPartner(partnerData.partner);
                return;
            }
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
    const NAME_LABELS = { user: 'Your full name', volunteer: 'Orphanage name', partner: 'Organization name' };
    registerForm.querySelectorAll('input[name="role"]').forEach(function (radio) {
        radio.addEventListener('change', function () {
            document.getElementById('fullname').placeholder = NAME_LABELS[radio.value];
        });
    });

    // Links from the public pages preselect the account type: register.html?role=user|volunteer|partner
    const presetRadio = registerForm.querySelector('input[name="role"][value="' + (new URLSearchParams(window.location.search).get('role') || '') + '"]');
    if (presetRadio) {
        presetRadio.checked = true;
        document.getElementById('fullname').placeholder = NAME_LABELS[presetRadio.value];
    }
}

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
        if (!document.getElementById('accept-terms').checked) {
            showFormError(registerError, 'Please confirm that you are 18 or older and agree to the terms of use.');
            return;
        }

        hideFormError(registerError);
        setLoading(registerForm, true);
        try {
            if (roleInput.value === 'partner') {
                const partnerData = await postJson('/register', { name: fullname, email: email, password: password, acceptTerms: true }, PARTNER_API);
                startPartnerSession(partnerData.partner, partnerData.token);
                window.location.href = '../partner/profile.html';
                return;
            }
            const data = await postJson('/register', { fullname: fullname, email: email, password: password, role: roleInput.value, acceptTerms: true });
            startSession(data.user, data.token, true);
            window.location.href = destinationForRole(data.user.role, true);
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

// Reset password form (the page opened from the link in the email)
const resetForm = document.querySelector('.reset-password-form');
if (resetForm) {
    const resetError = document.getElementById('reset-error');
    const resetSuccess = document.getElementById('reset-success');
    const resetToken = new URLSearchParams(window.location.search).get('token') || '';
    // Keep the secret token out of the address bar and the browser history.
    window.history.replaceState(null, '', window.location.pathname);

    if (!/^[0-9a-f]{64}$/.test(resetToken)) {
        showFormError(resetError, 'This reset link is not valid. Please ask for a new one.');
        resetForm.querySelector('button[type="submit"]').disabled = true;
    }

    resetForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const password = document.getElementById('new-password').value;
        const confirm = document.getElementById('confirm-new-password').value;
        resetSuccess.classList.remove('show');

        if (password.length < 6) {
            showFormError(resetError, 'Password must be at least 6 characters.');
            return;
        }
        if (password !== confirm) {
            showFormError(resetError, 'The two passwords do not match.');
            return;
        }

        hideFormError(resetError);
        setLoading(resetForm, true);
        try {
            const data = await postJson('/reset-password', { token: resetToken, password: password });
            resetSuccess.innerHTML = '';
            resetSuccess.appendChild(document.createTextNode(data.message + ' '));
            const link = document.createElement('a');
            link.href = 'index.html';
            link.textContent = 'Go to sign in';
            resetSuccess.appendChild(link);
            resetSuccess.classList.add('show');
            resetForm.reset();
            resetForm.querySelector('button[type="submit"]').disabled = true;
        } catch (err) {
            showFormError(resetError, err.message);
            setLoading(resetForm, false);
        }
    });
}
