// Wardrobe AI website: theme toggle, mobile menu and scroll-in animations. No dependencies.
// The theme was already applied before first paint by the inline script in <head>; this file adds the
// toggle. The choice is saved under the same key the web app uses ("wardrobe.theme"), so the site and
// the app (same origin on GitHub Pages) share it.
(function () {
  var root = document.documentElement;
  var KEY = 'wardrobe.theme';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null;
    }
  }
  function apply(theme) {
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#15111D' : '#F8F7FC');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }
  apply(root.dataset.theme || 'light');

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        /* not saved; still applies on this page */
      }
      apply(next);
    });
  });
  // Follow the system theme live while the visitor has not chosen one.
  if (media && media.addEventListener) {
    media.addEventListener('change', function (e) {
      if (!saved()) apply(e.matches ? 'dark' : 'light');
    });
  }

  // Mobile menu
  var menuButton = document.querySelector('[data-menu-toggle]');
  var nav = document.getElementById('site-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        menuButton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Scroll-in animations (skipped when reduced motion is requested; CSS shows everything then).
  var reveal = document.querySelectorAll('.reveal');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) {
    reveal.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    reveal.forEach(function (el) { io.observe(el); });
  }

  // Opening splash: keep it at least ~1 s so the animation reads, then fade it out once the page has
  // loaded, and remember it for this browser session.
  var splash = document.querySelector('.site-splash');
  if (splash && root.classList.contains('show-splash')) {
    var shownAt = Date.now();
    var hide = function () {
      setTimeout(function () {
        splash.classList.add('out');
        try { sessionStorage.setItem('wardrobe.splash', '1'); } catch (e) {}
        setTimeout(function () { root.classList.remove('show-splash'); }, 500);
      }, Math.max(0, 1100 - (Date.now() - shownAt)));
    };
    if (document.readyState === 'complete') hide();
    else window.addEventListener('load', hide);
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
