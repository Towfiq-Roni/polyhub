/* hub shell — delegated behaviors + SPA content router (survives content
   swaps; sidebar/header never reload).
   Rebuilt after design/ was deleted (DEC-055) on top of the confirmed prior
   implementation, with the shell delta from
   docs/designs/phase0-redesign-claude-handoff-plan.md §2 applied:
     - sidebar is a fixed, always-visible column that auto-collapses to a
       64px icon rail below 900px (one-way narrow-crossing bookkeeping,
       mirrors Sidebar.dc.html's checkWidth()) — NOT an off-canvas drawer.
       `.menu-btn` / `.nav-backdrop` / `.app-shell.nav-open` are retired.
     - topbar search + notification popovers, driven by the `hidden`
       attribute per the shared `.search-dropdown`/`.notif-dropdown`/
       `.user-dropdown` popover pattern in styles.css.
     - downloadCSV() helper for later dashboard/finance-dashboard export use
       (coexists with the pre-existing `.export-bar` demo-alert pattern).
     - SPA router preserves the full href (incl. `?id=...`) through fetch,
       pushState, and popstate; interception is generalized from
       "sidebar clicks only" to any local *.html link inside the app shell,
       since detail screens now hydrate via `?id=` from non-sidebar links
       (list rows, search results, user-menu items) and all of them need
       the same query-preserving swap.
   ========================================================================== */
