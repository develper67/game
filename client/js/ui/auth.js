import { h } from '../util/dom.js';
import { api } from '../api.js';
import { MODES } from '/shared/constants.js';

export class AuthScreen {
  constructor(app, message) {
    this.app = app;
    this.mode = 'login';
    const user = h('input', { class: 'input', id: 'auth-user', autocomplete: 'username', maxlength: '16', placeholder: 'e.g. ChickenThief' });
    const pass = h('input', { class: 'input', id: 'auth-pass', type: 'password', autocomplete: 'current-password', maxlength: '72', placeholder: '••••••' });
    const pass2 = h('input', { class: 'input', id: 'auth-pass2', type: 'password', autocomplete: 'new-password', maxlength: '72', placeholder: 'repeat password' });
    const remember = h('input', { type: 'checkbox', id: 'auth-remember' });
    const err = h('div', { class: 'err', id: 'auth-err', text: message || '' });
    const submit = h('button', { class: 'btn big', type: 'submit', id: 'auth-submit', style: { width: '100%' }, text: 'LOG IN' });
    const confirmField = h('div', { class: 'field hidden' }, h('label', { for: 'auth-pass2', text: 'Confirm password' }), pass2);
    const hint = h('div', { class: 'hint hidden', text: '3–16 letters, numbers or _. Password at least 6 characters.' });
    const tabLogin = h('button', { class: 'tab active', type: 'button', text: 'Log in' });
    const tabReg = h('button', { class: 'tab', type: 'button', text: 'Create account' });
    const setMode = (m) => {
      this.mode = m;
      tabLogin.classList.toggle('active', m === 'login');
      tabReg.classList.toggle('active', m === 'register');
      confirmField.classList.toggle('hidden', m === 'login');
      hint.classList.toggle('hidden', m === 'login');
      submit.textContent = m === 'login' ? 'LOG IN' : 'CREATE ACCOUNT';
      pass.autocomplete = m === 'login' ? 'current-password' : 'new-password';
      err.textContent = '';
      user.classList.remove('error'); pass.classList.remove('error'); pass2.classList.remove('error');
    };
    tabLogin.addEventListener('click', () => setMode('login'));
    tabReg.addEventListener('click', () => setMode('register'));
    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        user.classList.remove('error'); pass.classList.remove('error'); pass2.classList.remove('error');
        const u = user.value.trim(), p = pass.value;
        if (!u) { err.textContent = 'Enter a username.'; user.classList.add('error'); return; }
        if (!p) { err.textContent = 'Enter a password.'; pass.classList.add('error'); return; }
        if (this.mode === 'register' && p !== pass2.value) { err.textContent = 'The passwords do not match.'; pass2.classList.add('error'); return; }
        submit.disabled = true;
        submit.textContent = '…';
        const r = this.mode === 'login' ? await api.login(u, p) : await api.register(u, p);
        submit.disabled = false;
        submit.textContent = this.mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT';
        if (r.error) {
          err.textContent = r.error;
          if (r.field === 'username') user.classList.add('error');
          if (r.field === 'password') pass.classList.add('error');
          return;
        }
        this.app.onAuthed(r.token, r.user, remember.checked);
      },
    },
    h('div', { class: 'field' }, h('label', { for: 'auth-user', text: 'Username' }), user),
    h('div', { class: 'field' }, h('label', { for: 'auth-pass', text: 'Password' }), pass),
    confirmField, hint,
    h('label', { class: 'check' }, remember, 'Stay logged in on this device'),
    err, submit);
    this.el = h('div', { class: 'auth-wrap' },
      h('div', { class: 'auth-hero' },
        h('div', { class: 'logo' }, 'yoink', h('span', { class: 'bang', text: '!' })),
        h('p', { text: 'The first-person party game where you tag, pass, grab, scavenge and shoot your way to glory with your friends.' }),
        h('div', { class: 'mode-chips' }, Object.values(MODES).map((m) => h('span', { class: 'chip', text: `${m.icon} ${m.name}` })))),
      h('div', { class: 'card auth-card' },
        h('div', { class: 'tabs' }, tabLogin, tabReg),
        form,
        h('p', { class: 'hint', style: { marginTop: '14px', textAlign: 'center' }, text: 'An account is required to play — even practice mode. Progress is saved on the server.' })));
    this.user = user;
  }
  mounted() { this.user.focus(); }
}
