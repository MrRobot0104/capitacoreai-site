// ─── Premium Animations — GSAP + SplitType + Cursor Glow ─────────
// Loaded on pages that include the GSAP/SplitType CDN scripts.
// Respects prefers-reduced-motion. Disabled on mobile for particles.

(function() {
  // ─── Reduced Motion Check ───────────────────────────────────
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Register ScrollTrigger ─────────────────────────────────
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  // ─── 1. HERO TEXT REVEAL (SplitType + GSAP) ─────────────────
  function initHeroAnimations() {
    if (typeof gsap === 'undefined') return;

    var heroH1 = document.querySelector('.hero h1');
    var heroP = document.querySelector('.hero p');
    var heroButtons = document.querySelector('.hero-buttons');
    var heroLogo = document.querySelector('.hero-logo');

    if (prefersReduced) {
      // Just show everything instantly
      if (heroH1) heroH1.style.opacity = 1;
      if (heroP) heroP.style.opacity = 1;
      if (heroButtons) heroButtons.style.opacity = 1;
      if (heroLogo) heroLogo.style.opacity = 1;
      return;
    }

    // Hide elements before animation
    if (heroH1) heroH1.style.opacity = 0;
    if (heroP) heroP.style.opacity = 0;
    if (heroButtons) { heroButtons.style.opacity = 0; heroButtons.style.transform = 'translateY(20px)'; }

    // Logo fade in
    if (heroLogo) {
      gsap.from(heroLogo, {
        opacity: 0, scale: 0.8, duration: 0.8, ease: 'power2.out', delay: 0.2
      });
    }

    // H1 character reveal
    if (heroH1 && typeof SplitType !== 'undefined') {
      var split = new SplitType(heroH1, { types: 'chars' });
      heroH1.style.opacity = 1;
      gsap.from(split.chars, {
        opacity: 0, y: 40, duration: 0.6, ease: 'power3.out',
        stagger: 0.03, delay: 0.5
      });
    } else if (heroH1) {
      gsap.to(heroH1, { opacity: 1, duration: 0.8, delay: 0.5 });
    }

    // Subtitle word reveal
    if (heroP && typeof SplitType !== 'undefined') {
      var splitP = new SplitType(heroP, { types: 'words' });
      heroP.style.opacity = 1;
      gsap.from(splitP.words, {
        opacity: 0, y: 20, duration: 0.5, ease: 'power2.out',
        stagger: 0.02, delay: 1.2
      });
    } else if (heroP) {
      gsap.to(heroP, { opacity: 1, duration: 0.8, delay: 1.2 });
    }

    // Buttons scale in
    if (heroButtons) {
      gsap.to(heroButtons, {
        opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', delay: 1.6
      });
    }
  }

  // ─── 2. SCROLL ANIMATIONS (GSAP ScrollTrigger) ──────────────
  function initScrollAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || prefersReduced) return;

    // Animate sections on scroll
    var sections = document.querySelectorAll('.section-inner, .page, .cta-section, .how-section, .usecases');
    sections.forEach(function(section) {
      gsap.from(section, {
        scrollTrigger: { trigger: section, start: 'top 85%', once: true },
        opacity: 0, y: 40, duration: 0.8, ease: 'power2.out'
      });
    });

    // Stagger cards
    var cardGroups = document.querySelectorAll('.services-grid, .agents-grid, .pricing-grid, .features, .usecase-grid, .prebuilt-grid');
    cardGroups.forEach(function(group) {
      var cards = group.children;
      gsap.from(cards, {
        scrollTrigger: { trigger: group, start: 'top 85%', once: true },
        opacity: 0, y: 50, duration: 0.6, ease: 'power2.out',
        stagger: 0.12
      });
    });

    // Value items stagger
    var valueItems = document.querySelectorAll('.value-item');
    if (valueItems.length) {
      gsap.from(valueItems, {
        scrollTrigger: { trigger: valueItems[0].parentElement, start: 'top 80%', once: true },
        opacity: 0, x: -30, duration: 0.6, ease: 'power2.out',
        stagger: 0.15
      });
    }

    // How-it-works steps
    var steps = document.querySelectorAll('.how-step');
    if (steps.length) {
      gsap.from(steps, {
        scrollTrigger: { trigger: steps[0].parentElement, start: 'top 80%', once: true },
        opacity: 0, y: 40, scale: 0.95, duration: 0.6, ease: 'power2.out',
        stagger: 0.15
      });
    }

    // Contact form
    var contactInner = document.querySelector('.contact-inner');
    if (contactInner) {
      gsap.from(contactInner, {
        scrollTrigger: { trigger: contactInner, start: 'top 85%', once: true },
        opacity: 0, y: 30, duration: 0.8, ease: 'power2.out'
      });
    }
  }

  // ─── 3. CURSOR GLOW ────────────────────────────────────────
  function initCursorGlow() {
    if (prefersReduced || window.innerWidth < 768) return;

    var glow = document.createElement('div');
    glow.id = 'cursorGlow';
    glow.style.cssText = 'position:fixed;top:0;left:0;width:600px;height:600px;pointer-events:none;z-index:1;border-radius:50%;background:radial-gradient(circle,rgba(255,106,0,0.06) 0%,transparent 70%);transform:translate(-50%,-50%);transition:opacity 0.3s;opacity:0;will-change:transform;';
    document.body.appendChild(glow);

    var mouseX = 0, mouseY = 0, glowX = 0, glowY = 0;
    var visible = false;

    document.addEventListener('mousemove', function(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!visible) { glow.style.opacity = 1; visible = true; }
    });

    document.addEventListener('mouseleave', function() {
      glow.style.opacity = 0; visible = false;
    });

    // Smooth follow with lerp
    function updateGlow() {
      glowX += (mouseX - glowX) * 0.08;
      glowY += (mouseY - glowY) * 0.08;
      glow.style.transform = 'translate(' + (glowX - 300) + 'px,' + (glowY - 300) + 'px)';
      requestAnimationFrame(updateGlow);
    }
    updateGlow();
  }

  // ─── 4. NAVBAR SCROLL EFFECT ────────────────────────────────
  function initNavScroll() {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var scrolled = false;
    function checkScroll() {
      var y = window.scrollY || window.pageYOffset;
      if (y > 50 && !scrolled) {
        nav.style.background = 'rgba(10,10,10,0.92)';
        nav.style.borderBottomColor = 'rgba(255,106,0,0.1)';
        nav.style.backdropFilter = 'blur(20px)';
        nav.style.webkitBackdropFilter = 'blur(20px)';
        scrolled = true;
      } else if (y <= 50 && scrolled) {
        nav.style.background = 'rgba(10,10,10,0.88)';
        nav.style.borderBottomColor = 'rgba(255,255,255,0.06)';
        nav.style.backdropFilter = 'blur(24px)';
        nav.style.webkitBackdropFilter = 'blur(24px)';
        scrolled = false;
      }
    }

    // Set transition
    nav.style.transition = 'background 0.3s ease, border-color 0.3s ease';
    window.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
  }

  // ─── 5. BUTTON GLOW PULSE ──────────────────────────────────
  function initButtonGlow() {
    // Add pulsing glow to primary hero CTA
    var heroBtn = document.querySelector('.btn-hero');
    if (heroBtn && !prefersReduced) {
      heroBtn.style.animation = 'btnGlow 2s ease-in-out infinite';
    }
  }

  // ─── INIT ──────────────────────────────────────────────────
  // Wait for DOM + fonts
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let fonts load for accurate SplitType measurements
    setTimeout(init, 100);
  }

  function init() {
    initNavScroll();
    initCursorGlow();
    initButtonGlow();
    // Delay text animations slightly for fonts
    setTimeout(function() {
      initHeroAnimations();
      initScrollAnimations();
    }, 200);
  }
})();