(function () {
  var NO_SPA_TARGETS = ['login.html', 'index.html'];

  function shell() { return document.querySelector('.app-shell'); }

  /* ---- splash letter-split (app-shell demo only) ---- */
  function splitLetters() {
    document.querySelectorAll('body > .polygon-loading').forEach(function (loader) {
      if (loader.dataset.split) return;
      loader.dataset.split = '1';
      var text = loader.textContent.trim();
      loader.innerHTML = '';
      text.split('').forEach(function (ch, i) {
        var span = document.createElement('span');
        span.textContent = ch === ' ' ? ' ' : ch;
        span.style.animationDelay = (i * 100) + 'ms';
        loader.appendChild(span);
      });
    });
  }
  splitLetters();

  /* ---- restore persisted sidebar collapse state ---- */
  if (shell() && localStorage.getItem('hub-sidebar') === 'collapsed') shell().classList.add('collapsed');

  /* ---- reveal: skeletons -> content (load + after each SPA swap) ---- */
  window.hubReveal = function () {
    setTimeout(function () {
      var loader = document.getElementById('loader');
      if (loader) loader.style.display = 'none';
      var dash = document.getElementById('dashContent');
      if (dash) dash.hidden = false;
      document.querySelectorAll('.kpi-card.skeleton, .card.skeleton').forEach(function (el, i) {
        setTimeout(function () { el.classList.remove('skeleton'); }, i * 80);
      });
      document.querySelectorAll('.skeleton-row').forEach(function (r) { r.remove(); });
      document.querySelectorAll('.attention-skeleton').forEach(function (s) { s.remove(); });
      document.querySelectorAll('main tr[hidden]:not(.row-detail), main .attention-item[hidden]').forEach(function (r, i) {
        setTimeout(function () { r.hidden = false; }, i * 60);
      });
      document.querySelectorAll('.skeleton, .skeleton-row, .attention-skeleton').forEach(function (el) {
        el.classList.add('loaded');
      });
    }, 500);
  };
  window.hubReveal();

  /* ==========================================================================
     Sidebar auto-collapse — one-way narrow-crossing bookkeeping.
     Mirrors Sidebar.dc.html's checkWidth(): only forces `.collapsed` on the
     transition INTO narrow (<900px), never forces it back off above 900px.
     Manual state (toggle button / brand-click-expand) is untouched by this.
     ========================================================================== */
  var isNarrow = false;
  function checkWidth() {
    var narrow = window.innerWidth < 900;
    if (narrow === isNarrow) return;
    isNarrow = narrow;
    var s = shell();
    if (narrow && s && !s.classList.contains('collapsed')) {
      s.classList.add('collapsed');
    }
  }
  checkWidth();
  window.addEventListener('resize', checkWidth);

  /* ==========================================================================
     Popover pattern: search / notification / user dropdowns share one
     `[hidden]`-toggled visual rule (styles.css). One place opens/closes all.
     ========================================================================== */
  function closeAllDropdowns() {
    document.querySelectorAll('.search-dropdown, .notif-dropdown, .user-dropdown').forEach(function (d) {
      d.hidden = true;
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- global search: static index, live-filtered dropdown ---- */
  var SEARCH_INDEX = [
    { name: 'ERP Implementation', type: 'Project', href: 'project-detail.html' },
    { name: 'CRM Migration', type: 'Project', href: 'project-detail.html' },
    { name: 'Mobile Banking App', type: 'Project', href: 'project-detail.html' },
    { name: 'Website Redesign', type: 'Project', href: 'project-detail.html' },
    { name: 'Acme Corp', type: 'Client', href: 'client-detail.html' },
    { name: 'Bayzid Group', type: 'Client', href: 'client-detail.html' },
    { name: 'Delta Tech', type: 'Client', href: 'client-detail.html' },
    { name: 'Rahim Uddin', type: 'Team Member', href: 'team-member-detail.html' },
    { name: 'Karim Ali', type: 'Team Member', href: 'team-member-detail.html' },
    { name: 'Farida Akter', type: 'Team Member', href: 'team-member-detail.html' },
    { name: 'Transactions', type: 'Page', href: 'transactions.html' },
    { name: 'Receivables', type: 'Page', href: 'receivables.html' },
    { name: 'Payables', type: 'Page', href: 'payables.html' },
    { name: 'Payment Entry', type: 'Page', href: 'payment-entry.html' },
    { name: 'Accounts', type: 'Page', href: 'accounts.html' },
    { name: 'Reports', type: 'Page', href: 'reports.html' }
  ];

  function renderSearchResults(input) {
    var wrap = input.closest('.topbar-search');
    var dd = wrap && wrap.querySelector('.search-dropdown');
    if (!dd) return;
    var q = input.value.trim().toLowerCase();
    if (!q) { dd.hidden = true; dd.innerHTML = ''; return; }
    var results = SEARCH_INDEX.filter(function (r) { return r.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 6);
    dd.innerHTML = results.length
      ? results.map(function (r) {
          return '<a class="search-result" href="' + r.href + '" role="option">' +
            '<span class="search-result-type">' + escapeHtml(r.type) + '</span>' + escapeHtml(r.name) + '</a>';
        }).join('')
      : '<div class="search-empty">No matches for "' + escapeHtml(input.value.trim()) + '"</div>';
    dd.hidden = false;
  }

  document.addEventListener('input', function (e) {
    var input = e.target.closest('.topbar-search input');
    if (input) renderSearchResults(input);
  });
  document.addEventListener('focusin', function (e) {
    var input = e.target.closest('.topbar-search input');
    if (input) renderSearchResults(input);
  });
  document.addEventListener('focusout', function (e) {
    var input = e.target.closest('.topbar-search input');
    if (!input) return;
    /* delay so a click on a search-result inside the dropdown still registers */
    setTimeout(function () {
      var dd = input.closest('.topbar-search').querySelector('.search-dropdown');
      if (dd) dd.hidden = true;
    }, 150);
  });
  document.addEventListener('keydown', function (e) {
    var input = e.target.closest('.topbar-search input');
    if (input) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim().toLowerCase();
        if (!q) return;
        var match = SEARCH_INDEX.filter(function (r) { return r.name.toLowerCase().indexOf(q) !== -1; })[0];
        if (match) {
          var dd = input.closest('.topbar-search').querySelector('.search-dropdown');
          if (dd) dd.hidden = true;
          navigate(match.href, true);
        }
      } else if (e.key === 'Escape') {
        input.value = '';
        renderSearchResults(input);
        input.blur();
      }
      return;
    }
    if (e.key === 'Escape') closeAllDropdowns();
  });

  /* ---- notification bell: seeded rows + empty state, rendered once ---- */
  var NOTIFICATIONS = [
    { text: 'Milestone M-3 overdue 3 days', meta: 'Mobile Banking App' },
    { text: 'Client Bayzid contract expires in 7 days', meta: 'Renewal pending' },
    { text: 'BDS partner invoice awaiting approval', meta: '৳350,000.00' }
  ];

  function renderNotifications() {
    document.querySelectorAll('.notif-dropdown').forEach(function (dd) {
      var body = NOTIFICATIONS.length
        ? NOTIFICATIONS.map(function (n) {
            return '<div class="notif-item"><div class="notif-item-title">' + escapeHtml(n.text) + '</div>' +
              '<div class="notif-item-meta">' + escapeHtml(n.meta) + '</div></div>';
          }).join('')
        : '<div class="notif-empty">You’re all caught up</div>';
      dd.innerHTML = '<div class="notif-header">Notifications</div>' + body;
    });
  }
  renderNotifications();

  /* ---- delegated row-detail disclosure (REQ-32 congestion: demoted meta columns) ---- */
  document.addEventListener('click', function (e) {
    var row = e.target.closest('tr[data-expandable]');
    if (!row || e.target.closest('a, button')) return;
    var detail = row.nextElementSibling;
    if (!detail || !detail.classList.contains('row-detail')) return;
    var open = detail.hidden;
    detail.hidden = !open;
    row.setAttribute('aria-expanded', String(open));
  });

  /* ---- delegated tabs ---- */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('.tab-btn');
    if (!tab) return;
    var scope = tab.closest('main') || document;
    var tabs = scope.querySelectorAll('.tab-btn');
    var panels = scope.querySelectorAll('.tab-panel');
    tabs.forEach(function (t2) { t2.classList.remove('active'); t2.setAttribute('aria-selected', 'false'); });
    panels.forEach(function (p2) { p2.classList.remove('active'); p2.hidden = true; });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    var panel = document.getElementById(tab.id.replace('-tab', '-panel'));
    if (panel) { panel.classList.add('active'); panel.hidden = false; }
  });

  /* ---- delegated export-bar demos (kept alongside downloadCSV()) ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.export-bar .btn');
    if (!btn) return;
    var bar = btn.closest('.export-bar, .panel-footer');
    if (!bar) return;
    var selects = bar.querySelectorAll('select');
    var fmt = selects[0] ? selects[0].value : 'xlsx';
    var period = selects[1] ? selects[1].value : 'this-month';
    window.alert('Demo: export ' + fmt.toUpperCase() + ' • ' + period + ' (Phase 8 exports)');
  });

  /* ---- delegated demo forms ---- */
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('main form');
    if (!form) return;
    e.preventDefault();
    window.alert('Demo: submission captured (wired to API in Phase 2+)');
  });

  /* ---- real client-side CSV export helper (for dashboard/finance-dashboard) ----
     Distinct from the .export-bar demo-alert above — both coexist. */
  window.downloadCSV = function (filename, headers, rows) {
    var field = function (v) {
      var s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = [headers.map(field).join(',')].concat(
      rows.map(function (row) { return row.map(field).join(','); })
    );
    var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---- delegated shell behaviors: collapse toggle, brand-expand, popovers ---- */
  document.addEventListener('click', function (e) {
    var s = shell();

    var cbtn = e.target.closest('#sidebarCollapse');
    if (cbtn && s) {
      var collapsed = s.classList.toggle('collapsed');
      try { localStorage.setItem('hub-sidebar', collapsed ? 'collapsed' : 'expanded'); } catch (err) {}
      return;
    }

    if (e.target.closest('.sidebar-brand') && s && s.classList.contains('collapsed')) {
      s.classList.remove('collapsed');
      try { localStorage.setItem('hub-sidebar', 'expanded'); } catch (err) {}
      return;
    }

    var notifBtn = e.target.closest('.notif-wrap .icon-btn');
    var userBtn = e.target.closest('.user-menu .user-trigger, .user-menu .user-btn');
    if (notifBtn || userBtn) {
      var wrap = (notifBtn || userBtn).closest('.notif-wrap, .user-menu');
      var dd = wrap && wrap.querySelector('.notif-dropdown, .user-dropdown');
      var willOpen = !!dd && dd.hidden;
      closeAllDropdowns();
      if (dd) dd.hidden = !willOpen;
      return;
    }

    if (!e.target.closest('.notif-dropdown, .user-dropdown, .search-dropdown, .topbar-search')) {
      closeAllDropdowns();
    }
  });

  /* ==========================================================================
     SPA router: swaps <main> content only (sidebar/topbar/footer persist).
     Generalized from "sidebar clicks only" to any local *.html link inside
     the shell, since detail screens are reached via list rows, search
     results, and user-menu items too, not only the sidebar — all of them
     must preserve `?id=...` through fetch/pushState/popstate alike.
     login.html and index.html opt out: neither shares the app-shell layout,
     so they always get a full navigation.
     ========================================================================== */
  function isNavigableLink(a) {
    if (!a) return false;
    var href = a.getAttribute('href');
    if (!href) return false;
    if (/^(https?:|mailto:|tel:|#)/i.test(href)) return false;
    if (!/\.html(\?|$)/i.test(href)) return false;
    var basename = href.split('/').pop().split('?')[0];
    return NO_SPA_TARGETS.indexOf(basename) === -1;
  }

  function applyDoc(doc, hrefNoQuery) {
    var newMain = doc.querySelector('main.content') || doc.querySelector('main');
    var curMain = document.querySelector('main.content') || document.querySelector('main');
    if (!newMain || !curMain) return false;
    curMain.innerHTML = newMain.innerHTML;
    if (doc.title) document.title = doc.title;
    var pt = doc.querySelector('.page-title, .topbar-title');
    var curPt = document.querySelector('.page-title, .topbar-title');
    if (pt && curPt) curPt.textContent = pt.textContent;
    document.querySelectorAll('.sidebar a.nav-item').forEach(function (a) {
      var active = a.getAttribute('href') === hrefNoQuery;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    return true;
  }

  function runPageScripts(doc) {
    doc.querySelectorAll('script[data-page]').forEach(function (old) {
      try { new Function(old.textContent)(); }
      catch (err) { console.error('[hub-spa] page script failed:', err); }
    });
  }

  function navigate(url, push) {
    fetch(url, { headers: { 'X-Hub-SPA': '1' } }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var basename = url.split('/').pop().split('?')[0];
      if (!applyDoc(doc, basename)) { location.href = url; return; }
      if (push) history.pushState({ hub: url }, '', url);
      runPageScripts(doc);
      window.hubReveal();
      window.scrollTo(0, 0);
    }).catch(function () { location.href = url; });
  }
  window.hubNavigate = navigate;

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    if (!isNavigableLink(a)) return;
    e.preventDefault();
    closeAllDropdowns();
    navigate(a.getAttribute('href'), true);
  });

  window.addEventListener('popstate', function () {
    navigate(location.pathname.split('/').pop() + location.search, false);
  });
})();
