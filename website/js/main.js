/* ===== Agent Identity System — Showcase JavaScript ===== */

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
  const sections = document.querySelectorAll('.section, .hero');
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

  // ---- Animated counters ----
  function animateCounters() {
    document.querySelectorAll('.stat-number[data-count]').forEach(el => {
      const target = parseInt(el.dataset.count, 10);
      if (el._animated) return;
      const rect = el.getBoundingClientRect();
      if (rect.top > window.innerHeight) return;
      el._animated = true;
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 40));
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = current;
      }, 30);
    });
  }
  window.addEventListener('scroll', animateCounters);
  animateCounters();

  // ---- Tabs (Research) ----
  document.querySelectorAll('.tabs').forEach(tabs => {
    tabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        tabs.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById('tab-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  });

  // ---- Flow tabs ----
  document.querySelectorAll('.flow-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.flow-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.flow-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('flow-' + btn.dataset.flow);
      if (panel) panel.classList.add('active');
    });
  });

  // ---- Scroll reveal ----
  const revealEls = document.querySelectorAll(
    '.reveal, .paper-card, .standard-card, .product-card, .decision-card, ' +
    '.component-card, .layer-card, .timeline-item, .code-example, ' +
    '.insight-box, .test-results, .flow-diagram, .delegation-visual'
  );
  revealEls.forEach(el => el.classList.add('reveal'));

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

  // ---- Hero canvas (particle network) ----
  const canvas = document.getElementById('heroCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    let w, h, particles = [];
    const PARTICLE_COUNT = 60;
    const CONNECT_DIST = 140;

    function resize() {
      w = canvas.width = canvas.parentElement.clientWidth;
      h = canvas.height = canvas.parentElement.clientHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 2 + 1,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      // move
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      });
      // lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT_DIST) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(108, 92, 231, ${1 - dist / CONNECT_DIST})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      // dots
      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 206, 201, 0.6)';
        ctx.fill();
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ---- Timeline hover ----
  document.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      document.querySelectorAll('.timeline-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });

})();
