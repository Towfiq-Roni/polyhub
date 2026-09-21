/* hub theme switcher — dark (default) / light. Self-injects a toggle into
   .topbar-actions, next to the notification/user cluster (identical topbar
   sequence on every screen). Persists to localStorage['hub-theme'], applies
   via `data-theme` on <html>, read on every page load. No behavior change
   from the confirmed prior implementation — verified against the current
   design/styles.css `.icon-btn`/`.user-menu`/`.notif-wrap` classes below,
   still correct after the shell delta (DEC-055). */
(function () {
  var KEY = 'hub-theme';
  var SUN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.innerHTML = theme === 'light' ? MOON : SUN;
      btn.title = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
      btn.setAttribute('aria-pressed', String(theme === 'light'));
    }
  }

  var saved;
  try { saved = localStorage.getItem(KEY) || 'dark'; } catch (e) { saved = 'dark'; }
  apply(saved);

  function mount() {
    var host = document.querySelector('.topbar-actions') || document.querySelector('.toolbar');
    if (!host || document.getElementById('themeToggle')) return;
    var btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'icon-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Toggle light / dark theme');
    var anchor = host.querySelector('.user-menu') || host.querySelector('.notif-wrap');
    if (anchor) host.insertBefore(btn, anchor); else host.appendChild(btn);
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      apply(next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
    });
    apply(document.documentElement.getAttribute('data-theme') || 'dark');
  }

  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
