/* ============================================
   motion-prefs.js — 动效偏好与设备档位判定
   契约 §3 降级链：high → mid → low → 静态渐变
   · prefers-reduced-motion: reduce → 直接静态档
   · saveData / 低内存 / 弱并发 → low
   · 移动端默认 mid（低配再降 low）
   档位上限：粒子 900 / 400 / 120，DPR 上限 1.5
   ============================================ */
(function () {
  'use strict';

  var reducedQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  function computeTier() {
    /* 1. 系统级减少动效：静态档，内容完整可读 */
    if (reducedQuery && reducedQuery.matches) return 'static';

    var nav = navigator || {};
    var conn = nav.connection || {};

    /* 2. 省流量模式：low */
    if (conn.saveData) return 'low';

    var memory = nav.deviceMemory || 8;
    var cores = nav.hardwareConcurrency || 8;

    /* 3. 低配设备：low */
    if (memory <= 2 || cores <= 2) return 'low';

    /* 4. 移动端默认 mid/low，桌面 high */
    var isCoarse = window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    var isNarrow = window.innerWidth <= 768;

    if (isCoarse || isNarrow) {
      return (memory <= 4 || cores <= 4) ? 'low' : 'mid';
    }
    if (memory <= 4 || cores <= 4) return 'mid';

    return 'high';
  }

  var tier = computeTier();
  var listeners = [];

  function applyTier(next) {
    MotionPrefs.tier = next;
    /* 供 CSS 档位化选择器使用（如 low 档关闭 nav backdrop-filter，契约 §5 US-05-3） */
    if (document.documentElement) {
      document.documentElement.setAttribute('data-motion-tier', next);
    }
  }

  if (reducedQuery && reducedQuery.addEventListener) {
    reducedQuery.addEventListener('change', function () {
      var next = computeTier();
      if (next !== MotionPrefs.tier) {
        applyTier(next);
        emit();
      }
    });
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i](MotionPrefs);
  }

  var PARTICLE_MAX = { high: 900, mid: 400, low: 120, static: 0 };
  /* low 档 20fps：弱设备上把每帧合成预算让给滚动/交互（动效仍持续可见） */
  var FPS = { high: 30, mid: 30, low: 20, static: 0 };

  window.MotionPrefs = {
    /** 当前档位：'high' | 'mid' | 'low' | 'static' */
    tier: tier,
    get reduced() {
      return !!(reducedQuery && reducedQuery.matches);
    },
    particleMax: PARTICLE_MAX,
    fps: FPS,
    /** Canvas DPR 上限（契约 --hero-dpr-cap） */
    dprCap: 1.5,
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    off: function (fn) {
      var i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    }
  };

  applyTier(tier);
})();
