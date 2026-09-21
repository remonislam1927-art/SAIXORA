(() => {
  'use strict';

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  $$('[data-year]').forEach(node => { node.textContent = String(new Date().getFullYear()); });

  const nav = $('#siteNav');
  if (nav) {
    const updateNav = () => nav.classList.toggle('is-scrolled', window.scrollY > 22);
    window.addEventListener('scroll', updateNav, { passive: true });
    updateNav();
  }

  // Make content visible even when IntersectionObserver is not supported.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('js-ready');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -35px 0px', threshold: 0.07 });
    $$('.reveal').forEach(el => observer.observe(el));
  } else {
    $$('.reveal').forEach(el => el.classList.add('in-view'));
  }

  const form = $('#contactForm');
  if (!form) return;

  const status = $('#formStatus');
  const sendBtn = $('#sendBtn');
  const message = $('#contactMessage');
  const count = $('#charCount');
  const subject = $('#contactSubject');
  const params = new URLSearchParams(location.search);
  if (params.has('subject')) subject.value = params.get('subject').slice(0, 140);

  const updateCount = () => { count.textContent = `${message.value.length} / 5000`; };
  message.addEventListener('input', updateCount);
  updateCount();

  const fields = [
    ['contactName', 'nameError', 'Please enter your name (at least 2 characters).'],
    ['contactEmail', 'emailError', 'Please enter a valid email address.'],
    ['contactSubject', 'subjectError', 'Please add a subject (at least 3 characters).'],
    ['contactMessage', 'messageError', 'Please share at least 20 characters about your idea.']
  ];

  const showStatus = (text, kind = 'info') => {
    status.className = `form-status ${kind}`;
    status.textContent = text;
  };

  fields.forEach(([id, errorId]) => {
    const input = $(`#${id}`);
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      $(`#${errorId}`).textContent = '';
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sendBtn.disabled) return;
    showStatus('');

    let firstInvalid = null;
    for (const [id, errorId, errorText] of fields) {
      const input = $(`#${id}`);
      const invalid = !input.checkValidity() || !input.value.trim();
      $(`#${errorId}`).textContent = invalid ? errorText : '';
      input.setAttribute('aria-invalid', String(invalid));
      if (invalid && !firstInvalid) firstInvalid = input;
    }
    const consent = $('#contactConsent');
    $('#consentError').textContent = consent.checked ? '' : 'Please agree before sending.';
    if (!consent.checked && !firstInvalid) firstInvalid = consent;
    if (firstInvalid) {
      showStatus('Please check the highlighted fields.', 'error');
      firstInvalid.focus();
      return;
    }

    // A hidden field helps reduce basic spam; it is not security protection.
    if ($('#companyWebsite').value) {
      showStatus('Your enquiry could not be submitted. Please contact us another way.', 'error');
      return;
    }

    const endpoint = String(window.SAIXORA_CONFIG?.formEndpoint || '').trim();
    if (!/^https:\/\/formspree\.io\/f\/[\w-]+$/.test(endpoint)) {
      showStatus('This form has not been connected to an inbox yet. The site owner needs to configure the form endpoint in config.js before enquiries can be sent.', 'info');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    showStatus('Sending your enquiry securely…', 'info');

    try {
      const payload = new FormData(form);
      // Only include the information required to answer the enquiry.
      payload.delete('website');
      payload.delete('consent');
      const response = await fetch(endpoint, {
        method: 'POST', body: payload,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`Submission failed: ${response.status}`);
      showStatus('Thank you! Your enquiry was submitted. We’ll respond using the email you provided.', 'success');
      form.reset();
      updateCount();
      fields.forEach(([id, errorId]) => {
        $(`#${id}`).removeAttribute('aria-invalid');
        $(`#${errorId}`).textContent = '';
      });
      $('#consentError').textContent = '';
    } catch (_) {
      showStatus('We could not confirm delivery. Please try again later; do not assume your message was sent.', 'error');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = 'Send enquiry <span aria-hidden="true">↗</span>';
    }
  });
})();
