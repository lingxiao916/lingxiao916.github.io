/* ============================================
   motion-core.js — 全站唯一 rAF 驱动器 + 唯一 IntersectionObserver
   契约 §5 US-01-1 / US-02-1①：单 requestAnimationFrame 循环 +
   单 IO（滚动入场）；后台标签页自动暂停，回前台恢复。
   ============================================ */
(function () {
  'use strict';

  var tasks = new Set();
  var rafId = 0;
  var running = false;
  var io = null;

  /* ----- 全站唯一 IntersectionObserver：滚动入场（.fade-up → .visible） -----
     无 IO 环境直接加类兜底，内容始终可见（渐进增强） */
  function getIO() {
    if (io !== null) return io;
    if (!('IntersectionObserver' in window)) {
      io = false;
      return io;
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });
    return io;
  }

  function reveal(els) {
    var list = els && els.length ? els : [];
    var obs = getIO();
    for (var i = 0; i < list.length; i++) {
      if (obs) obs.observe(list[i]);
      else list[i].classList.add('visible'); /* 兜底：无 IO 直显 */
    }
  }

  function loop(now) {
    rafId = 0;
    tasks.forEach(function (task) {
      try {
        task(now);
      } catch (err) {
        /* 单个任务异常不影响其他任务与主循环 */
        if (window.console && console.error) console.error(err);
      }
    });
    if (tasks.size && !document.hidden) {
      rafId = requestAnimationFrame(loop);
      running = true;
    } else {
      running = false;
    }
  }

  function start() {
    if (!rafId && !document.hidden) {
      rafId = requestAnimationFrame(loop);
      running = true;
    }
  }

  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    running = false;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop(); /* 后台暂停：省电且不产生不可见帧 */
    } else if (tasks.size) {
      start();
    }
  });

  window.MotionCore = {
    /** 注册逐帧任务；返回移除函数 */
    add: function (task) {
      tasks.add(task);
      start();
      return function () {
        window.MotionCore.remove(task);
      };
    },
    remove: function (task) {
      tasks.delete(task);
      if (!tasks.size) stop();
    },
    /** 滚动入场注册（全站唯一 IO） */
    reveal: reveal,
    get size() {
      return tasks.size;
    },
    get running() {
      return running;
    }
  };
})();
