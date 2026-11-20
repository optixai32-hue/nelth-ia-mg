/**
 * Nelth-AI — Firebase Analytics bridge (mesure d'audience GA via Firebase).
 *
 * La console Firebase (projet ethan-nairah) expose une config web PUBLIQUE
 * avec un measurementId (G-…) dès que Google Analytics est activé.
 * /api/config la sert pre-auth dans  analytics.firebase  (clé + projectId +
 * measurementId, voir src/lib/firebase-analytics.ts) : ce bridge charge le
 * SDK Firebase depuis le CDN gstatic — mêmes versions 10.12.2 que
 * google-bridge.js — initialise l'app puis Analytics, et laisse le SDK
 * émettre ses événements automatiques (first_visit, session_start, et le
 * page_view du chargement initial).
 *
 * Vues SPA : le bundle compilé route côté client (history API) sans rechargement,
 * donc les changements de vue échapperaient au page_view initial. Ce bridge
 * instrumente pushState/replaceState/popstate et émet un page_view debouncé
 * (300 ms) à chaque changement de route — parité avec le comportement GA4
 * natif d'un site multi-pages.
 *
 * Garde-fous (l'analytics ne doit JAMAIS casser l'app) :
 *   • pas de measurementId dans /api/config → bridge totalement inerte ;
 *   • isSupported() faux (stockage indisponible, mode privé strict…) → silence ;
 *   • CDN gstatic injoignable / import qui échoue / quota — tout est avalé ;
 *   • aucune donnée personnelle n'est collectée : événements standards GA4
 *     uniquement (page_view + automatiques), aucun setUserId.
 *
 * 0.14.14 — app NOMMÉE 'nelth-analytics' : le nom '[DEFAULT]' reste réservé
 * au pont Google (google-bridge.js). Deux initializeApp avec des options
 * différentes sur le MÊME nom lèvent app/duplicate-app (la config analytics
 * est un sur-ensemble — measurementId, appId… — donc jamais « égales » à la
 * config partielle du pont Google) et cassaient la connexion Google. Avec
 * une app nommée, Analytics fonctionne pleinement et ne touche jamais
 * '[DEFAULT]' — les deux ponts s'ignorent quel que soit l'ordre d'exécution.
 */
(() => {
  if (window.__nelthAnalyticsBridge) return;
  window.__nelthAnalyticsBridge = true;

  var FIREBASE_APP = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
  var FIREBASE_ANALYTICS = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
  var APP_NAME = 'nelth-analytics';

  // Ressemble la config (le SPA appelle déjà /api/config au boot ; ici c'est
  // mis en cache par le navigateur, coût quasi nul — même garde que
  // google-bridge.js).
  fetch('/api/config', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      var a = cfg && cfg.analytics && cfg.analytics.firebase;
      if (!a || !a.apiKey || !a.measurementId) return;

      Promise.all([import(FIREBASE_APP), import(FIREBASE_ANALYTICS)])
        .then(function (mods) {
          var appMod = mods[0];
          var analyticsMod = mods[1];

          // Environnements sans stockage disponible : Analytics refuse de
          // démarrer — on reste silencieux.
          return analyticsMod.isSupported().then(function (ok) {
            if (!ok) return null;
            var app = obtainAnalyticsApp(appMod, a);
            var analytics = analyticsMod.getAnalytics(app);
            watchSpaRoutes(analyticsMod, analytics);
            return analytics;
          });
        })
        .catch(function () { /* CDN injoignable, quota, etc. — silence total */ });
    })
    .catch(function () { /* /api/config indisponible — analytics désactivé */ });

  /**
   * App NOMMÉE (jamais '[DEFAULT]', réservé au pont Google) : initializeApp
   * avec un nom déjà pris et des options différentes lève app/duplicate-app.
   * Le pont Google a aussi sa propre garde (réutilisation de '[DEFAULT]').
   */
  function obtainAnalyticsApp(appMod, cfg) {
    var exists = appMod.getApps().some(function (x) {
      return x.name === APP_NAME;
    });
    return exists ? appMod.getApp(APP_NAME) : appMod.initializeApp(cfg, APP_NAME);
  }

  /**
   * page_view à chaque changement de route SPA (le SDK n'émet automatiquement
   * QUE le page_view du chargement initial). pushState/replaceState sont
   * patchés, popstate écouté ; un debounce 300 ms regroupe les remplacements
   * successifs du routeur (une seule vue comptée par navigation).
   */
  function watchSpaRoutes(analyticsMod, analytics) {
    var timer = null;

    function sendPageView() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        try {
          analyticsMod.logEvent(analytics, 'page_view', {
            page_location: window.location.href,
            page_path: window.location.pathname,
            page_title: document.title || ''
          });
        } catch (e) { /* jamais bloquant */ }
      }, 300);
    }

    ['pushState', 'replaceState'].forEach(function (method) {
      var original = history[method];
      if (typeof original !== 'function') return;
      history[method] = function () {
        var out = original.apply(this, arguments);
        sendPageView();
        return out;
      };
    });
    window.addEventListener('popstate', sendPageView);
  }
})();
