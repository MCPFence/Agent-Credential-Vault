/* ===== Agent Credential Vault — Product Page JavaScript ===== */

(function () {
  'use strict';

  // ---- Nav scroll effect ----
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => navLinks.classList.remove('open'))
    );
  }

  // ---- Active nav link ----
  const sections = document.querySelectorAll('.p-section, .p-hero');
  const navAs = document.querySelectorAll('.nav-links a[data-section]');

  function updateActiveNav() {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 200) current = s.id;
    });
    navAs.forEach(a => {
      a.classList.toggle('active', a.dataset.section === current);
    });
  }
  window.addEventListener('scroll', updateActiveNav);

  // ---- Scroll reveal ----
  const revealEls = document.querySelectorAll('.p-reveal');

  function checkReveal() {
    revealEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 60) {
        el.classList.add('visible');
      }
    });
  }
  window.addEventListener('scroll', checkReveal);
  checkReveal();

  // ---- Smooth anchor scroll ----
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

})();
