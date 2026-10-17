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
  const averageMs = arr => arr.length ? arr.reduce((s, r) => s + r.timeMs, 0) / arr.length : 0;

  const OP_NAMES = { '+': 'Adição', '-': 'Subtração', '×': 'Multiplicação', '÷': 'Divisão' };

  const S = {
    ops: [], maxN: 10, goalMs: 0,
    pending: [], sessionTotal: 0,
    current: null, last: null,
    qStart: 0, tick: null, locked: false,
    records: [], errors: 0, qErrors: 0
  };

  const HKEY   = 'operacoes_basicas_history_v1';
  const ERRKEY = 'operacoes_basicas_errors_v1';

  /* ---------- chips/preset ---------- */
  $$('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = btn.dataset.preset === 'all';
      $$('.op-cb').forEach(cb => (cb.checked = on));
    });
  });

  /* ---------- persistência ---------- */
  function loadData() {
    try {
      const raw = localStorage.getItem(ERRKEY);
      if (!raw) return { errors: {}, correct: {}, pairs: {}, times: {} };
      const d = JSON.parse(raw);
      return {
        errors:  d.errors  || {},
        correct: d.correct || {},
        pairs:   d.pairs   || {},
        times:   d.times   || {}
      };
    } catch (e) {
      return { errors: {}, correct: {}, pairs: {}, times: {} };
    }
  }
  function saveData(d) {
    try { localStorage.setItem(ERRKEY, JSON.stringify(d)); } catch (e) {}
  }
  function recordError(op, a, b) {
    const d = loadData();
    d.errors[op] = (d.errors[op] || 0) + 1;
    const key = `${a}|${op}|${b}`;
    d.pairs[key] = d.pairs[key] || { errors: 0, correct: 0 };
    d.pairs[key].errors += 1;
    saveData(d);
  }
  function recordCorrect(op, a, b, timeMs) {
    const d = loadData();
    d.correct[op] = (d.correct[op] || 0) + 1;
    const key = `${a}|${op}|${b}`;
    d.pairs[key] = d.pairs[key] || { errors: 0, correct: 0 };
    d.pairs[key].correct += 1;
    d.times[key] = d.times[key] || { totalMs: 0, count: 0 };
    d.times[key].totalMs += timeMs;
    d.times[key].count   += 1;
    saveData(d);
  }

  /* ---------- timer ---------- */
  function startTimer() {
    stopTimer();
    const el = $('#timer');
    const tick = () => {
      const t = performance.now() - S.qStart;
      el.textContent = fmt(t);
      el.style.color = S.goalMs ? (t <= S.goalMs ? '#4f8cff' : '#ff5c5c') : '';
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

  /* ---------- geração de questões ---------- */
  function generate(ops, maxN) {
    const list = [];
    for (const op of ops) {
      if (op === '+') {
        for (let a = 1; a <= maxN; a++)
          for (let b = 1; b <= maxN; b++)
            list.push({ a, b, op, answer: a + b });
      } else if (op === '-') {
        for (let a = 1; a <= maxN; a++)
          for (let b = 1; b <= a; b++)
            list.push({ a, b, op, answer: a - b });
      } else if (op === '×') {
        for (let a = 1; a <= maxN; a++)
          for (let b = 1; b <= maxN; b++)
            list.push({ a, b, op, answer: a * b });
      } else if (op === '÷') {
        for (let b = 1; b <= maxN; b++)
          for (let q = 1; q <= maxN; q++)
            list.push({ a: b * q, b, op, answer: q });
      }
    }
    return list;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- início ---------- */
  function startSession() {
    const ops = $$('.op-cb:checked').map(c => c.value);
    if (!ops.length) {
      alert('Selecione pelo menos uma operação.');
      return;
    }
    const maxN = Math.min(20, Math.max(2, parseInt($('#maxN').value, 10) || 10));
    const sessionLen = Math.max(0, parseInt($('#sessionLen').value, 10) || 0);
    const goalSec = parseSec($('#goalTime').value);

    S.ops = ops;
    S.maxN = maxN;
    S.goalMs = goalSec * 1000;

    const all = generate(ops, maxN);
    let pending;
    if (sessionLen > 0 && sessionLen < all.length) {
      pending = shuffle(all).slice(0, sessionLen);
    } else {
      pending = shuffle(all);
    }
    S.pending = pending;
    S.sessionTotal = pending.length;
    S.records = [];
    S.errors = 0;
    S.locked = false;
    S.current = null;
    S.last = null;

    $('#setup').style.display = 'none';
    $('#results').style.display = 'none';
    $('#quiz').style.display = '';

    updateProgress();
    nextQuestion();
  }

  /* ---------- próxima ---------- */
  function nextQuestion() {
    if (!S.pending.length) { finishSession(); return; }

    let i = Math.floor(Math.random() * S.pending.length);
    if (S.pending.length > 1 && S.pending[i] === S.last) {
      i = (i + 1) % S.pending.length;
    }
    S.current = S.pending.splice(i, 1)[0];
    S.last = S.current;
    S.qErrors = 0;
    S.locked = false;

    const q = S.current;
    $('#question').innerHTML =
      `<span class="num">${q.a}</span>` +
      `<span class="op">${q.op}</span>` +
      `<span class="num">${q.b}</span>`;

    const inp = $('#answer');
    inp.value = '';
    inp.disabled = false;
    inp.focus({ preventScroll: true });

    setFeedback('', '');
    S.qStart = performance.now();
    startTimer();
  }

  /* ---------- responder ---------- */
  $('#answerForm').addEventListener('submit', e => {
    e.preventDefault();
    if (S.locked || !S.current) return;

    const raw = $('#answer').value.trim();
    if (raw === '') return;

    const given = Number(raw.replace(',', '.'));
    const expected = S.current.answer;

    if (given === expected) {
      const timeMs = performance.now() - S.qStart;
      S.locked = true;
      stopTimer();

      S.records.push({
        a: S.current.a,
        b: S.current.b,
        op: S.current.op,
        answer: S.current.answer,
        timeMs,
        errors: S.qErrors
      });

      recordCorrect(S.current.op, S.current.a, S.current.b, timeMs);

      const goalMsg = S.goalMs && timeMs <= S.goalMs ? ' ⚡' : '';
      setFeedback('ok', `✓ ${expected} — ${fmt(timeMs)}${goalMsg}`);
      $('#answer').disabled = true;
      updateProgress();
      setTimeout(nextQuestion, 420);
    } else {
      S.qErrors++;
      S.errors++;
      recordError(S.current.op, S.current.a, S.current.b);
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

  /* ---------- pular ---------- */
  $('#skipBtn').addEventListener('click', () => {
    if (S.locked || !S.current) return;
    const pos = Math.floor(Math.random() * (S.pending.length + 1));
    S.pending.splice(pos, 0, S.current);
    S.current = null;
    S.last = null;
    setFeedback('', '');
    nextQuestion();
  });

  /* ---------- encerrar ---------- */
  $('#quitBtn').addEventListener('click', () => {
    if (!confirm('Encerrar o treino agora? As questões pendentes não serão registradas.')) return;
    finishSession();
  });

  /* ---------- progresso ---------- */
  function updateProgress() {
    const done = S.records.length;
    const total = S.sessionTotal;

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

  /* ---------- finalização ---------- */
  function finishSession() {
    stopTimer();
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
    const recs = [...S.records];
    const done = recs.length;
    const total = S.sessionTotal;
    const totalMs = recs.reduce((s, r) => s + r.timeMs, 0);
    const avg = averageMs(recs);

    $('#resultsTitle').textContent =
      done === total ? '🎉 Sessão completa!' : `Sessão encerrada (${done} de ${total})`;

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
      <div class="stat"><span class="k">Mais rápida</span><span class="v">${fastest ? `${fastest.a}${fastest.op}${fastest.b} · ${fmt(fastest.timeMs)}` : '—'}</span></div>
      <div class="stat"><span class="k">Mais lenta</span><span class="v">${slowest ? `${slowest.a}${slowest.op}${slowest.b} · ${fmt(slowest.timeMs)}` : '—'}</span></div>
      <div class="stat"><span class="k">Total de erros</span><span class="v">${S.errors}</span></div>
      ${goalCards}
    `;

    $('#recordsBody').innerHTML = recs.map(r => {
      const cls = timeClass(r.timeMs);
      const goalMark = S.goalMs ? (r.timeMs <= S.goalMs ? ' ⚡' : '') : '';
      return `<tr>
        <td>${r.a} ${r.op} ${r.b}</td>
        <td class="muted">${r.answer}</td>
        <td class="${cls}">${fmt(r.timeMs)}${goalMark}</td>
        <td class="${r.errors ? 't-bad' : 'muted'}">${r.errors || '—'}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" class="muted">Nenhuma questão respondida.</td></tr>`;
  }

  /* ---------- relatório ---------- */
  function renderReport() {
    const data = loadData();
    const body = $('#reportBody');

    const opKeys = ['+', '-', '×', '÷'];
    const errorEntries = [];
    for (const op of opKeys) {
      const errs = data.errors[op] || 0;
      const corr = data.correct[op] || 0;
      if (errs === 0 && corr === 0) continue;
      errorEntries.push({ op, errors: errs, correct: corr });
    }

    if (!errorEntries.length) {
      body.innerHTML = `<p class="muted empty-msg">Ainda não há dados.<br>Faça um treino e volte aqui.</p>`;
      return;
    }

    errorEntries.sort((x, y) => {
      if (y.errors !== x.errors) return y.errors - x.errors;
      const tx = (x.errors + x.correct) ? x.errors / (x.errors + x.correct) : 0;
      const ty = (y.errors + y.correct) ? y.errors / (y.errors + y.correct) : 0;
      return ty - tx;
    });

    const worst = errorEntries[0];
    const totalErrors  = errorEntries.reduce((s, e) => s + e.errors, 0);
    const totalCorrect = errorEntries.reduce((s, e) => s + e.correct, 0);
    const maxErrors = Math.max(...errorEntries.map(e => e.errors), 1);

    let html = '';

    if (worst.errors > 0) {
      const rate = worst.errors / (worst.errors + worst.correct);
      html += `
        <div class="worst-banner">
          <div class="big">🏆 Você erra mais: ${OP_NAMES[worst.op]}</div>
          <div class="small">${worst.errors} erro(s) · ${worst.correct} acerto(s) · ${(rate * 100).toFixed(0)}% das tentativas foram erradas</div>
        </div>
      `;
    } else {
      html += `<div class="worst-banner worst-banner-ok"><div class="big ok-text">🎉 Nenhum erro registrado!</div></div>`;
    }

    const overallRate = (totalErrors + totalCorrect)
      ? (totalErrors / (totalErrors + totalCorrect) * 100).toFixed(0)
      : 0;

    html += `<div class="stats stats-report">
      <span>total de erros <b>${totalErrors}</b></span>
      <span>acertos <b>${totalCorrect}</b></span>
      <span>taxa geral <b>${overallRate}%</b></span>
    </div>`;

    html += '<div>';
    for (const e of errorEntries) {
      const isWorst = e === worst && e.errors > 0;
      const barPct = (e.errors / maxErrors) * 100;
      const rate = (e.errors + e.correct)
        ? (e.errors / (e.errors + e.correct) * 100).toFixed(0)
        : 0;

      const pairs = [];
      for (const [key, v] of Object.entries(data.pairs || {})) {
        const parts = key.split('|');
        if (parts[1] === e.op && (v.errors > 0 || v.correct > 0)) {
          pairs.push({ a: +parts[0], b: +parts[2], ...v });
        }
      }
      pairs.sort((x, y) => y.errors - x.errors || (y.errors + y.correct) - (x.errors + x.correct));

      let pairsHtml = '';
      if (pairs.length) {
        pairsHtml = '<ul class="hist">' + pairs.slice(0, 15).map(p =>
          `<li>
            <span>${p.a} ${e.op} ${p.b}</span>
            <span class="${p.errors ? 't-bad' : 'muted'}">${p.errors} erro(s)</span>
            <span class="muted">${p.correct} acerto(s)</span>
          </li>`
        ).join('') + '</ul>';
      }

      html += `
        <details class="table-report${isWorst ? ' worst' : ''}">
          <summary>
            <span class="label">${OP_NAMES[e.op]}</span>
            <div class="track"><div class="fill" style="width:${barPct}%"></div></div>
            <span class="count">${e.errors} erro(s) · ${rate}%</span>
          </summary>
          ${pairsHtml || '<p class="muted pairs-empty">Sem detalhes.</p>'}
        </details>
      `;
    }
    html += '</div>';

    /* tempos */
    const pairTimes = [];
    for (const [key, v] of Object.entries(data.times || {})) {
      if (!v.count) continue;
      const parts = key.split('|');
      pairTimes.push({ a: +parts[0], b: +parts[2], op: parts[1], avgMs: v.totalMs / v.count, count: v.count });
    }
    pairTimes.sort((x, y) => y.avgMs - x.avgMs);

    const opTimes = {};
    for (const p of pairTimes) {
      if (!opTimes[p.op]) opTimes[p.op] = { totalMs: 0, count: 0 };
      opTimes[p.op].totalMs += p.avgMs * p.count;
      opTimes[p.op].count   += p.count;
    }
    const opTimeEntries = Object.entries(opTimes)
      .map(([op, v]) => ({ op, avgMs: v.totalMs / v.count, count: v.count }))
      .sort((x, y) => y.avgMs - x.avgMs);

    html += '<div class="section-divider"></div>';
    html += '<h3 class="section-title">🐢 Tempos de resposta</h3>';
    html += '<p class="section-sub">Média acumulada das questões acertadas (inclui tentativas)</p>';

    if (opTimeEntries.length) {
      const slowest = opTimeEntries[0];
      const totalResponses = opTimeEntries.reduce((s, t) => s + t.count, 0);
      const totalMsAcc = opTimeEntries.reduce((s, t) => s + t.avgMs * t.count, 0);
      const overallAvg = totalResponses ? totalMsAcc / totalResponses : 0;
      const maxAvg = slowest.avgMs || 1;

      html += `
        <div class="slow-banner">
          <div class="big">🐢 Você demora mais: ${OP_NAMES[slowest.op]}</div>
          <div class="small">média ${fmt(slowest.avgMs)} · ${slowest.count} resposta(s)</div>
        </div>
      `;

      html += `<div class="stats stats-report">
        <span>média geral <b>${fmt(overallAvg)}</b></span>
        <span>operações medidas <b>${opTimeEntries.length}</b></span>
        <span>total de respostas <b>${totalResponses}</b></span>
      </div>`;

      html += '<div>';
      for (const t of opTimeEntries) {
        const cls = timeClass(t.avgMs);
        const barPct = (t.avgMs / maxAvg) * 100;

        const timePairs = pairTimes.filter(p => p.op === t.op);
        let pairsHtml = '';
        if (timePairs.length) {
          pairsHtml = '<ul class="hist">' + timePairs.slice(0, 15).map(p =>
            `<li>
              <span>${p.a} ${t.op} ${p.b}</span>
              <span class="${timeClass(p.avgMs)}">média ${fmt(p.avgMs)}</span>
              <span class="muted">${p.count} resposta(s)</span>
            </li>`
          ).join('') + '</ul>';
        }

        html += `
          <details class="table-report ${cls}">
            <summary>
              <span class="label">${OP_NAMES[t.op]}</span>
              <div class="track"><div class="fill" style="width:${barPct}%"></div></div>
              <span class="count">média ${fmt(t.avgMs)} · ${t.count}x</span>
            </summary>
            ${pairsHtml || '<p class="muted pairs-empty">Sem detalhes.</p>'}
          </details>
        `;
      }
      html += '</div>';

      const top = pairTimes.slice(0, 10);
      if (top.length) {
        const maxPairAvg = top[0].avgMs || 1;
        html += `
          <h3 class="section-title section-title-spaced">🐢 Questões mais lentas</h3>
          <p class="section-sub">Top ${top.length} combinações com maior tempo médio</p>
          <div class="pair-bars">
        `;
        for (const p of top) {
          const cls = timeClass(p.avgMs);
          const barPct = (p.avgMs / maxPairAvg) * 100;
          html += `
            <div class="pair-bar-row ${cls}">
              <span class="pair-label">${p.a} ${p.op} ${p.b}</span>
              <div class="track"><div class="fill" style="width:${barPct}%"></div></div>
              <span class="pair-time">${fmt(p.avgMs)}</span>
            </div>
          `;
        }
        html += '</div>';
      }
    } else {
      html += '<p class="muted empty-msg">Sem dados de tempo ainda.</p>';
    }

    body.innerHTML = html;
  }

  function openReport() {
    renderReport();
    $('#reportModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeReport() {
    $('#reportModal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ---------- histórico ---------- */
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveHistory() {
    if (!S.records.length) return;
    try {
      const h = loadHistory();
      const totalMs = S.records.reduce((s, r) => s + r.timeMs, 0);
      h.push({
        date: new Date().toISOString(),
        ops: S.ops,
        maxN: S.maxN,
        goalMs: S.goalMs,
        total: S.records.length,
        planned: S.sessionTotal,
        totalMs,
        avgMs: averageMs(S.records),
        errors: S.errors
      });
      localStorage.setItem(HKEY, JSON.stringify(h.slice(-25)));
    } catch (e) {}
  }
  function renderHistory() {
    const h = loadHistory();
    const el = $('#history');
    if (!h.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<h3>Últimas sessões</h3><ul class="hist">` +
      h.slice().reverse().map(s => `
        <li>
          <span>${new Date(s.date).toLocaleString('pt-BR')}</span>
          <span>operações: ${s.ops.join(' ')}</span>
          <span>${s.total}/${s.planned}</span>
          <span>média ${fmt(s.avgMs)}</span>
          <span>${s.errors} erro(s)</span>
        </li>`).join('') + `</ul>`;
  }

  /* ---------- CSV ---------- */
  function exportCSV() {
    const recs = [...S.records];
    const lines = ['conta,resposta,tempo_segundos,erros,dentro_da_meta'];
    for (const r of recs) {
      const inGoal = S.goalMs ? (r.timeMs <= S.goalMs ? 'sim' : 'nao') : '';
      lines.push(`${r.a}${r.op}${r.b},${r.answer},${(r.timeMs / 1000).toFixed(2)},${r.errors},${inGoal}`);
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operacoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- botões ---------- */
  $('#startBtn').addEventListener('click', startSession);
  $('#againBtn').addEventListener('click', () => {
    $('#results').style.display = 'none';
    $('#setup').style.display = '';
    renderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#csvBtn').addEventListener('click', exportCSV);
  $('#reportBtn').addEventListener('click', openReport);
  $('#reportBtn2').addEventListener('click', openReport);
  $('#closeReportBtn').addEventListener('click', closeReport);

  $('#reportModal').addEventListener('click', e => {
    if (e.target === $('#reportModal')) closeReport();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#reportModal').classList.contains('hidden')) closeReport();
  });

  $('#resetErrorsBtn').addEventListener('click', () => {
    if (!confirm('Limpar todos os dados acumulados (erros e tempos)? O histórico será mantido.')) return;
    try { localStorage.removeItem(ERRKEY); } catch (e) {}
    renderReport();
  });

  $('#clearAllBtn').addEventListener('click', () => {
    if (!confirm('Limpar TODOS os dados salvos?\n\nIsso apagará:\n• O histórico de sessões\n• Os dados de erros acumulados\n• Os tempos de resposta acumulados\n\nEssa ação não pode ser desfeita.')) return;
    try {
      localStorage.removeItem(HKEY);
      localStorage.removeItem(ERRKEY);
    } catch (e) {}
    renderHistory();
    if (!$('#reportModal').classList.contains('hidden')) renderReport();
    const btn = $('#clearAllBtn');
    const original = btn.textContent;
    btn.textContent = '✓ Dados limpos';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1600);
  });

  renderHistory();
})();