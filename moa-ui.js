/* ─────────────────────────────────────────────
   MOA FORMULA 화면 개편 — 모의면접 학생 화면 (2026-10-03)
   · 기존 기능(질문·AI 피드백·개인 고객 저장·결과 링크)은 그대로 두고 화면만 바꿉니다.
   · 답하는 동안 '면접실 모드'(어두운 화면 + 60초 타이머 + 말로 답하기)
   · 이 파일을 지우고 index.html의 두 줄을 빼면 예전 화면으로 돌아가요.
   ───────────────────────────────────────────── */
(function () {
  'use strict';
  var APP_COLOR = '#295BF2';
  var TARGET_SEC = 60;
  var RING = 2 * Math.PI * 78;

  /* ── 허브 '이어서 하기'용 진행 상황 보고 (2026-10-03) ──
     허브가 주소 끝에 붙여 준 #moa-s={이름, 숫자4자리}를 이 창(세션)에만 보관하고,
     (강사코드|이름|숫자4자리)를 SHA-256으로 뒤섞은 열쇠만 서버에 보냄 — 이름·숫자는 보내지 않음 */
  var PROGRESS_API = 'https://resume-feedback-app-phi.vercel.app/api/progress';
  function moaStudent() {
    var m = location.hash.match(/^#moa-s=(.+)$/);
    if (m) {
      try {
        var o = JSON.parse(decodeURIComponent(m[1]));
        if (o && o.n && /^\d{4}$/.test(o.p4)) sessionStorage.setItem('moa_s', JSON.stringify({ n: String(o.n).slice(0, 20), p4: o.p4 }));
      } catch (e) {}
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    }
    try { return JSON.parse(sessionStorage.getItem('moa_s') || 'null'); } catch (e) { return null; }
  }
  var MOA_S = moaStudent();
  function moaTeacherId() { try { return typeof TEACHER_ID !== 'undefined' ? TEACHER_ID : ''; } catch (e) { return ''; } }
  function moaKey() {
    var t = moaTeacherId();
    if (!MOA_S || !t || !(window.crypto && crypto.subtle)) return Promise.resolve('');
    var data = new TextEncoder().encode(t + '|' + MOA_S.n.trim() + '|' + MOA_S.p4);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }).catch(function () { return ''; });
  }
  function moaReport(app, data) {
    moaKey().then(function (k) {
      if (!k) return;
      fetch(PROGRESS_API, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'put', k: k, app: app, data: data }) }).catch(function () {});
    });
  }

  var MOA_APP = 'interview';
  /* ── 강의별 앱 기록 (2026-10-03) ──
     허브가 주소에 붙여 준 ci(입장 코드 1회분 이름표)를 이 창에만 보관하고, 제출·연습이 성공할 때마다
     그 강의의 숫자만 하나 올림 (이름·숫자 4자리는 보내지 않음 · 열쇠 k만). 운영보드 결과보고서가 이 숫자를 불러감 */
  var MOA_CI = (function () {
    try {
      var q = new URLSearchParams(location.search).get('ci') || '';
      if (/^ci_[a-z0-9]{8,24}$/.test(q)) sessionStorage.setItem('moa_ci', q);
      return sessionStorage.getItem('moa_ci') || '';
    } catch (e) { return ''; }
  })();
  function moaStat(app, extra) {
    if (!MOA_CI) return;
    moaKey().then(function (k) {
      var b = { action: 'stat', ci: MOA_CI, k: k || '', app: app };
      Object.keys(extra || {}).forEach(function (x) { b[x] = extra[x]; });
      fetch(PROGRESS_API, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).catch(function () {});
    });
  }
  // 자소서 점검 점수: 문항마다 경험 구조(STAR 등) 칸 + 구체성 3칸 중 채운 비율 → 100점, 구조를 모두 갖춘 문항 비율
  function moaEssayScore(bodyText) {
    try {
      var o = JSON.parse(bodyText || '{}'), its = Array.isArray(o.items) ? o.items : [];
      if (o.clientCode) return null; // 개인 고객은 강의 기록에서 뺌
      var sc = [], full = 0, n = 0;
      its.forEach(function (it) {
        var d = it && it.aiDraft; if (!d || !d.structure) return;
        var sv = Object.keys(d.structure).map(function (k) { return !!d.structure[k]; });
        var cv = d.concreteness ? Object.keys(d.concreteness).map(function (k) { return !!d.concreteness[k]; }) : [];
        var all = sv.concat(cv); if (!all.length) return;
        sc.push(all.filter(Boolean).length / all.length * 100);
        n++; if (sv.length && sv.every(Boolean)) full++;
      });
      if (!n) return {};
      return { score: Math.round(sc.reduce(function (a, b) { return a + b; }, 0) / n * 10) / 10, star: Math.round(full / n * 1000) / 10 };
    } catch (e) { return {}; }
  }
  if (MOA_CI && window.fetch && !window.__moaStatWrap) {
    window.__moaStatWrap = true;
    var moaFetch = window.fetch;
    window.fetch = function (input, init) {
      var p = moaFetch.apply(this, arguments);
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = String((init && init.method) || 'GET').toUpperCase();
        if (method === 'POST' && !document.body.classList.contains('role-teacher')) {
          if (MOA_APP === 'resume' && /\/api\/reviews(\?|$)/.test(url)) {
            var info = moaEssayScore(init && init.body);
            if (info) p.then(function (r) { if (r && r.ok) moaStat('resume', info); }).catch(function () {});
          } else if (MOA_APP === 'interview' && /\/api\/feedback(\?|$)/.test(url)) {
            p.then(function (r) { if (r && r.ok) moaStat('interview', { n: 1 }); }).catch(function () {});
          }
        }
      } catch (e) {}
      return p;
    };
  }

  function isStudent() {
    var b = document.body;
    return b.classList.contains('role-student') && !b.classList.contains('role-teacher');
  }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fire(node, type) { node.dispatchEvent(new Event(type, { bubbles: true })); }
  var EMOJI = /^[\s☀-➿\uD83C-􏰀-\uDFFF️‍]+/;

  /* ── 상단 바 ── */
  function isTeacher() { return document.body.classList.contains('role-teacher'); }
  function applyShell() {
    var b = document.body;
    if (!b.classList.contains('role-student') && !b.classList.contains('role-teacher')) { b.classList.remove('moa-ui', 'moa-stage', 'moa-teacher'); return false; }
    b.classList.add('moa-ui');
    b.classList.toggle('moa-teacher', isTeacher());
    document.documentElement.style.setProperty('--moa-app', APP_COLOR);
    var header = document.querySelector('header');
    if (header && !header.querySelector('.moa-wordmark')) {
      header.insertBefore(el('div', { class: 'moa-wordmark', 'aria-label': 'MOA FORMULA' }, '<i></i>MOA FORMULA'), header.firstChild);
    }
    // 강사 화면: 오른쪽에 테두리+자물쇠 버튼 (강사 설정 · 허브)
    if (header && isTeacher() && !header.querySelector('.moa-head-right')) {
      var right = el('div', { class: 'moa-head-right' });
      var gear = document.getElementById('gear-btn');
      if (gear && gear.style.display !== 'none') {
        var set = el('button', { type: 'button', class: 'moa-lock' }, '강사 설정');
        set.addEventListener('click', function () { gear.click(); });
        right.appendChild(set);
      }
      var hub = document.querySelector('.moa-hubbar a');
      if (hub && hub.style.display !== 'none') right.appendChild(el('a', { class: 'moa-lock', href: hub.getAttribute('href') }, '허브'));
      var title = header.querySelector('.title-row');
      header.insertBefore(right, title ? title.nextSibling : null);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', b.classList.contains('moa-stage') ? '#0E1533' : '#FFFFFF');
    return true;
  }

  /* ── 유형 고르기 화면 ── */
  function enhanceSelect() {
    var lead = document.querySelector('#screen-select > p.lead');
    if (lead && !lead.dataset.moaDone) {
      lead.dataset.moaDone = '1';
      lead.innerHTML = '<span class="moa-h1" style="display:block">어떤 질문부터<br>연습할까요?</span><span style="display:block;font-size:14px;color:var(--moa-muted);line-height:1.6">답하면 논리 구조·태도·구체성을 바로 짚어 드려요. 순서는 자유예요.</span>';
      lead.style.margin = '0 0 20px';
    }
    var catList = document.getElementById('cat-list');
    if (!catList) return;
    Array.prototype.forEach.call(catList.children, function (box) {
      if (box.dataset.moaDone) return;
      if (box.querySelector('#student-company') || box.querySelector('input[name="hiring-type"]')) {
        box.dataset.moaDone = '1';
        box.classList.add('moa-panel');
        var lbl = box.querySelector('.st-lbl');
        if (lbl && lbl.firstChild && lbl.firstChild.nodeType === 3) lbl.firstChild.nodeValue = lbl.firstChild.nodeValue.replace(EMOJI, '');
        var radios = box.querySelectorAll('input[name="hiring-type"]');
        if (radios.length) {
          var row = radios[0].closest('div');
          var seg = el('div', { class: 'moa-seg', role: 'group' });
          radios.forEach(function (r) {
            var b = el('button', { type: 'button', 'aria-pressed': String(r.checked) }, esc((r.parentElement.textContent || '').trim()));
            b.addEventListener('click', function () {
              r.checked = true; fire(r, 'change');
              seg.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            });
            seg.appendChild(b);
          });
          row.style.display = 'none';
          row.parentNode.insertBefore(seg, row);
        }
      }
      if (box.classList.contains('cat-card') && !box.dataset.moaDone) {
        box.dataset.moaDone = '1';
        var t = box.querySelector('.cat-title');
        if (t && !t.children.length) t.textContent = t.textContent.replace(EMOJI, '');
      }
    });
  }

  /* ── 면접실 모드 ── */
  var timer = { q: null, start: 0, tick: null, node: null };
  function stopTick() { if (timer.tick) { clearInterval(timer.tick); timer.tick = null; } }
  function fmt(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function drawTimer() {
    if (!timer.node) return;
    var s = timer.start ? Math.floor((Date.now() - timer.start) / 1000) : 0;
    timer.node.querySelector('b').textContent = fmt(s);
    var p = Math.min(1, s / TARGET_SEC);
    timer.node.querySelector('.arc').setAttribute('stroke-dashoffset', String(RING * (1 - p)));
    timer.node.classList.toggle('over', s > TARGET_SEC + 30);
    timer.node.querySelector('span').textContent = !timer.start ? '답을 시작하면 시간이 흘러요' : (s <= TARGET_SEC ? '권장 60초' : (s <= 90 ? '조금 길어지고 있어요' : '핵심만 남겨 보세요'));
  }
  function startTimer() {
    if (!timer.node || timer.start) return;
    timer.start = Date.now();
    stopTick();
    timer.tick = setInterval(drawTimer, 500);
    drawTimer();
  }
  function placeTimer(qBubble) {
    if (timer.q === qBubble) return;
    stopTick();
    timer.q = qBubble; timer.start = 0;
    timer.node = el('div', { class: 'moa-timer', role: 'timer', 'aria-live': 'off' },
      '<svg width="168" height="168" viewBox="0 0 168 168" aria-hidden="true"><circle cx="84" cy="84" r="78" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="4"/><circle class="arc" cx="84" cy="84" r="78" fill="none" stroke="#C0D904" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + RING + '" stroke-dashoffset="' + RING + '" transform="rotate(-90 84 84)"/></svg><div class="t"><b>0:00</b><span></span></div>');
    qBubble.parentNode.insertBefore(timer.node, qBubble.nextSibling);
    drawTimer();
  }

  function updateStage() {
    var screen = document.getElementById('screen-chat');
    var body = document.getElementById('chat-body');
    var on = false;
    if (screen && body && getComputedStyle(screen).display !== 'none') {
      var q = body.querySelector('.bubble.q');
      var answered = body.querySelector('.bubble.a, .bubble.loading');
      var input = document.getElementById('answer-input');
      var canAnswer = input && input.style.display !== 'none';
      on = !!q && !answered && canAnswer && isStudent();
      if (on) placeTimer(q);
    }
    if (!on) {
      stopTick();
      if (timer.node && timer.node.parentNode && !document.body.classList.contains('moa-stage')) { /* 이미 꺼짐 */ }
      if (timer.node && timer.node.parentNode) timer.node.parentNode.removeChild(timer.node);
      timer.node = null; timer.q = null; timer.start = 0;
    }
    document.body.classList.toggle('moa-stage', on);
  }

  /* ── 말로 답하기 (휴대폰 브라우저 음성 인식, 안 되는 기기는 버튼 숨김) ── */
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, recOn = false, recBase = '';
  function wireMic() {
    var bar = document.querySelector('#screen-chat .input-bar');
    var input = document.getElementById('answer-input');
    if (!Rec || !bar || !input || bar.querySelector('.moa-mic')) return;
    var mic = el('button', { type: 'button', class: 'moa-mic', 'aria-label': '말로 답하기', 'aria-pressed': 'false' },
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>');
    bar.insertBefore(mic, bar.firstChild);
    function stop() { if (rec) { try { rec.stop(); } catch (e) {} } }
    mic.addEventListener('click', function () {
      if (recOn) { stop(); return; }
      rec = new Rec();
      rec.lang = 'ko-KR'; rec.continuous = true; rec.interimResults = true;
      recBase = input.value.trim();
      rec.onresult = function (ev) {
        var txt = '';
        for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        input.value = (recBase ? recBase + ' ' : '') + txt.trim();
        fire(input, 'input');
      };
      rec.onend = function () { recOn = false; mic.classList.remove('on'); mic.setAttribute('aria-pressed', 'false'); mic.setAttribute('aria-label', '말로 답하기'); };
      rec.onerror = function (e) {
        if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed')) alert('마이크 사용이 허용되지 않았어요. 주소창의 마이크 권한을 켜거나, 글로 답해 주세요.');
      };
      try { rec.start(); } catch (e) { return; }
      recOn = true; mic.classList.add('on'); mic.setAttribute('aria-pressed', 'true'); mic.setAttribute('aria-label', '말하기 멈추기');
      startTimer();
    });
    var send = document.getElementById('send-btn');
    if (send) send.addEventListener('click', stop, true);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  }

  var inputWired = false;
  function wireInput() {
    var input = document.getElementById('answer-input');
    if (!input || inputWired) return;
    inputWired = true;
    input.addEventListener('input', function () { if (document.body.classList.contains('moa-stage')) startTimer(); });
    input.placeholder = '말하듯이 적거나, 마이크를 눌러 말로 답하세요';
  }

  /* ── 질문 위치 표시: "질문 2 / 6 · 남은 질문 4개" (2026-10-03) ── */
  function updateQpos() {
    var track = document.getElementById('progress-track');
    var screen = document.getElementById('screen-chat');
    var node = document.getElementById('moa-qpos');
    var cat = null, idx = 0;
    try { cat = typeof currentCategory !== 'undefined' ? currentCategory : null; idx = typeof currentQuestionIdx !== 'undefined' ? currentQuestionIdx : 0; } catch (e) {}
    var show = track && cat && cat.questions && screen && getComputedStyle(screen).display !== 'none' && isStudent();
    if (!show) { if (node) node.style.display = 'none'; return; }
    if (!node) {
      node = el('div', { id: 'moa-qpos', class: 'moa-qpos', 'aria-live': 'polite' });
      track.parentNode.insertBefore(node, track.nextSibling);
    }
    var n = cat.questions.length, done = 0;
    try { done = Object.keys(answersByIdx || {}).length; } catch (e) {}
    var left = n - done;
    var right = left <= 0 ? '<span class="last">모두 답했어요!</span>' : (idx === n - 1 || left === 1 ? '<span class="last">마지막 질문이에요!</span>' : '남은 질문 ' + left + '개');
    var html = '<span>질문 <b>' + (idx + 1) + '</b> / ' + n + '</span>' + right;
    if (node.innerHTML !== html) node.innerHTML = html;
    if (node.style.display === 'none') node.style.display = '';
  }

  /* ── 시작 전 '오늘의 연습' 안내 (2026-10-03): 몇 문항·몇 분인지 먼저 보여 주고 시작 ── */
  var INTRO_OFF = 'moa_intro_iv_off';
  var skipIntroOnce = false;
  function introOff() { try { return localStorage.getItem(INTRO_OFF) === '1'; } catch (e) { return false; } }
  function showIntro(cat, go) {
    var n = (cat.questions || []).length || 6;
    var mins = Math.max(5, Math.round(n * 1.6));
    var review = false, client = false;
    try { review = typeof REVIEW_MODE !== 'undefined' && !!REVIEW_MODE; } catch (e) {}
    try { client = typeof CLIENT !== 'undefined' && !!CLIENT; } catch (e) {}
    var later = review || client;
    var title = String(cat.title || '면접').replace(EMOJI, '');
    var dots = ''; for (var i = 0; i < n; i++) dots += '<i' + (i < 2 ? ' class="on"' : '') + '></i>';
    var wrap = el('div', { class: 'moa-intro-wrap', role: 'dialog', 'aria-modal': 'true', 'aria-label': '오늘의 연습 안내' });
    wrap.innerHTML =
      '<div class="moa-intro-top"><div class="moa-wordmark" aria-label="MOA FORMULA"><i></i>MOA FORMULA</div></div>' +
      '<div class="moa-intro">' +
      '<span class="k">시작 전 1분 · ' + esc(title) + '</span>' +
      '<h2>질문 ' + n + '개 · 약 ' + mins + '분<br>면접 한 번을 끝까지 해 봐요</h2>' +
      '<p class="s">' + (later ? '질문마다 60초 안에 답하고, 다 끝나면 한 번에 제출해요.' : '질문마다 60초 안에 답하면 바로 피드백이 와요.') + ' 몇 번째 질문인지 위에 계속 보여 드려요.</p>' +
      '<ol>' +
      '<li><b>1</b><div><h3>면접실에서 답하기</h3><p>질문 하나씩 · 말로 답하거나 적기</p></div><em>질문당 1분</em></li>' +
      (later
        ? '<li><b>2</b><div><h3>답변 모아 두기</h3><p>답한 내용은 저장돼요 · 다른 질문으로 옮겨도 그대로</p></div><em>자동 저장</em></li>' +
          '<li><b>3</b><div><h3>제출 → 결과 받기</h3><p>' + (client ? '선생님 검토 후 이메일로 결과가 와요' : '선생님 검토 후 결과 링크가 와요') + '</p></div><em>마지막에</em></li>'
        : '<li><b>2</b><div><h3>바로 피드백 받기</h3><p>잘한 점 · 보완할 점 · 꼬리질문</p></div><em>30초</em></li>' +
          '<li><b>3</b><div><h3>결과 링크 남기기</h3><p>다 끝나면 리허설 리포트로 저장</p></div><em>마지막에</em></li>') +
      '</ol>' +
      '<div class="pv" aria-label="연습 화면 예시"><p class="pv-l"><span>이런 화면에서 연습해요</span><span>예시</span></p>' +
      '<div class="pv-room"><span class="pv-ring">0:42</span><p>' + esc((cat.questions && cat.questions[0]) || '질문이 여기에 나와요') + '<small>권장 60초 · 말로 답하기</small></p></div>' +
      '<div class="pv-dots">' + dots + '</div><p class="pv-m">질문 2 / ' + n + ' — 이 막대가 다 차면 끝!</p>' +
      '<div class="pv-c">' + (later ? '<span>선생님 피드백</span><span>다시 말해 볼 답변</span><span>꼬리질문</span>' : '<span>잘한 점</span><span>다시 말해 볼 답변</span><span>꼬리질문</span><span>워드·PDF</span>') + '</div></div>' +
      '<div class="go-row"><button type="button" class="go">면접 시작하기 →</button><button type="button" class="skip">다음부터 바로 시작하기</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function close() { document.body.style.overflow = prevOverflow; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.querySelector('.go').addEventListener('click', function () { close(); go(); });
    wrap.querySelector('.skip').addEventListener('click', function () { try { localStorage.setItem(INTRO_OFF, '1'); } catch (e) {} close(); go(); });
    setTimeout(function () { var g = wrap.querySelector('.go'); if (g) g.focus({ preventScroll: true }); }, 30);
  }
  function wrapStart() {
    if (typeof window.startCategory !== 'function' || window.startCategory.__moaIntro) return;
    var orig = window.startCategory;
    var wrapped = function (cat, skipHistory) {
      var self = this, args = arguments;
      if (skipHistory || skipIntroOnce || !isStudent() || introOff() || !cat) { skipIntroOnce = false; return orig.apply(self, args); }
      showIntro(cat, function () { orig.apply(self, args); });
    };
    wrapped.__moaIntro = true;
    window.startCategory = wrapped;
  }

  function scan() {
    if (!applyShell()) return;
    enhanceSelect();
    var live = document.getElementById('st-live-btn');
    if (live && EMOJI.test(live.textContent)) live.textContent = live.textContent.replace(EMOJI, '');
    document.querySelectorAll('.sc-toggle').forEach(function (b) { if (EMOJI.test(b.textContent)) b.textContent = b.textContent.replace(EMOJI, ''); });
    wireInput();
    wireMic();
    updateStage();
    updateQpos();
    applyShell();
  }

  // 답변 피드백을 받을 때마다(/api/feedback POST 성공) 허브에 '어디까지 했는지' 저장
  function interviewState() {
    try {
      if (typeof currentCategory === 'undefined' || !currentCategory) return null;
      var total = currentCategory.questions.length;
      var answered = Object.keys(answersByIdx || {}).map(Number);
      var next = 0; while (answered.indexOf(next) >= 0 && next < total) next++;
      return { cat: currentCategory.title, catId: currentCategory.id, done: answered.length, total: total, next: Math.min(next, total) };
    } catch (e) { return null; }
  }
  (function watchFeedback() {
    if (!window.fetch || !MOA_S) return;
    var orig = window.fetch;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = orig.apply(this, arguments);
      if (/\/api\/feedback/.test(url) && init && String(init.method || '').toUpperCase() === 'POST') {
        p.then(function (r) {
          if (!r.ok) return;
          setTimeout(function () { var st = interviewState(); if (st) moaReport('interview', st); }, 400);
        }).catch(function () {});
      }
      return p;
    };
  })();

  // 허브 '이어서 하기'로 들어오면 (?cat=유형&q=번호) 그 유형·질문으로 바로 이동
  function openFromHub() {
    var p = new URLSearchParams(location.search);
    var cat = p.get('cat');
    if (!cat || !isStudent()) return;
    var tries = 0;
    (function wait() {
      var ready = false;
      try { ready = typeof CATEGORIES !== 'undefined' && CATEGORIES.length && !!document.querySelector('#cat-list .cat-card .num'); } catch (e) {} // 전공 고르기 화면이면 학생이 고른 뒤에 이동
      if (!ready) { if (tries++ < 600) setTimeout(wait, 100); return; }
      try {
        var c = CATEGORIES.find(function (x) { return x.id === cat; });
        if (!c) return;
        skipIntroOnce = true; // 허브에서 이어서 하기는 안내 없이 바로
        startCategory(c);
        var q = parseInt(p.get('q') || '0', 10);
        if (q > 0 && q < c.questions.length) goToQuestion(q);
      } catch (e) {}
      try { p.delete('cat'); p.delete('q'); history.replaceState(history.state, '', location.pathname + '?' + p.toString()); } catch (e) {}
    })();
  }

  function start() {
    wrapStart();
    openFromHub();
    scan();
    var pending = false;
    var mo = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; scan(); });
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
