/* ============================================
   hero-pointer.js — 指针光晕 + 首屏视差（契约 §5 US-02-1③）
   · 指针光晕：hero 上维护 --pointer-x/--pointer-y CSS 变量，
     驱动 .hero::before 径向暖金光（style.css）
   · 指针视差：.hero__bg 轻微跟随指针（transform，合成器友好）
   · 滚动视差：.hero__bg 随滚动缓移（滚动联动效果）
   约束（契约 §2.2 模块契约）：
   · (pointer: coarse) 或 prefers-reduced-motion（static 档）时禁用
   · 监听一律 {passive:true}；逐帧任务走 MotionCore 单 rAF
   · JS 动效时长常量表与 tokens.css §1.2 同名变量一致（US-02-2）
   ============================================ */
(function () {
  'use strict';

  /* JS 时长常量表（对应 tokens.css：--dur-fast 180ms / --dur-base 400ms） */
  var DUR_FAST = 180;   /* 平滑趋近时间常数（ms），与 --dur-fast 同值 */
  var PARALLAX_AMP = 12; /* 指针视差幅度（px） */
  var SCROLL_AMP = 0.16; /* 滚动视差系数（hero__bg 缓移） */

  var instance = null;

  function HeroPointer(hero) {
    this.hero = hero;
    this.bg = hero.querySelector('.hero__bg');
    this.px = 0;      /* 当前指针偏移（平滑后） */
    this.py = 0;
    this.tx = 0;      /* 目标指针偏移 */
    this.ty = 0;
    this.scrollY = window.pageYOffset || 0;
    this.heroH = 0;
    this.lastApply = '';
    this.disabled = false;
    this._removeTick = null;
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onScroll = this._onScroll.bind(this);
    this._onTierChange = this._onTierChange.bind(this);
    this._tick = this._tick.bind(this);
  }

  HeroPointer.prototype = {

    _onMove: function (e) {
      if (this.disabled) return;
      var r = this.hero.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var nx = (e.clientX - r.left) / r.width;
      var ny = (e.clientY - r.top) / r.height;
      this.tx = nx - 0.5;
      this.ty = ny - 0.5;
      /* 指针光晕：CSS 变量（百分比坐标），供 .hero::before 使用 */
      this.hero.style.setProperty('--pointer-x', (nx * 100).toFixed(2) + '%');
      this.hero.style.setProperty('--pointer-y', (ny * 100).toFixed(2) + '%');
      if (!this.hero.classList.contains('hero--pointer-active')) {
        this.hero.classList.add('hero--pointer-active');
      }
    },

    _onLeave: function () {
      this.tx = 0;
      this.ty = 0;
      this.hero.classList.remove('hero--pointer-active');
    },

    _onScroll: function () {
      this.scrollY = window.pageYOffset || 0;
    },

    /* ---- 逐帧：指数平滑趋近目标（τ = DUR_FAST），合成 transform ----
       hero 滚出视口时跳过 transform 写入，避免离屏样式失效 */
    _tick: function (now) {
      if (this.disabled || !this.bg) return;
      if ((window.pageYOffset || 0) > this.heroH + 120) return;
      var dt = this._lastNow ? Math.min(0.1, (now - this._lastNow) / 1000) : 0.016;
      this._lastNow = now;
      var k = 1 - Math.exp(-dt * 1000 / DUR_FAST);
      this.px += (this.tx - this.px) * k;
      this.py += (this.ty - this.py) * k;

      /* 滚动视差：hero 滚出视口前，背景缓慢下移（视差） */
      var sy = Math.min(this.scrollY, this.heroH) * SCROLL_AMP;

      var x = (this.px * PARALLAX_AMP).toFixed(2);
      var y = (this.py * PARALLAX_AMP + sy).toFixed(2);
      var key = x + ',' + y;
      if (key !== this.lastApply) {
        this.lastApply = key;
        this.bg.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      }

      /* hero 已完全滚出且指针静止：摘除逐帧任务，避免空转 */
      if (this.scrollY > this.heroH && Math.abs(this.tx - this.px) < 0.001
          && Math.abs(this.ty - this.py) < 0.001 && !this._idle) {
        this._idle = true;
      }
    },

    _onTierChange: function () {
      if (window.MotionPrefs && window.MotionPrefs.tier === 'static') {
        /* reduced-motion：清空装饰状态（内容不受影响） */
        this.disabled = true;
        this.hero.classList.remove('hero--pointer-active');
        if (this.bg) this.bg.style.transform = '';
        this._stopTick();
      } else if (this.disabled) {
        this.disabled = false;
        this._startTick();
      }
    },

    _startTick: function () {
      if (!this._removeTick && window.MotionCore) {
        this._removeTick = window.MotionCore.add(this._tick);
      }
    },

    _stopTick: function () {
      if (this._removeTick) {
        this._removeTick();
        this._removeTick = null;
      }
    },

    start: function () {
      var rect = this.hero.getBoundingClientRect();
      this.heroH = rect.height || window.innerHeight;
      this.hero.addEventListener('pointermove', this._onMove, { passive: true });
      this.hero.addEventListener('pointerleave', this._onLeave, { passive: true });
      window.addEventListener('scroll', this._onScroll, { passive: true });
      window.addEventListener('resize', this._onResize, { passive: true });
      if (window.MotionPrefs) window.MotionPrefs.onChange(this._onTierChange);
      if (window.MotionPrefs && window.MotionPrefs.tier === 'static') {
        this.disabled = true; /* 静态档：不启用任何装饰动效 */
        return;
      }
      this._startTick();
    },

    _onResize: function () {
      var rect = this.hero.getBoundingClientRect();
      this.heroH = rect.height || window.innerHeight;
    },

    destroy: function () {
      this._stopTick();
      this.hero.removeEventListener('pointermove', this._onMove);
      this.hero.removeEventListener('pointerleave', this._onLeave);
      window.removeEventListener('scroll', this._onScroll);
      window.removeEventListener('resize', this._onResize);
      if (window.MotionPrefs) window.MotionPrefs.off(this._onTierChange);
      this.hero.classList.remove('hero--pointer-active');
      if (this.bg) this.bg.style.transform = '';
      instance = null;
    }
  };

  /* ---- 挂载入口：main.js 在 DOMContentLoaded 后调用 ----
     粗指针（触屏）或 reduced-motion 不挂载（契约模块契约） */
  function mount() {
    var hero = document.querySelector('.hero');
    if (!hero) return null;
    if (window.matchMedia && !window.matchMedia('(pointer: fine)').matches) {
      return null; /* (pointer: coarse)：禁用，滚动入场仍由 IO 提供 */
    }
    if (instance) return instance;
    instance = new HeroPointer(hero);
    instance.start();
    return instance;
  }

  window.HeroPointer = { mount: mount };
})();
