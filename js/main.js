/* =====================================================
   The Valley Wall Doctor — main.js
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

})();
