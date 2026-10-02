/*
 * Shared header, footer and live numbers for the public pages.
 * Each page has <div id="site-header"></div> and <div id="site-footer"></div>.
 */
(function () {
  // Local copies talk to the server on this computer; the live site uses its own address.
  var API = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].indexOf(window.location.hostname) !== -1 ? 'http://localhost:4000' : '') + '/api';

  var NAV = [
    ['index.html', 'Home'],
    ['how-it-works.html', 'How it works'],
    ['for-donors.html', 'Donors'],
    ['for-orphanages.html', 'Orphanages'],
    ['for-partners.html', 'Partners'],
    ['about.html', 'About'],
    ['faq.html', 'FAQ'],
    ['contact.html', 'Contact']
  ];

  var HEART =
    '<svg viewBox="0 0 100 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M50 88 C 18 63, 6 35, 26 16 C 39 4, 50 16, 50 33 C 50 16, 61 4, 74 16 C 94 35, 82 63, 50 88 Z" fill="#12804A"/>' +
      '<path d="M50 33 C 50 48, 46 64, 50 88" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55" fill="none"/>' +
      '<circle cx="50" cy="9" r="6" fill="#E9B93A"/>' +
    '</svg>';

  function currentPage() {
    var file = window.location.pathname.split('/').pop();
    return file === '' ? 'index.html' : file;
  }

  // Where does a signed-in person go? Returns null for visitors.
  function dashboardLink() {
    try {
      var raw = window.sessionStorage.getItem('cocSession') || window.localStorage.getItem('cocSession');
      if (raw) {
        var session = JSON.parse(raw);
        if (session && session.token) return session.role === 'volunteer' ? 'orphanage/index.html' : 'donor/index.html';
      }
      if (window.localStorage.getItem('partnerToken')) return 'partner/dashboard.html';
    } catch (err) {
      // storage can be blocked; treat as a visitor
    }
    return null;
  }

  function buildHeader() {
    var page = currentPage();
    var links = NAV.map(function (item) {
      return '<li><a href="' + item[0] + '"' + (item[0] === page ? ' aria-current="page"' : '') + '>' + item[1] + '</a></li>';
    }).join('');

    var dash = dashboardLink();
    var actions = dash
      ? '<a class="btn btn-primary" href="' + dash + '"><i class="bi bi-speedometer2"></i> My dashboard</a>'
      : '<a class="btn btn-outline" href="login/index.html">Sign in</a><a class="btn btn-primary" href="login/register.html">Join us</a>';

    return (
      '<a class="skip-link" href="#main">Skip to content</a>' +
      '<div class="flag-bar"></div>' +
      '<header class="site-header" id="siteHeader"><div class="wrap header-inner">' +
        '<a class="brand" href="index.html" aria-label="CAM Orphanage Connect, home">' + HEART +
          '<span class="brand-text">CAM Orphanage<span>Connect</span></span></a>' +
        '<button class="nav-toggle" type="button" id="navToggle" aria-expanded="false" aria-controls="navMenu" aria-label="Open the menu"><i class="bi bi-list"></i></button>' +
        '<div class="nav-menu" id="navMenu"><ul class="nav-links">' + links + '</ul><div class="nav-actions">' + actions + '</div></div>' +
      '</div></header>'
    );
  }

  function buildFooter() {
    return (
      '<footer class="site-footer"><div class="flag-bar"></div><div class="wrap">' +
        '<div class="footer-top">' +
          '<div class="footer-brand"><a class="brand" href="index.html">' + HEART +
            '<span class="brand-text">CAM Orphanage<span>Connect</span></span></a>' +
            '<p>Connecting verified children\'s homes in Cameroon with the donors and partners who want to help.</p></div>' +
          '<div><h4>Join us</h4><ul>' +
            '<li><a href="for-donors.html">As a donor</a></li>' +
            '<li><a href="for-orphanages.html">As an orphanage</a></li>' +
            '<li><a href="for-partners.html">As a partner</a></li>' +
            '<li><a href="login/index.html">Sign in</a></li></ul></div>' +
          '<div><h4>Learn more</h4><ul>' +
            '<li><a href="how-it-works.html">How it works</a></li>' +
            '<li><a href="about.html">About us</a></li>' +
            '<li><a href="faq.html">Questions and answers</a></li>' +
            '<li><a href="safeguarding.html">Safeguarding and privacy</a></li>' +
            '<li><a href="terms.html">Terms of use</a></li></ul></div>' +
          '<div><h4>Contact</h4><ul>' +
            '<li data-site-row="email"><i class="bi bi-envelope"></i> <a data-site="email" href="contact.html">Write to the team</a></li>' +
            '<li data-site-row="phone" hidden><i class="bi bi-telephone"></i> <span data-site="phone"></span></li>' +
            '<li data-site-row="address" hidden><i class="bi bi-geo-alt"></i> <span data-site="address"></span></li>' +
            '<li><i class="bi bi-flag"></i> Cameroon</li></ul></div>' +
        '</div>' +
        '<div class="footer-bottom"><span>&copy; ' + new Date().getFullYear() + ' CAM Orphanage Connect. All rights reserved.</span>' +
          '<nav aria-label="Footer"><a href="credits.html">Photo credits</a><a href="admin/index.html">Admin sign-in</a></nav></div>' +
      '</div></footer>'
    );
  }

  function mount() {
    var header = document.getElementById('site-header');
    var footer = document.getElementById('site-footer');
    if (header) header.outerHTML = buildHeader();
    if (footer) footer.outerHTML = buildFooter();

    var siteHeader = document.getElementById('siteHeader');
    var toggle = document.getElementById('navToggle');
    if (toggle && siteHeader) {
      toggle.addEventListener('click', function () {
        var open = siteHeader.classList.toggle('menu-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu');
        toggle.firstElementChild.className = open ? 'bi bi-x-lg' : 'bi bi-list';
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && siteHeader.classList.contains('menu-open')) toggle.click();
      });
    }
  }

  // ---- live numbers and contact details from the server -------------------------------------
  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  function loadStats() {
    var targets = document.querySelectorAll('[data-stat]');
    if (targets.length === 0) return;

    fetch(API + '/site/stats').then(function (r) { return r.json(); }).then(function (stats) {
      targets.forEach(function (el) {
        var key = el.getAttribute('data-stat');
        el.textContent = key === 'totalPledged' ? formatNumber(stats[key]) + ' XAF' : formatNumber(stats[key]);
      });
      var empty = Object.keys(stats).every(function (k) { return !stats[k]; });
      var note = document.getElementById('statsNote');
      if (note) {
        note.textContent = empty
          ? 'We are just getting started. Be one of the first to join.'
          : 'Live figures from the platform, updated as orphanages, donors and partners join.';
      }
    }).catch(function () {
      targets.forEach(function (el) { el.textContent = '-'; });
    });
  }

  function loadSiteInfo() {
    var anyInfo = document.querySelector('[data-site]');
    if (!anyInfo) return;

    fetch(API + '/site/info').then(function (r) { return r.json(); }).then(function (info) {
      document.querySelectorAll('[data-site]').forEach(function (el) {
        var key = el.getAttribute('data-site');
        var value = info[key];
        if (key === 'description' && !value) return;
        var row = document.querySelector('[data-site-row="' + key + '"]');
        if (!value) {
          if (row) row.hidden = true;
          return;
        }
        if (row) row.hidden = false;
        el.textContent = value;
        if (key === 'email') {
          el.setAttribute('href', 'mailto:' + value);
        }
      });
      document.querySelectorAll('[data-site-block]').forEach(function (block) {
        var key = block.getAttribute('data-site-block');
        block.hidden = !info[key];
      });
    }).catch(function () { /* the page still reads fine without them */ });
  }

  // Fade sections in as they scroll into view.
  function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { observer.observe(el); });
  }

  mount();
  loadStats();
  loadSiteInfo();
  reveal();
})();
