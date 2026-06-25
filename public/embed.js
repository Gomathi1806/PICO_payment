/**
 * Pico Paywall Embed — v0.2 (x402-backed)
 *
 * Drop into any article to gate the content behind a micropayment:
 *
 *   <div class="pico-paywall"
 *        data-link-id="YOUR_PICO_LINK_ID"
 *        data-price="0.50"
 *        data-title="The full article"
 *        data-preview-selector="#article-body"
 *        data-preview-words="100">
 *   </div>
 *   <script src="https://pico.link/embed.js" async></script>
 *
 * Payment is settled via the x402 protocol against Pico's facilitator
 * endpoint. On every page load the embed first tries a plain GET against
 * /api/content/[id]; if the reader already paid in a previous session
 * (and the facilitator's cache still vouches for it) the content
 * unlocks inline with no popup at all. First-time payers still see the
 * Pico checkout popup because most fans don't have an x402-aware wallet
 * bundled into the publisher's page yet — that comes in Phase 2 via an
 * optional @pico/embed-react SDK.
 */
(function () {
  'use strict';

  // ── config ────────────────────────────────────────────────────────────
  var SCRIPT = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  var ORIGIN = (function () {
    try { return new URL(SCRIPT.src).origin; } catch (_) { return 'https://pico.link'; }
  })();

  var STORAGE_PREFIX = 'pico_unlocked_';

  // ── helpers ───────────────────────────────────────────────────────────
  function hasUnlocked(linkId) {
    try { return localStorage.getItem(STORAGE_PREFIX + linkId) === '1'; } catch (_) { return false; }
  }
  function markUnlocked(linkId) {
    try { localStorage.setItem(STORAGE_PREFIX + linkId, '1'); } catch (_) { /* private mode */ }
  }
  function truncateWords(text, n) {
    var words = text.trim().split(/\s+/);
    if (words.length <= n) return text;
    return words.slice(0, n).join(' ') + '…';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, '\\$&');
  }

  function injectStyles() {
    if (document.getElementById('pico-paywall-styles')) return;
    var css = ''
      + '.pico-paywall{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
      +   'border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:24px;margin:24px 0;'
      +   'background:linear-gradient(180deg,#fafafa 0%,#f3f4f6 100%);text-align:center;}'
      + '@media (prefers-color-scheme:dark){.pico-paywall{background:linear-gradient(180deg,#1a1a1f 0%,#13131a 100%);'
      +   'border-color:rgba(255,255,255,.08);color:#e7e7ea}}'
      + '.pico-paywall__lock{font-size:28px;margin-bottom:8px}'
      + '.pico-paywall__title{font-size:16px;font-weight:600;margin:0 0 4px;line-height:1.3}'
      + '.pico-paywall__sub{font-size:13px;color:#71717a;margin:0 0 18px}'
      + '.pico-paywall__btn{display:inline-block;background:#3b82f6;color:#fff;font-weight:600;font-size:14px;'
      +   'padding:12px 22px;border:0;border-radius:10px;cursor:pointer;text-decoration:none}'
      + '.pico-paywall__btn:hover{background:#2563eb}'
      + '.pico-paywall__btn:disabled{opacity:.6;cursor:wait}'
      + '.pico-paywall__powered{font-size:11px;color:#9ca3af;margin-top:14px;letter-spacing:.02em}'
      + '.pico-paywall__powered a{color:inherit;text-decoration:underline}'
      + '.pico-paywall__protocol{font-size:10px;color:#9ca3af;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}'
      + '.pico-paywall__error{color:#dc2626;font-size:12px;margin-top:10px}';
    var style = document.createElement('style');
    style.id = 'pico-paywall-styles';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function applyPreview(el, words) {
    if (!el || el.dataset.picoOriginalHtml) return;
    el.dataset.picoOriginalHtml = el.innerHTML;
    var text = el.innerText || el.textContent || '';
    el.innerHTML = '<p>' + truncateWords(text, words) + '</p>';
  }
  function restoreContent(el) {
    if (!el || !el.dataset.picoOriginalHtml) return;
    el.innerHTML = el.dataset.picoOriginalHtml;
    delete el.dataset.picoOriginalHtml;
  }

  // ── x402 fast-path ────────────────────────────────────────────────────
  // The Pico content endpoint speaks x402. A bare GET returns either 200
  // (payment cached / facilitator vouches for this client) or 402 with
  // payment requirements. The fetch can also pass cached payment proof
  // via credentials so returning readers unlock without a popup.
  function tryFastUnlock(linkId) {
    var url = ORIGIN + '/api/content/' + encodeURIComponent(linkId);
    return fetch(url, { credentials: 'include' }).then(function (res) {
      if (res.status === 200) return res.json();
      return null; // 402 or anything else falls through to popup flow
    }).catch(function () { return null; });
  }

  // ── core ──────────────────────────────────────────────────────────────
  function mountPaywall(host) {
    var linkId = host.dataset.linkId;
    if (!linkId) { console.warn('[Pico] paywall missing data-link-id'); return; }

    var price = host.dataset.price || '';
    var title = host.dataset.title || 'this article';
    var previewSelector = host.dataset.previewSelector || '';
    var previewWords = parseInt(host.dataset.previewWords || '80', 10);
    var previewEl = previewSelector ? document.querySelector(previewSelector) : null;

    // Cached unlock from a previous visit on this device → reveal immediately.
    if (hasUnlocked(linkId)) {
      restoreContent(previewEl);
      host.style.display = 'none';
      return;
    }

    // Truncate the protected content while we check the server. Even the
    // brief flash between paint and the fast-path response shouldn't show
    // the whole article.
    if (previewEl) applyPreview(previewEl, previewWords);

    // Render the paywall card optimistically — we'll hide it if the
    // fast-path unlock succeeds in the next tick.
    host.innerHTML = ''
      + '<div class="pico-paywall__lock">🔒</div>'
      + '<p class="pico-paywall__title">Continue reading ' + escapeHtml(title) + '</p>'
      + '<p class="pico-paywall__sub">' + (price ? 'Unlock for £' + escapeHtml(price) + ' · ' : '')
      +   'Pay with Apple Pay or card · no signup</p>'
      + '<button class="pico-paywall__btn" type="button">'
      +   (price ? '🔓 Unlock for £' + escapeHtml(price) : '🔓 Unlock article')
      + '</button>'
      + '<div class="pico-paywall__error" hidden></div>'
      + '<p class="pico-paywall__powered">Powered by <a href="' + ORIGIN + '/publishers" target="_blank" rel="noopener">Pico</a> · Secure micropayments</p>'
      + '<p class="pico-paywall__protocol">Settled via x402 protocol on Base</p>';

    var btn = host.querySelector('button');
    var errEl = host.querySelector('.pico-paywall__error');

    // Try the server fast-path. If the facilitator (or our session
    // cookie) confirms this client already paid, unlock without a popup.
    tryFastUnlock(linkId).then(function (data) {
      if (!data) return;
      markUnlocked(linkId);
      restoreContent(previewEl);
      host.style.display = 'none';
    });

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Opening checkout…';
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }

      // First-time payers still go through the Pico checkout popup
      // because most fan browsers don't have an x402-aware wallet
      // bundled into the publisher's page. The popup's payment is now
      // validated by the x402 facilitator on the server side.
      var w = 460, h = 760;
      var left = (window.outerWidth - w) / 2 + (window.screenX || 0);
      var top = (window.outerHeight - h) / 2 + (window.screenY || 0);
      var popup = window.open(
        ORIGIN + '/p/' + encodeURIComponent(linkId) + '?embed=1',
        'pico-checkout',
        'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top
      );

      if (!popup) {
        window.location.href = ORIGIN + '/p/' + encodeURIComponent(linkId);
        return;
      }

      var pollClosed = setInterval(function () {
        if (popup.closed) {
          clearInterval(pollClosed);
          if (!hasUnlocked(linkId)) {
            btn.disabled = false;
            btn.textContent = price ? '🔓 Unlock for £' + price : '🔓 Unlock article';
          }
        }
      }, 600);
    });
  }

  // Global postMessage handler — only trusts messages from the Pico origin.
  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data || {};
    if (data.type !== 'pico:unlock' || !data.linkId) return;

    markUnlocked(data.linkId);
    document.querySelectorAll('.pico-paywall[data-link-id="' + cssEscape(data.linkId) + '"]')
      .forEach(function (host) {
        var selector = host.dataset.previewSelector;
        if (selector) restoreContent(document.querySelector(selector));
        host.style.display = 'none';
      });
  });

  function init() {
    injectStyles();
    document.querySelectorAll('.pico-paywall').forEach(mountPaywall);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
