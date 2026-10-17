(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const fmt = ms => (ms / 1000).toFixed(1).replace('.', ',') + 's';
  const fmtLong = ms => {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m ? `${m}min ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  };
  const parseSec = str => {
    const n = parseFloat(String(str).replace(',', '.'));
    return isFinite(n) && n > 0 ? n : 0;
  };

  /* -------- média de tempo (função dedicada) -------- */
  function averageMs(records) {
    if (!records.length) return 0;
    return records.reduce((s, r) => s + r.timeMs, 0) / records.length;
  }

  /* ---------------- Estado ---------------- */
  const S = {
    tables: [], maxB: 10, goalMs: 0,
    all: [], pending: [],
    current: null, last: null,
    qStart: 0, tick: null, locked: false,
    records: [], errors: 0, qErrors: 0,
    sessionStart: 0, finished: false
  };

  const HKEY = 'tabuada_rapida_history_v1';

  /* ---------------- Setup: chips ---------------- */
  const chipsEl = $('#tables');
  for (let t = 1; t <= 10; t++) {
    chipsEl.insertAdjacentHTML('beforeend',
      `<label class="chip">
         <input type="checkbox" class="table-cb" value="${t}" checked>
         <span>${t}</span>
       </label>`);
  }

  $$('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.dataset.preset === 'all';
      $$('.table-cb').forEach(cb => (cb.checked = on));
    });
  });

  /* ---------------- Timer ---------------- */
  function startTimer() {
    stopTimer();
    const el = $('#timer');
    const tick = () => {
      const elapsed = performance.now() - S.qStart;
      el.textContent = fmt(elapsed);
      el.style.color = S.goalMs
        ? (elapsed <= S.goalMs ? '#4f8cff' : '#ff5c5c')
        : '';
    };
    tick();
    S.tick = setInterval(tick, 50);
  }
  function stopTimer() {
    if (S.tick) clearInterval(S.tick);
    S.tick = null;
  }

  function setFeedback(kind, text) {
    const el = $('#feedback');
    el.className = 'feedback' + (kind ? ' ' + kind : '');
    el.textContent = text;
  }

  /* ---------------- Início ---------------- */
  function startSession() {
    const tables = $$('.table-cb:checked').map(c => +c.value).sort((a, b) => a - b);
    if (!tables.length) {
      alert('Selecione pelo menos uma tabuada.');
      return;
    }
    const maxB = Math.min(12, Math.max(1, parseInt($('#maxB').value, 10) || 10));
    const goalSec = parseSec($('#goalTime').value);

    S.tables = tables;
    S.maxB = maxB;
    S.goalMs = goalSec * 1000;
    S.all = [];
    for (const a of tables) {
      for (let b = 1; b <= maxB; b++) S.all.push({ a, b });
    }
    S.pending = S.all.slice();
    S.records = [];
    S.errors = 0;
    S.locked = false;
    S.finished = false;
    S.current = null;
    S.last = null;
    S.sessionStart = Date.now();

    $('#setup').style.display = 'none';
    $('#results').style.display = 'none';
    $('#quiz').style.display = '';

    updateProgress();
    nextQuestion();
  }

  /* ---------------- Próxima questão ---------------- */
  function nextQuestion() {
    if (!S.pending.length) {
      finishSession();
      return;
    }

    let i = Math.floor(Math.random() * S.pending.length);
    if (S.pending.length > 1 && S.pending[i] === S.last) {
      i = (i + 1) % S.pending.length;
    }
    S.current = S.pending.splice(i, 1)[0];
    S.last = S.current;
    S.qErrors = 0;
    S.locked = false;

    $('#question').innerHTML = `${S.current.a} <span class="x">×</span> ${S.current.b}`;

    const inp = $('#answer');
    inp.value = '';
    inp.disabled = false;
    inp.focus({ preventScroll: true });

    setFeedback('', '');
    S.qStart = performance.now();
    startTimer();
  }

  /* ---------------- Responder ---------------- */
  $('#answerForm').addEventListener('submit', e => {
    e.preventDefault();
    if (S.locked || !S.current) return;

    const raw = $('#answer').value.trim();
    if (raw === '') return;

    const given = Number(raw.replace(',', '.'));
    const expected = S.current.a * S.current.b;

    if (given === expected) {
      const timeMs = performance.now() - S.qStart;
      S.locked = true;
      stopTimer();

      S.records.push({
        a: S.current.a,
        b: S.current.b,
        timeMs,
        errors: S.qErrors
      });

      const goalMsg = S.goalMs && timeMs <= S.goalMs ? ' ⚡' : '';
      setFeedback('ok', `✓ ${expected} — ${fmt(timeMs)}${goalMsg}`);
      $('#answer').disabled = true;

      updateProgress();
      setTimeout(nextQuestion, 420);
    } else {
      S.qErrors++;
      S.errors++;
      setFeedback('err', '✗ Errado, tente novamente');

      const inp = $('#answer');
      inp.value = '';
      inp.focus({ preventScroll: true });

      const form = $('#answerForm');
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
    }
  });

  /* ---------------- Pular ---------------- */
  $('#skipBtn').addEventListener('click', () => {
    if (S.locked || !S.current) return;
    const pos = Math.floor(Math.random() * (S.pending.length + 1));
    S.pending.splice(pos, 0, S.current);
    S.current = null;
    S.last = null;
    setFeedback('', '');
    nextQuestion();
  });

  /* ---------------- Encerrar ---------------- */
  $('#quitBtn').addEventListener('click', () => {
    if (!confirm('Encerrar o treino agora? As questões pendentes não serão registradas.')) return;
    finishSession();
  });

  /* ---------------- Progresso ---------------- */
  function updateProgress() {
    const done = S.records.length;
    const total = S.all.length;

    $('#progress').textContent = `${done} / ${total}`;
    $('#progressFill').style.width = (total ? (done / total) * 100 : 0) + '%';

    if (done) {
      const avg = averageMs(S.records);
      const slow = Math.max(...S.records.map(r => r.timeMs));
      const avgCls = S.goalMs ? (avg <= S.goalMs ? 't-ok' : 't-bad') : '';
      const goalTxt = S.goalMs
        ? ` <span class="muted">/ meta ${fmt(S.goalMs)}</span>`
        : '';
      $('#liveStats').innerHTML =
        `<span>média <b class="${avgCls}">${fmt(avg)}</b>${goalTxt}</span>` +
        `<span>mais lenta <b>${fmt(slow)}</b></span>` +
        `<span>erros <b>${S.errors}</b></span>`;
    } else {
      $('#liveStats').innerHTML = `<span>Digite a resposta e pressione <b>Enter</b></span>`;
    }
  }

  /* ---------------- Finalização ---------------- */
  function finishSession() {
    stopTimer();
    S.finished = true;
    S.current = null;
    $('#quiz').style.display = 'none';
    $('#results').style.display = '';
    renderResults();
    saveHistory();
  }

  function timeClass(ms) {
    if (S.goalMs) {
      if (ms <= S.goalMs) return 't-ok';
      if (ms <= S.goalMs * 1.5) return 't-warn';
      return 't-bad';
    }
    return ms < 3000 ? 't-ok' : ms < 8000 ? 't-warn' : 't-bad';
  }

  function renderResults() {
    const recs = [...S.records].sort((x, y) => x.a - y.a || x.b - y.b);
    const done = recs.length;
    const total = S.all.length;
    const totalMs = recs.reduce((s, r) => s + r.timeMs, 0);
    const avg = averageMs(recs);

    $('#resultsTitle').textContent =
      done === total ? '🎉 Tabuada completa!' : `Sessão encerrada (${done} de ${total})`;

    let fastest = null, slowest = null;
    for (const r of recs) {
      if (!fastest || r.timeMs < fastest.timeMs) fastest = r;
      if (!slowest || r.timeMs > slowest.timeMs) slowest = r;
    }
    const firstTry = recs.filter(r => r.errors === 0).length;
    const pct = done ? Math.round((firstTry / done) * 100) : 0;

    const avgCls = S.goalMs ? (avg <= S.goalMs ? 't-ok' : 't-bad') : '';
    const inGoal = S.goalMs ? recs.filter(r => r.timeMs <= S.goalMs).length : 0;
    const goalPct = done && S.goalMs ? Math.round((inGoal / done) * 100) : 0;

    let goalCards = '';
    if (S.goalMs) {
      const delta = avg - S.goalMs;
      const deltaCls = delta <= 0 ? 't-ok' : 't-bad';
      const deltaTxt = (delta <= 0 ? '−' : '+') + fmt(Math.abs(delta));
      goalCards = `
        <div class="stat"><span class="k">Meta por questão</span><span class="v">${fmt(S.goalMs)}</span></div>
        <div class="stat"><span class="k">Dentro da meta</span><span class="v">${inGoal}/${done} · ${goalPct}%</span></div>
        <div class="stat"><span class="k">Diferença p/ meta</span><span class="v ${deltaCls}">${deltaTxt}</span></div>
      `;
    }

    $('#summary').innerHTML = `
      <div class="stat"><span class="k">Questões</span><span class="v">${done}/${total}</span></div>
      <div class="stat"><span class="k">Tempo total</span><span class="v">${fmtLong(totalMs)}</span></div>
      <div class="stat"><span class="k">Tempo médio</span><span class="v ${avgCls}">${fmt(avg)}</span></div>
      <div class="stat"><span class="k">Acertos de 1ª</span><span class="v">${pct}%</span></div>
      <div class="stat"><span class="k">Mais rápida</span><span class="v">${fastest ? `${fastest.a}×${fastest.b} · ${fmt(fastest.timeMs)}` : '—'}</span></div>
      <div class="stat"><span class="k">Mais lenta</span><span class="v">${slowest ? `${slowest.a}×${slowest.b} · ${fmt(slowest.timeMs)}` : '—'}</span></div>
      <div class="stat"><span class="k">Total de erros</span><span class="v">${S.errors}</span></div>
      ${goalCards}
    `;

    $('#recordsBody').innerHTML = recs.map(r => {
      const cls = timeClass(r.timeMs);
      const goalMark = S.goalMs ? (r.timeMs <= S.goalMs ? ' ⚡' : '') : '';
      return `<tr>
        <td>${r.a} × ${r.b}</td>
        <td class="muted">${r.a * r.b}</td>
        <td class="${cls}">${fmt(r.timeMs)}${goalMark}</td>
        <td class="${r.errors ? 't-bad' : 'muted'}">${r.errors || '—'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" class="muted">Nenhuma questão respondida.</td></tr>`;
  }

  /* ---------------- Histórico (localStorage) ---------------- */
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HKEY) || '[]');
    } catch (e) {
      return [];
    }
  }
  function saveHistory() {
    if (!S.records.length) return;
    try {
      const h = loadHistory();
      const totalMs = S.records.reduce((s, r) => s + r.timeMs, 0);
      const inGoal = S.goalMs ? S.records.filter(r => r.timeMs <= S.goalMs).length : null;
      h.push({
        date: new Date().toISOString(),
        tables: S.tables,
        maxB: S.maxB,
        goalMs: S.goalMs,
        total: S.records.length,
        planned: S.all.length,
        totalMs,
        avgMs: averageMs(S.records),
        inGoal,
        errors: S.errors
      });
      localStorage.setItem(HKEY, JSON.stringify(h.slice(-25)));
    } catch (e) { /* localStorage indisponível */ }
  }
  function renderHistory() {
    const h = loadHistory();
    const el = $('#history');
    if (!h.length) { el.innerHTML = ''; return; }

    el.innerHTML = `<h3>Últimas sessões</h3><ul class="hist">` +
      h.slice().reverse().map(s => {
        const goalTxt = s.goalMs
          ? ` · meta ${fmt(s.goalMs)} (${s.inGoal}/${s.total} ⚡)`
          : '';
        return `
        <li>
          <span>${new Date(s.date).toLocaleString('pt-BR')}</span>
          <span>tabuadas: ${s.tables.join(', ')}</span>
          <span>${s.total}/${s.planned} questões</span>
          <span>média ${fmt(s.avgMs)}${goalTxt}</span>
          <span>${s.errors} erro(s)</span>
        </li>`;
      }).join('') + `</ul>`;
  }

  /* ---------------- CSV ---------------- */
  function exportCSV() {
    const recs = [...S.records].sort((x, y) => x.a - y.a || x.b - y.b);
    const lines = ['conta,resposta,tempo_segundos,erros,dentro_da_meta'];
    for (const r of recs) {
      const inGoal = S.goalMs ? (r.timeMs <= S.goalMs ? 'sim' : 'nao') : '';
      lines.push(`${r.a}x${r.b},${r.a * r.b},${(r.timeMs / 1000).toFixed(2)},${r.errors},${inGoal}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tabuada-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------------- Botões ---------------- */
  $('#startBtn').addEventListener('click', startSession);
  $('#againBtn').addEventListener('click', () => {
    $('#results').style.display = 'none';
    $('#setup').style.display = '';
    renderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#csvBtn').addEventListener('click', exportCSV);

  renderHistory();
})();