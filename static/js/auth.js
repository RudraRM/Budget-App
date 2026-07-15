/* Authentication screens: login, register, forgot/reset password */

const Auth = {
  view: 'login', // login | register | forgot | reset

  render() {
    const root = document.getElementById('authRoot');
    root.innerHTML = '';
    root.appendChild(this._buildCard());
  },

  _buildCard() {
    const wrap = el('div', { class: 'auth-wrap' });
    const card = el('div', { class: 'auth-card' });

    if (this.view === 'login') card.appendChild(this._loginForm());
    else if (this.view === 'register') card.appendChild(this._registerForm());
    else if (this.view === 'forgot') card.appendChild(this._forgotForm());

    wrap.appendChild(card);
    return wrap;
  },

  _brand() {
    return el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:24px;font-family:var(--font-display);font-weight:600;font-size:1.1rem;' }, [
      el('span', { style: 'width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#00D67E,#00A868);display:flex;align-items:center;justify-content:center;color:#041F14;font-family:var(--font-mono);font-weight:700;' }, '$'),
      'BudgetMind AI'
    ]);
  },

  _loginForm() {
    const container = el('div');
    container.appendChild(this._brand());
    container.appendChild(el('h2', {}, 'Welcome back'));
    container.appendChild(el('div', { class: 'sub' }, 'Log in to see your dashboard.'));

    const alertBox = el('div');
    container.appendChild(alertBox);

    const emailField = this._field('Email', 'email', 'you@example.com');
    const pwField = this._field('Password', 'password', '••••••••');
    container.appendChild(emailField.wrap);
    container.appendChild(pwField.wrap);

    const rememberRow = el('div', { class: 'toggle-row', style: 'margin-bottom:16px;' }, [
      el('label', { class: 'switch' }, [
        el('input', { type: 'checkbox', id: 'rememberMe' }),
        el('span', { class: 'track' })
      ]),
    ]);
    const rememberLabel = el('span', { style: 'font-size:0.85rem;color:var(--text-dim);margin-left:-70px;' }, 'Remember me');
    rememberRow.appendChild(rememberLabel);
    container.appendChild(rememberRow);

    const submitBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Log in');
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true; submitBtn.textContent = 'Logging in…';
      try {
        const data = await API.post('/api/auth/login', {
          email: emailField.input.value.trim(),
          password: pwField.input.value,
          remember: document.getElementById('rememberMe').checked
        });
        window.CURRENT_USER = data.user;
        showToast(`Welcome back, ${data.user.name.split(' ')[0]}.`, 'success');
        App.init();
      } catch (e) {
        alertBox.innerHTML = '';
        alertBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
      } finally {
        submitBtn.disabled = false; submitBtn.textContent = 'Log in';
      }
    });
    container.appendChild(submitBtn);

    container.appendChild(el('div', { class: 'auth-switch' }, [
      'No account yet? ',
      (() => { const b = el('button', {}, 'Create one'); b.onclick = () => { this.view = 'register'; this.render(); }; return b; })()
    ]));
    container.appendChild(el('div', { class: 'auth-switch' }, [
      (() => { const b = el('button', {}, 'Forgot your password?'); b.onclick = () => { this.view = 'forgot'; this.render(); }; return b; })()
    ]));

    return container;
  },

  _registerForm() {
    const container = el('div');
    container.appendChild(this._brand());
    container.appendChild(el('h2', {}, 'Create your account'));
    container.appendChild(el('div', { class: 'sub' }, 'Free forever. No AI API key needed.'));

    const alertBox = el('div');
    container.appendChild(alertBox);

    const nameField = this._field('Full name', 'text', 'Jordan Lee');
    const emailField = this._field('Email', 'email', 'you@example.com');
    const pwField = this._field('Password', 'password', 'At least 8 characters');
    container.appendChild(nameField.wrap);
    container.appendChild(emailField.wrap);
    container.appendChild(pwField.wrap);

    const submitBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Create account');
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true; submitBtn.textContent = 'Creating…';
      try {
        const data = await API.post('/api/auth/register', {
          name: nameField.input.value.trim(),
          email: emailField.input.value.trim(),
          password: pwField.input.value
        });
        window.CURRENT_USER = data.user;
        showToast('Account created. Welcome to BudgetMind AI.', 'success');
        App.init();
      } catch (e) {
        alertBox.innerHTML = '';
        alertBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
      } finally {
        submitBtn.disabled = false; submitBtn.textContent = 'Create account';
      }
    });
    container.appendChild(submitBtn);

    container.appendChild(el('div', { class: 'auth-switch' }, [
      'Already have an account? ',
      (() => { const b = el('button', {}, 'Log in'); b.onclick = () => { this.view = 'login'; this.render(); }; return b; })()
    ]));

    return container;
  },

  _forgotForm() {
    const container = el('div');
    container.appendChild(this._brand());
    container.appendChild(el('h2', {}, 'Reset your password'));
    container.appendChild(el('div', { class: 'sub' }, "We'll help you get back in."));

    const alertBox = el('div');
    container.appendChild(alertBox);

    const emailField = this._field('Email', 'email', 'you@example.com');
    container.appendChild(emailField.wrap);

    const tokenField = this._field('Reset code', 'text', 'Paste the code you received');
    tokenField.wrap.style.display = 'none';
    const pwField = this._field('New password', 'password', 'At least 8 characters');
    pwField.wrap.style.display = 'none';
    container.appendChild(tokenField.wrap);
    container.appendChild(pwField.wrap);

    const submitBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Send reset instructions');
    let stage = 'request';
    submitBtn.addEventListener('click', async () => {
      alertBox.innerHTML = '';
      if (stage === 'request') {
        submitBtn.disabled = true; submitBtn.textContent = 'Sending…';
        try {
          const data = await API.post('/api/auth/forgot-password', { email: emailField.input.value.trim() });
          stage = 'reset';
          tokenField.wrap.style.display = '';
          pwField.wrap.style.display = '';
          submitBtn.textContent = 'Reset password';
          const note = data.demo_reset_token
            ? `Demo mode: your reset code is ${data.demo_reset_token}`
            : 'If that email exists, a reset code has been sent.';
          alertBox.appendChild(el('div', { class: 'auth-alert success' }, note));
          if (data.demo_reset_token) tokenField.input.value = data.demo_reset_token;
        } catch (e) {
          alertBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
        } finally {
          submitBtn.disabled = false;
        }
      } else {
        submitBtn.disabled = true; submitBtn.textContent = 'Resetting…';
        try {
          await API.post('/api/auth/reset-password', { token: tokenField.input.value.trim(), password: pwField.input.value });
          showToast('Password reset. Please log in.', 'success');
          this.view = 'login'; this.render();
        } catch (e) {
          alertBox.innerHTML = '';
          alertBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
        } finally {
          submitBtn.disabled = false; submitBtn.textContent = 'Reset password';
        }
      }
    });
    container.appendChild(submitBtn);

    container.appendChild(el('div', { class: 'auth-switch' }, [
      (() => { const b = el('button', {}, '← Back to log in'); b.onclick = () => { this.view = 'login'; this.render(); }; return b; })()
    ]));

    return container;
  },

  _field(label, type, placeholder) {
    const input = el('input', { type, placeholder, autocomplete: type === 'password' ? 'current-password' : 'on' });
    const wrap = el('div', { class: 'field' }, [el('label', {}, label), input]);
    return { wrap, input };
  }
};
