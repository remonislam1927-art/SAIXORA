(() => {
  'use strict';
  const lock = document.getElementById('novaLock');
  const unlocked = document.getElementById('novaUnlocked');
  const form = document.getElementById('novaPinForm');
  const input = document.getElementById('novaPin');
  const button = document.getElementById('novaUnlockButton');
  const status = document.getElementById('novaAuthStatus');
  const files = document.getElementById('novaFileList');
  const fileStatus = document.getElementById('novaFilesStatus');
  const toggle = document.getElementById('novaTogglePin');
  const labels = {
    windows: { name: 'Secure Nova PC', platform: 'WINDOWS', note: 'Installer for authorized classroom Windows OPS computers', icon: '▣' },
    teachers: { name: 'N.Teachers', platform: 'ANDROID', note: 'Teacher application · Android APK', icon: '◈' },
    admin: { name: 'N.Admin', platform: 'ANDROID', note: 'School administrator application · Android APK', icon: '⌑' }
  };
  const setStatus = (message, kind = '') => {
    status.textContent = message;
    status.className = `nova-status ${kind}`;
  };
  const setLocked = () => {
    unlocked.hidden = true;
    lock.hidden = false;
    input.value = '';
    files.replaceChildren();
  };
  const setUnlocked = async () => {
    lock.hidden = true;
    unlocked.hidden = false;
    input.value = '';
    fileStatus.textContent = 'Checking available downloads…';
    try {
      const response = await fetch('/api/nova/files', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) { setLocked(); setStatus('Your access has expired. Please enter the PIN again.'); return; }
      if (!response.ok) throw new Error('Could not retrieve files');
      const data = await response.json();
      files.replaceChildren();
      for (const item of data.files || []) {
        const info = labels[item.id];
        if (!info) continue;
        const card = document.createElement('div');
        card.className = 'nova-file';
        const icon = document.createElement('div');
        icon.className = 'nova-file-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = info.icon;
        const copy = document.createElement('div');
        copy.className = 'nova-file-copy';
        const platform = document.createElement('span');
        platform.className = 'nova-file-platform';
        platform.textContent = info.platform;
        const title = document.createElement('h4');
        title.textContent = info.name;
        const note = document.createElement('p');
        note.textContent = info.note;
        copy.append(platform, title, note);
        const action = document.createElement(item.available ? 'a' : 'span');
        action.className = item.available ? 'nova-download-link' : 'nova-download-pending';
        action.textContent = item.available ? 'Download ↘' : 'Not uploaded yet';
        if (item.available) action.href = `/api/nova/download/${encodeURIComponent(item.id)}`;
        card.append(icon, copy, action);
        files.append(card);
      }
      fileStatus.textContent = 'Only files already uploaded by SAIXORA can be downloaded.';
    } catch {
      fileStatus.textContent = 'Unable to check release files. Please try again later.';
    }
  };
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', `${show ? 'Hide' : 'Show'} PIN`);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!input.value || button.disabled) return;
    button.disabled = true;
    setStatus('Verifying your school access…');
    try {
      const response = await fetch('/api/nova/unlock', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: input.value })
      });
      if (!response.ok) {
        if (response.status === 429) setStatus('Too many attempts. Please wait and try again.', 'error');
        else if (response.status === 503) setStatus('School downloads are not configured yet. Please contact SAIXORA.', 'error');
        else setStatus('The PIN was not accepted. Please check it and try again.', 'error');
        return;
      }
      setStatus('');
      await setUnlocked();
    } catch {
      setStatus('The download server is unavailable. Please try again when it is online.', 'error');
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('novaLockAgain').addEventListener('click', async () => {
    try { await fetch('/api/nova/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally { setLocked(); setStatus('Downloads locked.'); }
  });
  fetch('/api/nova/session', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(data => { if (data?.authenticated) setUnlocked(); })
    .catch(() => {});
})();
