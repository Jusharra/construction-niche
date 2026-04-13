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
     9. VAPI AI CALL BUTTON
     Public key + assistant ID fetched from /.netlify/functions/vapi-config
     so neither value ever lives in source code.
     SDK loaded from CDN on first click — zero weight on initial page load.
     Button only injected when VAPI is configured (env vars set in Netlify).
     -------------------------------------------------- */
  (function initVapi() {
    var CONFIG_URL = '/.netlify/functions/vapi-config';
    var SDK_URL    = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web/dist/vapi.sdk.umd.js';

    var btn        = null;
    var vapiInst   = null;
    var callActive = false;
    var cachedCfg  = null;

    // Silently fetch config on load — button only appears when VAPI is configured
    fetch(CONFIG_URL)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (cfg) {
        if (cfg && cfg.publicKey) {
          cachedCfg = cfg;
          injectButton();
        }
      })
      .catch(function () { /* VAPI not configured — no button shown */ });

    function injectButton() {
      btn = document.createElement('button');
      btn.id        = 'vapi-call-btn';
      btn.className = 'vapi-btn vapi-idle';
      btn.setAttribute('aria-label', 'Talk to our AI assistant');
      btn.innerHTML =
        '<span class="vapi-icon" aria-hidden="true">&#127897;</span>' +
        '<span class="vapi-label">Talk to AI</span>';
      btn.addEventListener('click', onBtnClick);
      document.body.appendChild(btn);
    }

    function setState(state, label) {
      if (!btn) return;
      btn.className = 'vapi-btn vapi-' + state;
      btn.disabled  = (state === 'loading');
      btn.querySelector('.vapi-label').textContent = label;
    }

    function onBtnClick() {
      if (callActive) {
        if (vapiInst) vapiInst.stop();
        return;
      }
      beginCall();
    }

    function beginCall() {
      setState('loading', 'Connecting\u2026');

      loadSdk()
        .then(function () {
          var VapiCtor = window.Vapi;
          if (!VapiCtor) throw new Error('Vapi global not found after SDK load');

          vapiInst = new VapiCtor(cachedCfg.publicKey);

          vapiInst.on('call-start', function () {
            callActive = true;
            setState('active', 'Connected \u00b7 End Call');
          });

          vapiInst.on('call-end', function () {
            callActive = false;
            setState('idle', 'Talk to AI');
          });

          vapiInst.on('speech-start', function () {
            if (btn) btn.classList.add('vapi-speaking');
          });

          vapiInst.on('speech-end', function () {
            if (btn) btn.classList.remove('vapi-speaking');
          });

          vapiInst.on('error', function (err) {
            console.error('VAPI error:', err);
            callActive = false;
            setState('error', 'Connection Error');
            setTimeout(function () { setState('idle', 'Talk to AI'); }, 3000);
          });

          // Start with assistantId string or inline assistant config object
          vapiInst.start(cachedCfg.assistantId || {});
        })
        .catch(function (err) {
          console.error('VAPI init error:', err);
          setState('error', 'Try Again');
          setTimeout(function () { setState('idle', 'Talk to AI'); }, 3000);
        });
    }

    function loadSdk() {
      return new Promise(function (resolve, reject) {
        if (window.Vapi) { resolve(); return; }
        var s    = document.createElement('script');
        s.src    = SDK_URL;
        s.async  = true;
        s.onload  = resolve;
        s.onerror = function () { reject(new Error('VAPI SDK CDN load failed')); };
        document.head.appendChild(s);
      });
    }
  }());

})();
