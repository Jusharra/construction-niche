/* =====================================================
   Wall Doctor TX — main.js
   Vanilla JS, zero dependencies
   ===================================================== */

(function () {
  'use strict';

  /* --------------------------------------------------
     1. STICKY NAV SHADOW ON SCROLL
     -------------------------------------------------- */
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }

  /* --------------------------------------------------
     2. MOBILE HAMBURGER MENU
     -------------------------------------------------- */
  const hamburger = document.querySelector('.nav-hamburger');
  const navLinks = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function () {
      const isOpen = navLinks.classList.toggle('nav-open');
      hamburger.setAttribute('aria-expanded', isOpen);
      hamburger.innerHTML = isOpen ? '&times;' : '&#9776;';
    });

    // Close menu when any nav link is clicked
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('nav-open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '&#9776;';
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (e) {
      if (!header.contains(e.target) && navLinks.classList.contains('nav-open')) {
        navLinks.classList.remove('nav-open');
        hamburger.setAttribute('aria-expanded', 'false');
        hamburger.innerHTML = '&#9776;';
      }
    });
  }

  /* --------------------------------------------------
     3. ESTIMATE FORM — WEBHOOK SUBMISSION TO AIRTABLE
     The webhook URL is stored as a Netlify environment variable (AIRTABLE_WEBHOOK_URL).
     Set it in: Netlify Dashboard → Site → Environment variables
     DO NOT paste the real URL here — this file is public.
     -------------------------------------------------- */
  var WEBHOOK_URL = '/.netlify/functions/submit-estimate';

  var estimateForm = document.getElementById('estimate-form');
  var submitBtn = document.getElementById('form-submit-btn');

  if (estimateForm) {
    estimateForm.addEventListener('submit', function (e) {
      e.preventDefault();

      submitBtn.textContent = 'Sending…';
      submitBtn.disabled = true;

      var payload = {
        name:         estimateForm.name.value,
        phone:        estimateForm.phone.value,
        email:        estimateForm.email.value,
        service_address: estimateForm.elements['service_address'].value,
        city:         estimateForm.elements['city'].value,
        state:        estimateForm.elements['state'].value,
        zip_code:     estimateForm.elements['zip_code'].value,
        project_type: estimateForm.project_type.value,
        description:  estimateForm.description.value
      };

      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (res.ok || res.status === 200 || res.status === 202) {
            estimateForm.innerHTML =
              '<div class="form-success">' +
              '<h3>Thank You!</h3>' +
              '<p>We received your request and will be in touch shortly.<br>' +
              'Expect a response within 1 business day.</p>' +
              '</div>';
          } else {
            throw new Error('Webhook returned ' + res.status);
          }
        })
        .catch(function () {
          submitBtn.textContent = 'Submit Estimate Request';
          submitBtn.disabled = false;
          alert('Something went wrong. Please try again or call us directly.');
        });
    });
  }

  /* --------------------------------------------------
     5. ACTIVE NAV LINK ON SCROLL
     Uses IntersectionObserver to highlight the nav link
     matching the currently visible section.
     -------------------------------------------------- */
  const sections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');

  if (sections.length && navAnchors.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navAnchors.forEach(function (a) { a.classList.remove('active'); });
          const match = document.querySelector(
            '.nav-links a[href="#' + entry.target.id + '"]'
          );
          if (match) match.classList.add('active');
        }
      });
    }, {
      rootMargin: '-30% 0px -60% 0px'
    });

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* --------------------------------------------------
     6. SMOOTH REVEAL ON SCROLL (optional enhancement)
     Adds .visible class to .reveal elements as they
     enter the viewport for a subtle fade-in effect.
     -------------------------------------------------- */
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* --------------------------------------------------
     7. FAQ ACCORDION
     -------------------------------------------------- */
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var isOpen = item.classList.contains('open');
      // Close all others
      document.querySelectorAll('.faq-item.open').forEach(function (el) {
        el.classList.remove('open');
      });
      if (!isOpen) item.classList.add('open');
    });
  });

  /* --------------------------------------------------
     8. NAV DROPDOWN — touch / keyboard support
     -------------------------------------------------- */
  document.querySelectorAll('.nav-dropdown > a').forEach(function (link) {
    link.addEventListener('click', function (e) {
      // On touch devices prevent nav follow and toggle dropdown
      if (window.matchMedia('(hover: none)').matches) {
        e.preventDefault();
        var parent = link.closest('.nav-dropdown');
        parent.classList.toggle('open');
      }
    });
  });

  /* --------------------------------------------------
     9. VAPI AI CHAT WIDGET
     Config fetched from /.netlify/functions/vapi-config — button only
     injected when VAPI is configured (env vars set in Netlify).
     Messages proxied through /.netlify/functions/vapi-chat so the
     private API key is never exposed in the browser.
     -------------------------------------------------- */
  (function initChat() {
    var CONFIG_URL = '/.netlify/functions/vapi-config';
    var CHAT_URL   = '/.netlify/functions/vapi-chat';
    var GREETING   = 'Hi! I\'m the Wall Doctor TX AI assistant. Ask me anything about our services, pricing, or to schedule a free estimate!';

    var panel     = null;
    var msgList   = null;
    var inputEl   = null;
    var sendBtn   = null;
    var sessionId = null;
    var isOpen    = false;

    // Only inject when VAPI is configured
    fetch(CONFIG_URL)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (cfg) { if (cfg && cfg.configured) injectWidget(); })
      .catch(function () { /* not configured — no widget shown */ });

    function injectWidget() {
      // Floating bubble button
      var fab = document.createElement('button');
      fab.id        = 'chat-fab';
      fab.className = 'chat-fab';
      fab.setAttribute('aria-label', 'Chat with our AI assistant');
      fab.innerHTML =
        '<span class="chat-fab-icon" aria-hidden="true">&#128172;</span>' +
        '<span class="chat-fab-label">Chat with AI</span>';
      fab.addEventListener('click', togglePanel);
      document.body.appendChild(fab);

      // Chat panel
      panel = document.createElement('div');
      panel.id        = 'chat-panel';
      panel.className = 'chat-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'AI Chat');
      panel.setAttribute('aria-hidden', 'true');
      panel.innerHTML =
        '<div class="chat-header">' +
          '<div class="chat-header-info">' +
            '<span class="chat-avatar" aria-hidden="true">&#129302;</span>' +
            '<div><strong>Wall Doctor TX</strong><span>AI Assistant</span></div>' +
          '</div>' +
          '<button class="chat-close" aria-label="Close chat">&#10005;</button>' +
        '</div>' +
        '<div class="chat-messages" id="chat-messages"></div>' +
        '<div class="chat-input-row">' +
          '<input class="chat-input" type="text" placeholder="Type a message\u2026" aria-label="Chat message" maxlength="500">' +
          '<button class="chat-send" aria-label="Send">&#10148;</button>' +
        '</div>';
      document.body.appendChild(panel);

      msgList = panel.querySelector('#chat-messages');
      inputEl = panel.querySelector('.chat-input');
      sendBtn = panel.querySelector('.chat-send');

      panel.querySelector('.chat-close').addEventListener('click', togglePanel);
      sendBtn.addEventListener('click', sendMessage);
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });

      appendMessage('assistant', GREETING);
    }

    function togglePanel() {
      isOpen = !isOpen;
      panel.classList.toggle('chat-panel-open', isOpen);
      panel.setAttribute('aria-hidden', String(!isOpen));
      if (isOpen) { inputEl.focus(); scrollBottom(); }
    }

    function sendMessage() {
      var text = inputEl.value.trim();
      if (!text) return;
      inputEl.value    = '';
      sendBtn.disabled = true;
      inputEl.disabled = true;

      appendMessage('user', text);
      var typingId = appendTyping();

      fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          removeTyping(typingId);
          if (data.sessionId) sessionId = data.sessionId;
          appendMessage('assistant', data.reply || 'Sorry, I couldn\'t get a response. Call us at (817) 670-9771.');
        })
        .catch(function () {
          removeTyping(typingId);
          appendMessage('assistant', 'Something went wrong. Please call us at (817) 670-9771.');
        })
        .finally(function () {
          sendBtn.disabled = false;
          inputEl.disabled = false;
          inputEl.focus();
        });
    }

    function appendMessage(role, text) {
      var div = document.createElement('div');
      div.className   = 'chat-msg chat-msg-' + role;
      div.textContent = text;
      msgList.appendChild(div);
      scrollBottom();
    }

    function appendTyping() {
      var id  = 'typing-' + Date.now();
      var div = document.createElement('div');
      div.id        = id;
      div.className = 'chat-msg chat-msg-assistant chat-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      msgList.appendChild(div);
      scrollBottom();
      return id;
    }

    function removeTyping(id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    }

    function scrollBottom() {
      if (msgList) msgList.scrollTop = msgList.scrollHeight;
    }
  }());

})();
