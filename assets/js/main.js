/* ============================================
   bestxiao.asia — Main Interactions
   脚本以 defer 加载；DOM 就绪后立即挂载首屏动效
   （契约 US-01-2：页面可交互后 ≤1.5s 动效开始呈现，
    首帧绘制无网络依赖）。
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ----- Hero Fluid Visual（首屏动态主视觉）-----
  if (window.HeroFluid) {
    window.HeroFluid.mount();
  }

  // ----- Hero Pointer / Parallax（US-02-1③ 指针+滚动联动）-----
  // 粗指针（触屏）与 reduced-motion（static 档）内部自动禁用
  if (window.HeroPointer) {
    window.HeroPointer.mount();
  }

  // ----- Mobile Nav Toggle（含 aria-expanded 可访问性）-----
  const navToggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');

  if (navToggle) {
    const setExpanded = (expanded) => {
      navToggle.classList.toggle('active', expanded);
      navLinks.classList.toggle('active', expanded);
      navToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    };
    navToggle.setAttribute('aria-expanded', 'false');

    navToggle.addEventListener('click', () => {
      setExpanded(!navLinks.classList.contains('active'));
    });

    // Close menu on link click
    navLinks.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => setExpanded(false));
    });

    // Esc 关闭菜单并将焦点还给开关
    navToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setExpanded(false);
    });
  }

  // ----- Nav Background on Scroll（passive 监听）-----
  const nav = document.getElementById('nav');

  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 80) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  }, { passive: true });

  // ----- Scroll Reveal (全站唯一 IO，由 MotionCore 提供) -----
  const fadeEls = document.querySelectorAll('.fade-up');

  if (window.MotionCore && window.MotionCore.reveal) {
    window.MotionCore.reveal(fadeEls);
  } else if ('IntersectionObserver' in window) {
    // 兜底：MotionCore 缺失时本地降级（行为一致）
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });
    fadeEls.forEach(el => observer.observe(el));
  } else {
    fadeEls.forEach(el => el.classList.add('visible'));
  }

  // ----- Smooth Scroll for Anchor Links（尊重 reduced-motion）-----
  const smoothBehavior = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto' : 'smooth';

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const id = this.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: smoothBehavior, block: 'start' });
        history.replaceState(null, '', id);
      }
    });
  });

  // 指针/滚动联动的 hero 视差与光晕由 hero-pointer.js 统一实现
  // （单一 rAF、passive 监听、reduced-motion 自动禁用）

  // ----- Console Easter Egg -----
  //console.log('%c 肖建军 · bestxiao.asia ', 'background: #c9a84c; color: #0c0c14; font-size: 1.2rem; padding: 8px 16px; font-weight: bold;');
  //console.log('%c 产品管理 × AI 工具 · 探索永不止步 ', 'color: #8a8780; font-size: 0.9rem; padding: 4px 16px;');

});
