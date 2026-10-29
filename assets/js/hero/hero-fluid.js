/* ============================================
   hero-fluid.js — 首屏动态主视觉（方向 A：深色科技流体）
   契约 §3：Canvas 2D 流体渐变 + 轻量粒子，零第三方依赖。
   · 档位化：粒子 900 / 400 / 120（high/mid/low），静态档单帧
   · 帧率锁 30fps（low 24fps），DPR 上限 1.5
   · 由 MotionCore 单 rAF 驱动，后台暂停
   · prefers-reduced-motion → 静态渐变单帧，内容完整可读
   ============================================ */
(function () {
  'use strict';

  var GOLD = [201, 168, 76];   /* --accent #c9a84c */
  var GOLD_STRONG = [224, 190, 99]; /* --accent-strong #e0be63 */
  var DEEP = [30, 30, 48];     /* --bg-elevated #1e1e30 系中性色 */

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  var instance = null;

  /* 预渲染光斑精灵：绘制时仅 drawImage + transform，成本可控 */
  function makeBlobSprite(rgb, alpha) {
    var s = document.createElement('canvas');
    s.width = s.height = 256;
    var c = s.getContext('2d');
    var g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(0.55, rgba(rgb, alpha * 0.35));
    g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    return s;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function HeroFluid(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.particles = [];
    this.blobs = [];
    this.lastFrame = 0;
    this.time = 0;
    this.spriteGold = makeBlobSprite(GOLD, 0.08);
    this.spriteGoldSoft = makeBlobSprite(GOLD, 0.045);
    this.spriteDeep = makeBlobSprite(DEEP, 0.35);
    this.spriteSpark = makeBlobSprite(GOLD_STRONG, 0.09);
    this._removeTick = null;
    this._resizeTimer = 0;
    this._onResize = this._onResize.bind(this);
    this._onTierChange = this._onTierChange.bind(this);
  }

  HeroFluid.prototype = {

    /* ---- 尺寸与 DPR ---- */
    _resize: function () {
      var rect = this.canvas.parentElement.getBoundingClientRect();
      /* hero 底部（页面坐标）：滚出视口即跳过绘制（省电省帧） */
      this._heroBottom = Math.round(rect.bottom + (window.pageYOffset || 0));
      this.w = Math.max(1, Math.round(rect.width));
      this.h = Math.max(1, Math.round(rect.height));
      var dpr = window.devicePixelRatio || 1;
      var cap = window.MotionPrefs ? window.MotionPrefs.dprCap : 1.5;
      this.dpr = Math.min(dpr, cap);
      /* low 档降采样渲染（CSS 尺寸不变）：合成/上传面积降至 ~56%，
         软渐变与粒子视觉几乎无差，换低端机流畅度（契约「性能优先于特效」） */
      if (window.MotionPrefs && window.MotionPrefs.tier === 'low') {
        this.dpr = Math.max(0.75, this.dpr * 0.75);
      }
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._buildScene();
    },

    _onResize: function () {
      var self = this;
      window.clearTimeout(this._resizeTimer);
      this._resizeTimer = window.setTimeout(function () {
        self._resize();
        if (window.MotionPrefs && window.MotionPrefs.tier === 'static') {
          self._render(0); /* 静态档：重绘单帧 */
        }
      }, 150);
    },

    /* ---- 场景构建（按档位） ---- */
    _buildScene: function () {
      var tier = window.MotionPrefs ? window.MotionPrefs.tier : 'mid';
      var count = (window.MotionPrefs && window.MotionPrefs.particleMax[tier]) || 0;
      var w = this.w, h = this.h;

      /* 光斑：大尺度流体渐变，各自沿 Lissajous 轨迹缓慢漂移；
         位置避开左侧文本主列，保证正文对比度（US-03-3） */
      var blobDefs = [
        { sprite: this.spriteGold, r: [0.5, 0.62], ax: 0.14, ay: 0.10, sp: [0.05, 0.07], px: -0.05, py: 0.05 },
        { sprite: this.spriteGoldSoft, r: [0.5, 0.66], ax: 0.16, ay: 0.2, sp: [0.04, 0.05], px: 0.85, py: 0.75 },
        { sprite: this.spriteDeep, r: [0.72, 0.9], ax: 0.22, ay: 0.12, sp: [0.03, 0.045], px: 0.55, py: 0.55 },
        { sprite: this.spriteGoldSoft, r: [0.3, 0.42], ax: 0.22, ay: 0.16, sp: [0.08, 0.1], px: 0.75, py: 0.12 },
        { sprite: this.spriteSpark, r: [0.16, 0.26], ax: 0.26, ay: 0.2, sp: [0.09, 0.12], px: 0.32, py: 0.88 }
      ];
      if (tier === 'low' || tier === 'static') blobDefs = blobDefs.slice(0, 4);
      this.blobs = blobDefs.map(function (d, i) {
        return {
          sprite: d.sprite,
          baseX: d.px * w,
          baseY: d.py * h,
          rMin: d.r[0] * Math.max(w, h),
          rMax: d.r[1] * Math.max(w, h),
          ax: d.ax * w,
          ay: d.ay * h,
          sx: d.sp[0] * (i % 2 ? -1 : 1),
          sy: d.sp[1] * (i % 2 ? 1 : -1),
          phase: rand(0, Math.PI * 2),
          pulse: rand(0.15, 0.3)
        };
      });

      /* 粒子：缓慢上升 + 横向摆动 + 闪烁 */
      this.particles = [];
      for (var i = 0; i < count; i++) {
        this.particles.push({
          x: rand(0, w),
          y: rand(0, h),
          size: rand(0.8, 2.6),
          vy: -rand(6, 16),          /* px/s，向上漂浮 */
          swayAmp: rand(6, 26),
          swayFreq: rand(0.1, 0.4),
          swayPhase: rand(0, Math.PI * 2),
          twinkleAmp: rand(0.25, 0.75),
          twinkleFreq: rand(0.3, 1.2),
          twinklePhase: rand(0, Math.PI * 2),
          baseAlpha: rand(0.25, 0.8)
        });
      }
      this._buildGrid();
    },

    /* ---- 匀速网格（连线近邻查询，避免 O(n²)） ---- */
    CELL: 100,
    LINK_DIST: 92,

    _buildGrid: function () {
      this.cols = Math.ceil(this.w / this.CELL) + 1;
      this.rows = Math.ceil(this.h / this.CELL) + 1;
      this.grid = new Array(this.cols * this.rows);
    },

    _cellIndex: function (x, y) {
      var cx = Math.min(this.cols - 1, Math.max(0, (x / this.CELL) | 0));
      var cy = Math.min(this.rows - 1, Math.max(0, (y / this.CELL) | 0));
      return cy * this.cols + cx;
    },

    _fillGrid: function () {
      var g = this.grid;
      for (var i = 0; i < g.length; i++) g[i] = null;
      var ps = this.particles;
      for (var j = 0; j < ps.length; j++) {
        var idx = this._cellIndex(ps[j].x, ps[j].y);
        ps[j].next = g[idx];
        ps[j]._cell = idx;
        ps[j]._idx = j;
        g[idx] = ps[j];
      }
    },

    /* ---- 更新 ---- */
    _update: function (dt) {
      var ps = this.particles;
      var w = this.w, h = this.h;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        p.y += p.vy * dt;
        p.x += Math.cos(p.swayFreq * this.time + p.swayPhase) * p.swayAmp * dt;
        if (p.y < -10) { /* 循环复用，持续运行 */
          p.y = h + 10;
          p.x = rand(0, w);
        }
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
      }
    },

    /* ---- 渲染一帧（t 为动画时间，秒） ---- */
    _render: function (t) {
      var ctx = this.ctx;
      var w = this.w, h = this.h;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      /* 流体光斑 */
      for (var i = 0; i < this.blobs.length; i++) {
        var b = this.blobs[i];
        var x = b.baseX + Math.sin(t * b.sx * Math.PI * 2 + b.phase) * b.ax;
        var y = b.baseY + Math.cos(t * b.sy * Math.PI * 2 + b.phase) * b.ay;
        var r = (b.rMin + b.rMax) / 2 +
          Math.sin(t * b.pulse + b.phase) * (b.rMax - b.rMin) / 2;
        ctx.drawImage(b.sprite, x - r, y - r, r * 2, r * 2);
      }

      /* 粒子：按透明度分桶批量绘制（减少状态切换） */
      var buckets = [[], [], [], []];
      var ps = this.particles;
      for (var j = 0; j < ps.length; j++) {
        var p = ps[j];
        var tw = 0.5 + 0.5 * Math.sin(t * p.twinkleFreq * Math.PI * 2 + p.twinklePhase) * p.twinkleAmp;
        var a = p.baseAlpha * tw;
        var bucket = Math.min(3, (a * 4) | 0);
        buckets[bucket].push(p);
      }
      for (var k = 0; k < 4; k++) {
        var list = buckets[k];
        if (!list.length) continue;
        ctx.fillStyle = rgba(k === 3 ? GOLD_STRONG : GOLD, 0.12 + k * 0.12);
        ctx.beginPath();
        for (var m = 0; m < list.length; m++) {
          var q = list[m];
          ctx.moveTo(q.x + q.size, q.y);
          ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      /* 近邻连线（星链感）：网格查询 + 单次描边 */
      if (ps.length > 1 && ps.length <= 600) {
        this._fillGrid();
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(GOLD, 0.10);
        ctx.beginPath();
        var links = 0;
        var maxD2 = this.LINK_DIST * this.LINK_DIST;
        for (var n = 0; n < ps.length && links < 280; n++) {
          var a2 = ps[n];
          for (var oy = -1; oy <= 1; oy++) {
            for (var ox = -1; ox <= 1; ox++) {
              var cx = (a2._cell % this.cols) + ox;
              var cy = ((a2._cell / this.cols) | 0) + oy;
              if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
              var head = this.grid[cy * this.cols + cx];
              for (var o = head; o; o = o.next) {
                if (o === a2 || o._idx <= a2._idx) continue; /* 去重：每对只画一次 */
                var dx = o.x - a2.x, dy = o.y - a2.y;
                var d2 = dx * dx + dy * dy;
                if (d2 < maxD2) {
                  ctx.moveTo(a2.x, a2.y);
                  ctx.lineTo(o.x, o.y);
                  links++;
                  if (links >= 280) break;
                }
              }
            }
          }
        }
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
    },

    /* ---- rAF 任务（帧率锁；hero 滚出视口时跳过绘制） ---- */
    _tick: function (now) {
      var me = instance;
      if (!me) return;
      /* 滚出视口：不更新不绘制（回到视口时 dt 封顶 0.1s，立即恢复） */
      if ((window.pageYOffset || 0) > (me._heroBottom || 0)) return;
      var fps = window.MotionPrefs ? window.MotionPrefs.fps[window.MotionPrefs.tier] || 30 : 30;
      var interval = 1000 / fps;
      if (now - me.lastFrame < interval - 4) return;
      var dt = Math.min(0.1, (now - (me.lastFrame || now)) / 1000);
      me.lastFrame = now;
      me.time += dt;
      me._update(dt);
      me._render(me.time);
    },

    _onTierChange: function () {
      this._buildScene();
      if (window.MotionPrefs.tier === 'static') {
        this._stopTick();
        this._render(0); /* 静态渐变单帧：内容完整可读 */
      } else {
        this._startTick();
      }
    },

    _startTick: function () {
      if (!this._removeTick && window.MotionCore) {
        this._removeTick = window.MotionCore.add(HeroFluid._tick);
      }
    },

    _stopTick: function () {
      if (this._removeTick) {
        this._removeTick();
        this._removeTick = null;
      }
    },

    /* ---- 生命周期 ---- */
    start: function () {
      this._resize();
      window.addEventListener('resize', this._onResize);
      if (window.MotionPrefs) window.MotionPrefs.onChange(this._onTierChange);

      this._render(0); /* 立即首帧：不等待网络、不依赖字体 */
      if (window.performance && performance.mark) {
        performance.mark('hero-fluid-first-frame'); /* 供性能验收取数（AC US-01-2） */
      }

      if (window.MotionPrefs && window.MotionPrefs.tier === 'static') {
        return; /* 静态档：仅单帧 */
      }
      this._startTick();
    },

    destroy: function () {
      this._stopTick();
      window.removeEventListener('resize', this._onResize);
      if (window.MotionPrefs) window.MotionPrefs.off(this._onTierChange);
      instance = null;
    }
  };

  /* 静态 tick 引用（绑定到构造器，实例共享） */
  HeroFluid._tick = function (now) {
    if (instance) HeroFluid.prototype._tick.call(instance, now);
  };

  /* ---- 挂载入口：main.js 在 DOMContentLoaded 后调用 ---- */
  function mount() {
    var canvas = document.getElementById('heroCanvas') ||
      document.querySelector('.hero__canvas');
    if (!canvas || !canvas.getContext) return null;
    if (instance) return instance;
    instance = new HeroFluid(canvas);
    instance.start();
    return instance;
  }

  window.HeroFluid = { mount: mount };
})();
