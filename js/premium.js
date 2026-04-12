// ─── Premium Animations — GSAP + SplitType + Cursor Glow ─────────
// Safe: never hides content. Only adds entrance animations to elements
// that are below the fold. Elements already visible stay visible.

(function() {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  // ─── 1. HERO TEXT REVEAL (SplitType + GSAP) ─────────────────
  function initHeroAnimations() {
    if (typeof gsap === 'undefined' || prefersReduced) return;

    var heroH1 = document.querySelector('.hero h1');
    var heroP = document.querySelector('.hero > .hero-inner > p, .hero .hero-inner > p');
    var heroButtons = document.querySelector('.hero-buttons');
    var heroLogo = document.querySelector('.hero-logo');

    // Logo fade in
    if (heroLogo) {
      gsap.from(heroLogo, { opacity: 0, scale: 0.8, duration: 0.8, ease: 'power2.out', delay: 0.2 });
    }

    // H1 character reveal
    if (heroH1 && typeof SplitType !== 'undefined') {
      try {
        var split = new SplitType(heroH1, { types: 'chars' });
        gsap.from(split.chars, {
          opacity: 0, y: 40, duration: 0.6, ease: 'power3.out',
          stagger: 0.03, delay: 0.5
        });
      } catch (e) { /* SplitType failed, skip */ }
    }

    // Subtitle word reveal
    if (heroP && typeof SplitType !== 'undefined') {
      try {
        var splitP = new SplitType(heroP, { types: 'words' });
        gsap.from(splitP.words, {
          opacity: 0, y: 20, duration: 0.5, ease: 'power2.out',
          stagger: 0.02, delay: 1.2
        });
      } catch (e) { /* skip */ }
    }

    // Buttons — no animation, always visible instantly
  }

  // ─── 2. SCROLL ANIMATIONS ──────────────────────────────────
  function initScrollAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || prefersReduced) return;

    // Only animate elements that are BELOW the current viewport
    var viewportBottom = window.innerHeight;

    // Sections fade up
    var sections = document.querySelectorAll('.section-inner, .cta-section, .how-section, .usecases');
    sections.forEach(function(section) {
      var rect = section.getBoundingClientRect();
      if (rect.top < viewportBottom) return; // Already visible, skip
      gsap.from(section, {
        scrollTrigger: { trigger: section, start: 'top 88%', once: true },
        opacity: 0, y: 30, duration: 0.7, ease: 'power2.out'
      });
    });

    // Stagger cards — only if the group is below fold
    var cardGroups = document.querySelectorAll('.services-grid, .agents-grid, .pricing-grid, .features, .usecase-grid, .prebuilt-grid');
    cardGroups.forEach(function(group) {
      var rect = group.getBoundingClientRect();
      if (rect.top < viewportBottom) return; // Already visible
      var cards = group.children;
      gsap.from(cards, {
        scrollTrigger: { trigger: group, start: 'top 88%', once: true },
        opacity: 0, y: 40, duration: 0.5, ease: 'power2.out',
        stagger: 0.1
      });
    });

    // Value items
    var valueItems = document.querySelectorAll('.value-item');
    if (valueItems.length) {
      var rect = valueItems[0].getBoundingClientRect();
      if (rect.top >= viewportBottom) {
        gsap.from(valueItems, {
          scrollTrigger: { trigger: valueItems[0].parentElement, start: 'top 85%', once: true },
          opacity: 0, x: -20, duration: 0.5, ease: 'power2.out',
          stagger: 0.12
        });
      }
    }

    // How-it-works steps
    var steps = document.querySelectorAll('.how-step');
    if (steps.length) {
      var rect = steps[0].getBoundingClientRect();
      if (rect.top >= viewportBottom) {
        gsap.from(steps, {
          scrollTrigger: { trigger: steps[0].parentElement, start: 'top 85%', once: true },
          opacity: 0, y: 30, duration: 0.5, ease: 'power2.out',
          stagger: 0.12
        });
      }
    }
  }

  // ─── 3. CURSOR GLOW ────────────────────────────────────────
  function initCursorGlow() {
    if (prefersReduced || window.innerWidth < 768) return;

    var glow = document.createElement('div');
    glow.style.cssText = 'position:fixed;top:0;left:0;width:600px;height:600px;pointer-events:none;z-index:1;border-radius:50%;background:radial-gradient(circle,rgba(255,106,0,0.05) 0%,transparent 70%);transform:translate(-50%,-50%);opacity:0;transition:opacity 0.4s;will-change:transform;';
    document.body.appendChild(glow);

    var mx = 0, my = 0, gx = 0, gy = 0, visible = false;

    document.addEventListener('mousemove', function(e) {
      mx = e.clientX; my = e.clientY;
      if (!visible) { glow.style.opacity = 1; visible = true; }
    });
    document.addEventListener('mouseleave', function() { glow.style.opacity = 0; visible = false; });

    function tick() {
      gx += (mx - gx) * 0.07;
      gy += (my - gy) * 0.07;
      glow.style.transform = 'translate(' + (gx - 300) + 'px,' + (gy - 300) + 'px)';
      requestAnimationFrame(tick);
    }
    tick();
  }

  // ─── 4. NAVBAR SCROLL ──────────────────────────────────────
  function initNavScroll() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    nav.style.transition = 'background 0.3s ease, border-color 0.3s ease';

    var scrolled = false;
    function check() {
      if (window.scrollY > 50 && !scrolled) {
        nav.style.background = 'rgba(10,10,10,0.95)';
        nav.style.borderBottomColor = 'rgba(255,106,0,0.15)';
        scrolled = true;
      } else if (window.scrollY <= 50 && scrolled) {
        nav.style.background = 'rgba(10,10,10,0.88)';
        nav.style.borderBottomColor = 'rgba(255,255,255,0.06)';
        scrolled = false;
      }
    }
    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  // ─── 5. BUTTON GLOW ───────────────────────────────────────
  function initButtonGlow() {
    if (prefersReduced) return;
    var btn = document.querySelector('.btn-hero');
    if (btn) btn.style.animation = 'btnGlow 2s ease-in-out infinite';
  }

  // ─── INIT ──────────────────────────────────────────────────
  function init() {
    initNavScroll();
    initCursorGlow();
    initButtonGlow();
    setTimeout(function() {
      initHeroAnimations();
      initScrollAnimations();
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }
})();
