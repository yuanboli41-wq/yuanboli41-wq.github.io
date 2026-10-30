/* 影视作品集样板：开场剧照轮播（慢推拉、平移、淡入淡出；客户有片段时电脑和横屏再淡入）、悬停预览、
   作品合集弹层、剧照大图、作品页 B站 播放器（点了才加载）、复制。不依赖任何库。
   弹层打开时会 pushState：安卓返回键、iOS 右滑、内置浏览器的返回键先关弹层，不会直接离开页面。 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var PLAY = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0L10 6L0 12Z" fill="currentColor"/></svg>';

  /* ---------- 复制（剪贴板不可用时退回 execCommand，再不行提示长按） ---------- */
  function copyText(text, cb) {
    var fallback = function () {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta); cb(ok);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { cb(true); }, fallback);
    else fallback();
  }
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var hint = b.getAttribute("data-hint") && $(b.getAttribute("data-hint"));
      copyText(b.getAttribute("data-copy"), function (ok) {
        var msg = ok ? "已复制" : "请长按复制";
        if (hint) { var old = hint.textContent; hint.textContent = ok ? "已复制邮箱" : msg; setTimeout(function () { hint.textContent = old; }, 1800); }
        else { var o = b.textContent; b.textContent = msg; setTimeout(function () { b.textContent = o; }, 1600); }
      });
    });
  });

  /* ---------- 锁定页面滚动（iOS 上 overflow:hidden 锁不住，用 position:fixed） ---------- */
  var lockY = 0;
  function lockScroll() {
    lockY = window.pageYOffset || document.documentElement.scrollTop;
    var b = document.body.style;
    b.position = "fixed"; b.top = -lockY + "px"; b.left = "0"; b.right = "0"; b.width = "100%";
  }
  function unlockScroll() {
    var b = document.body.style;
    b.position = b.top = b.left = b.right = b.width = "";
    window.scrollTo(0, lockY);
  }

  /* ---------- 弹层 ---------- */
  var modal = $("modal"), mStage = $("m-stage"), lastFocus = null, onClose = null, pushed = false;
  function openModal(html, caption, extra, nav) {
    lastFocus = document.activeElement;
    mStage.className = "m-stage"; mStage.innerHTML = html;
    $("m-t").innerHTML = caption || ""; $("m-x").innerHTML = extra || ""; $("m-nav").innerHTML = nav || "";
    /* 先 pushState 再锁滚动：浏览器记下的是当前滚动位置，返回时才能回到原处 */
    if (history.pushState) { history.pushState({ modal: 1 }, ""); pushed = true; }
    modal.hidden = false; lockScroll(); $("m-close").focus();
  }
  function hideModal() { /* 真正关掉弹层；由返回键（popstate）或下面的 closeModal 触发 */
    if (!modal || modal.hidden) return;
    modal.hidden = true; mStage.innerHTML = ""; unlockScroll();
    if (onClose) { onClose(); onClose = null; }
    if (lastFocus) lastFocus.focus();
  }
  function closeModal() { /* 点关闭 / Esc / 点空白：退回打开弹层前的那条历史，交给 popstate 去关 */
    if (!modal || modal.hidden) return;
    if (pushed) { pushed = false; history.back(); } else hideModal();
  }
  addEventListener("popstate", function () { if (modal && !modal.hidden) { pushed = false; hideModal(); } });
  if (modal) {
    $("m-close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (ev) { if (ev.target === modal) closeModal(); });
    document.addEventListener("keydown", function (ev) {
      if (modal.hidden) return;
      if (ev.key === "Escape") closeModal();
      else if (ev.key === "Tab") {
        var f = modal.querySelectorAll("button, a[href], iframe"), first = f[0], last = f[f.length - 1];
        if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      }
    });
  }
  function biliSrc(bvid) {
    return "https://player.bilibili.com/player.html?bvid=" + encodeURIComponent(bvid) + "&page=1&autoplay=1&danmaku=0&high_quality=1";
  }
  function biliFrame(bvid, title) {
    return '<iframe src="' + biliSrc(bvid) + '" title="' + esc(title) + '" allowfullscreen allow="autoplay; fullscreen; picture-in-picture" scrolling="no"></iframe>';
  }
  var PH = function (title, img, sample) {
    return (img ? '<img src="' + esc(img) + '" alt="">' : "") + (sample
      ? '<div class="ph"><b>这里会直接播放《' + esc(title) + "》</b><span>样板里的作品是示例，没有真实正片。正式网站会嵌入 B站 播放器，十几二十分钟的长片也能流畅播放，手机上点全屏即可。</span></div>"
      : '<div class="ph"><b>《' + esc(title) + "》的在线播放还在准备</b><span>可以先看下面的剧照和介绍，需要看完整影片请联系我。</span></div>");
  };

  /* ---------- 首页开场 ---------- */
  var dataEl = $("film-data");
  if (dataEl) {
    var D = JSON.parse(dataEl.textContent), R = D.reel, N = R.length;
    var reelEl = $("reel"), slides = [reelEl.querySelector(".slide")], DUR = 7000;
    var segBtns = Array.prototype.slice.call($("segs").querySelectorAll("button"));
    var segBars = segBtns.map(function (b) { return b.querySelector("i"); });
    var cur = 0, startAt = 0, running = false, pausedAt = 0, videoOK = false;

    /* 胶片颗粒改成 CSS 里的 SVG 噪点，不再用脚本画，省掉首屏的长任务 */
    var P = "(orientation: portrait)";
    function slide(i) { /* 其他剧照用到时才创建，首屏只下载第一张；竖屏手机用竖裁的图；k0/k1/k2 三种运镜轮流 */
      if (slides[i]) return slides[i];
      var s = document.createElement("div"); s.className = "slide k" + (i % 3);
      s.innerHTML = '<picture>' +
        '<source media="' + P + '" type="image/avif" srcset="' + R[i].pavif + '" sizes="100vw">' +
        '<source media="' + P + '" type="image/webp" srcset="' + R[i].pwebp + '" sizes="100vw">' +
        '<source media="' + P + '" type="image/jpeg" srcset="' + R[i].pjpg + '" sizes="100vw">' +
        '<source type="image/avif" srcset="' + R[i].avif + '" sizes="100vw"><source type="image/webp" srcset="' + R[i].webp +
        '" sizes="100vw"><img src="' + R[i].src + '" srcset="' + R[i].jpg + '" sizes="100vw" alt="" decoding="async"></picture>';
      reelEl.appendChild(s); slides[i] = s; return s;
    }
    /* 16:9 的片段在竖屏手机上要放大 3 倍多才能铺满，会糊：只在电脑（≥860px）或横屏时播放 */
    var wideMQ = matchMedia("(min-width: 860px), (orientation: landscape)");
    function attachVideo(i) { /* 只在页面加载完、网络允许时给当前这张接上 6 秒短片段，能播了才淡入 */
      if (!videoOK || !R[i].clip || !wideMQ.matches) return;
      var s = slides[i], v = s.querySelector("video");
      if (!v) {
        v = document.createElement("video");
        v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; v.preload = "auto";
        v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("webkit-playsinline", ""); v.setAttribute("aria-hidden", "true");
        v.setAttribute("x5-playsinline", ""); v.setAttribute("x5-video-player-type", "h5-page"); /* 安卓 X5 内核的内置浏览器别弹全屏播放器 */
        v.addEventListener("playing", function () { v.classList.add("ready"); });
        v.addEventListener("error", function () { if (v.parentNode) v.parentNode.removeChild(v); });
        v.src = R[i].clip; s.appendChild(v);
      }
      var p = v.play(); if (p && p.catch) p.catch(function () { /* 内置浏览器拒绝自动播放时，保持剧照 */ });
    }
    function setNow(i) {
      var t = $("now-t"); t.textContent = "《" + R[i].t + "》"; t.href = R[i].href;
      $("now-m").textContent = R[i].en + " · " + R[i].d;
    }
    function go(i) {
      var prev = cur; cur = i;
      slide(i); slide((i + 1) % N); /* 提前准备下一张剧照 */
      slides.forEach(function (s, k) { if (s) s.classList.toggle("on", k === i); });
      var im = slides[i].querySelector("img"); if (im) { im.style.animation = "none"; void im.offsetWidth; im.style.animation = ""; }
      attachVideo(i);
      if (prev !== i && slides[prev]) { var pv = slides[prev].querySelector("video"); if (pv) setTimeout(function () { if (cur !== prev) pv.pause(); }, 1500); }
      setNow(i); startAt = performance.now();
      segBars.forEach(function (b, k) { b.style.transform = "scaleX(" + (k < i ? 1 : 0) + ")"; });
    }
    function tick(now) {
      if (!running) return;
      var p = (now - startAt) / DUR;
      segBars[cur].style.transform = "scaleX(" + Math.min(p, 1) + ")";
      if (p >= 1) go((cur + 1) % N);
      requestAnimationFrame(tick);
    }
    function start() {
      if (running || reduce) return; running = true;
      if (pausedAt) { startAt += performance.now() - pausedAt; pausedAt = 0; var v = slides[cur].querySelector("video"); if (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
      requestAnimationFrame(tick);
    }
    function stop() { if (!running) return; running = false; pausedAt = performance.now(); var v = slides[cur].querySelector("video"); if (v) v.pause(); }
    segBtns.forEach(function (b, k) { b.addEventListener("click", function () { go(k); }); });
    if (reduce) segBars[0].style.transform = "scaleX(1)";
    else { startAt = performance.now(); start(); }
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }).observe(reelEl);
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

    /* 短片段：页面加载完 2.5 秒后、空闲时才开始；省流量模式或 2G/3G 只放剧照 */
    var conn = navigator.connection || {};
    if (!reduce && !conn.saveData && !/(^|-)2g|3g/.test(conn.effectiveType || "")) {
      var later = function () {
        setTimeout(function () {
          (window.requestIdleCallback || function (f) { setTimeout(f, 1); })(function () { videoOK = true; if (!document.hidden) attachVideo(cur); });
        }, 2500);
      };
      if (document.readyState === "complete") later(); else addEventListener("load", later);
    }

    /* 作品合集：B站 嵌入 */
    var S = D.showreel;
    if ($("reel-btn")) $("reel-btn").addEventListener("click", function () {
      stop();
      onClose = function () { if (reelEl.getBoundingClientRect().bottom > 0) start(); };
      openModal(S.bvid ? biliFrame(S.bvid, S.title) : PH(S.title, S.img, D.sample), "《" + esc(S.title) + "》 " + esc(S.en) + " · " + esc(S.d),
        S.bvid ? '<a href="https://www.bilibili.com/video/' + esc(S.bvid) + '" target="_blank" rel="noopener">去 B站 看高清 ↗</a>' : "");
    });

    /* 鼠标悬停时跟着走的预览画面（只在有鼠标的设备上） */
    var peek = $("peek"), fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (fine) {
      var px = -999, py = -999, tx = -999, ty = -999, rows = document.querySelectorAll(".row-btn");
      rows.forEach(function (a) {
        var show = function (anchor) {
          $("peek-img").src = a.getAttribute("data-peek"); $("peek-t").textContent = a.getAttribute("data-en");
          if (anchor) { var rc = a.getBoundingClientRect(); tx = px = rc.left + rc.width * .62; ty = py = rc.top + rc.height / 2; }
          peek.classList.add("on");
        };
        a.addEventListener("mouseenter", function () { show(false); });
        a.addEventListener("focus", function () { show(true); });
        a.addEventListener("blur", function () { peek.classList.remove("on"); });
      });
      $("index").addEventListener("mouseleave", function () { peek.classList.remove("on"); });
      addEventListener("mousemove", function (ev) { tx = ev.clientX + 30; ty = ev.clientY; if (px < -900) { px = tx; py = ty; } });
      (function follow() {
        var k = reduce ? 1 : .16; px += (tx - px) * k; py += (ty - py) * k;
        peek.style.setProperty("--x", px + "px"); peek.style.setProperty("--y", py + "px");
        requestAnimationFrame(follow);
      })();
    }
  }

  /* ---------- 作品页：点了才加载 B站 播放器 ---------- */
  var stage = $("stage");
  if (stage) {
    $("play").addEventListener("click", function () {
      var bvid = stage.getAttribute("data-bvid"), title = stage.getAttribute("data-title");
      if (bvid) { stage.insertAdjacentHTML("beforeend", biliFrame(bvid, title)); $("play").remove(); stage.querySelector("iframe").focus(); }
      else if (!stage.querySelector(".ph")) {
        stage.insertAdjacentHTML("beforeend", PH(title, "", stage.getAttribute("data-sample") === "1")); $("play").remove();
        var ph = stage.querySelector(".ph"); ph.setAttribute("tabindex", "-1"); ph.setAttribute("role", "status"); ph.focus();
      }
    });
    var share = $("share");
    share.addEventListener("click", function () {
      copyText(share.getAttribute("data-url"), function (ok) {
        var h = $("share-hint"), old = h.textContent;
        h.textContent = ok ? "链接已复制，可以直接粘贴发给别人" : "请长按浏览器地址栏复制链接";
        setTimeout(function () { h.textContent = old; }, 2400);
      });
    });
  }

  /* ---------- 剧照大图 ---------- */
  var stills = Array.prototype.slice.call(document.querySelectorAll("[data-lb]"));
  if (stills.length && modal) {
    var at = 0;
    var show = function (i) {
      at = (i + stills.length) % stills.length;
      var d = stills[at].dataset, alt = stills[at].querySelector("img").alt;
      var html = '<picture><source type="image/avif" srcset="' + d.avif + '" sizes="100vw"><source type="image/webp" srcset="' + d.webp +
        '" sizes="100vw"><img src="' + stills[at].getAttribute("href") + '" srcset="' + d.jpg + '" sizes="100vw" alt="' + esc(alt) + '"></picture>';
      var nav = '<button class="pill" type="button" id="lb-prev" aria-label="上一张">‹</button><button class="pill" type="button" id="lb-next" aria-label="下一张">›</button>';
      if (modal.hidden) openModal(html, "剧照 " + (at + 1) + " / " + stills.length, "", nav); /* 翻页不再 pushState，返回一次就关 */
      else { mStage.innerHTML = html; $("m-t").textContent = "剧照 " + (at + 1) + " / " + stills.length; }
      mStage.className = "m-stage contain";
      $("lb-prev").onclick = function () { show(at - 1); };
      $("lb-next").onclick = function () { show(at + 1); };
    };
    stills.forEach(function (a, i) { a.addEventListener("click", function (ev) { ev.preventDefault(); show(i); }); });
    document.addEventListener("keydown", function (ev) {
      if (modal.hidden || !$("lb-prev")) return;
      if (ev.key === "ArrowLeft") show(at - 1); else if (ev.key === "ArrowRight") show(at + 1);
    });
  }
})();
