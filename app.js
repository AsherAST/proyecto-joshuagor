(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  let state = {
    mode: 'ordered',
    queue: [],
    skipped: [],
    completed: [],
    completedIds: new Set(),
    currentPokemon: null,
    startTime: null,
    timerInterval: null,
    correctCount: 0,
    wrongCount: 0,
    answered: false
  };

  let reviewState = {
    queue: [],
    currentPokemon: null,
    hintsUsed: 0,
    correctCount: 0,
    startTime: null,
    timerInterval: null
  };

  let wrongForReview = [];

  let listState = { found: new Set(), correctNames: {} };

  const screens = {
    start: $('#screen-start'),
    quiz: $('#screen-quiz'),
    results: $('#screen-results')
  };

  function init() {
    setupModeButtons();
    setupEventListeners();
    loadHistory();
    // Nombre de jugador persistente
    const saved = localStorage.getItem('pokemon-quiz-player') || '';
    const pi = $('#input-player');
    if (pi) {
      pi.value = saved;
      pi.addEventListener('input', () => {
        localStorage.setItem('pokemon-quiz-player', pi.value.trim().slice(0, 20));
      });
    }
    const btnRefresh = $('#btn-refresh-global');
    if (btnRefresh) btnRefresh.addEventListener('click', (e) => { e.preventDefault(); loadGlobalRanking(); });
    document.querySelectorAll('#rank-tabs .rank-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#rank-tabs .rank-tab').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        rankingTab = btn.dataset.mode;
        loadGlobalRanking();
      });
    });
    loadGlobalRanking();
  }

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function setupModeButtons() {
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.mode = btn.dataset.mode;
      });
    });
    document.querySelector('[data-mode="ordered"]').classList.add('selected');
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normalize(s) {
    return s.replace(/[^a-z0-9]/g, '').toLowerCase();
  }

  // Check name match, including nidoran male/female
  function nameMatches(userAnswer, pokemon) {
    const norm = normalize(userAnswer);
    const pokemonName = pokemon.name.toLowerCase();
    const baseName = normalize(pokemonName);

    if (norm === baseName) return true;

    // Nidoran matching: nidoran matches nidoran and nidoran♂ and nidoran♀
    if (baseName === 'nidoran' && (norm === 'nidoran' || norm === 'nidoranm' || norm === 'nidoranf' || norm === 'nidoran' || norm === 'nidoranm' || norm === 'nidoranf')) return true;
    if (norm === 'nidoran' && (baseName === 'nidoran' || baseName.includes('nidoran'))) return true;

    return false;
  }

  // ===== START QUIZ =====
  function startQuiz() {
    resetState();
    state.startTime = Date.now();
    startTimer();

    if (state.mode === 'list') {
      showScreen('quiz');
      $('#screen-quiz-single').classList.add('hidden');
      $('#screen-quiz-list').classList.remove('hidden');
      $('.quiz-progress').classList.add('hidden');
      renderListMode();
    } else {
      if (state.mode === 'ordered') {
        state.queue = [...POKEMON];
      } else {
        state.queue = shuffle(POKEMON);
      }
      showScreen('quiz');
      $('#screen-quiz-single').classList.remove('hidden');
      $('#screen-quiz-list').classList.add('hidden');
      $('.quiz-progress').classList.remove('hidden');
      renderSpriteGrid();
      showNextPokemon();
    }
  }

  function resetState() {
    state.queue = [];
    state.skipped = [];
    state.completed = [];
    state.completedIds = new Set();
    state.currentPokemon = null;
    state.correctCount = 0;
    state.wrongCount = 0;
    state.answered = false;
    if (state.timerInterval) clearInterval(state.timerInterval);
    $('#input-answer').value = '';
    $('#input-answer').className = 'input-answer';
    $('#input-answer').disabled = false;
    $('#feedback').classList.add('hidden');
  }

  // ===== TIMER =====
  function startTimer() {
    updateTimer();
    state.timerInterval = setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    const e = Math.floor((Date.now() - state.startTime) / 1000);
    $('#timer').textContent = `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;
  }

  function getElapsed() {
    const e = Math.floor((Date.now() - state.startTime) / 1000);
    return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;
  }

  // ===== SPRITE GRID =====
  function renderSpriteGrid() {
    const grid = $('#sprite-grid');
    grid.innerHTML = '';
    const list = POKEMON;

    list.forEach(p => {
      const el = document.createElement('div');
      el.className = 'sprite-grid-item';
      el.dataset.id = p.id;
      el.innerHTML = `
        <img src="${p.sprite}" alt="${p.id}" class="sprite-grid-img">
        <span class="sprite-grid-num">#${p.id}</span>
      `;
      grid.appendChild(el);
    });

    updateSpriteGridCount();
  }

  function updateSpriteGrid() {
    state.completedIds = new Set(state.completed.map(p => p.id));
    document.querySelectorAll('.sprite-grid-item').forEach(el => {
      const id = parseInt(el.dataset.id);
      if (state.completedIds.has(id)) {
        // Use last entry for this pokemon (in case it was skipped then answered)
        const entries = state.completed.filter(c => c.id === id);
        const p = entries[entries.length - 1];
        el.classList.add('done');
        el.classList.remove('correct', 'wrong', 'skipped');
        if (p && p.correct) {
          el.classList.add('correct');
        } else if (p && p.skipped) {
          el.classList.add('skipped');
        } else if (p) {
          el.classList.add('wrong');
        }
      } else {
        el.classList.remove('done', 'correct', 'wrong', 'skipped');
      }
    });
    updateSpriteGridCount();
  }

  function updateSpriteGridCount() {
    const done = state.completedIds.size;
    const total = POKEMON.length;
    $('#sprite-grid-count').textContent = `${done}/${total}`;
  }

  // ===== SHOW NEXT =====
  function showNextPokemon() {
    state.answered = false;
    const input = $('#input-answer');
    input.value = '';
    input.className = 'input-answer';
    input.disabled = false;
    input.focus();
    $('#feedback').classList.add('hidden');

    if (state.queue.length === 0 && state.skipped.length === 0) {
      finishQuiz();
      return;
    }

    if (state.queue.length === 0) {
      state.queue = state.skipped;
      state.skipped = [];
    }

    state.currentPokemon = state.queue.shift();
    $('#pokemon-number').textContent = `#${state.currentPokemon.id}`;
    $('#pokemon-sprite').src = state.currentPokemon.sprite;
    updateProgress();
    updateStats();
    updateSpriteGrid();
  }

  // ===== LIVE INPUT CHECK =====
  function onInput() {
    if (state.answered || !state.currentPokemon) return;
    const input = $('#input-answer');
    const userAnswer = input.value.trim().toLowerCase();
    if (!userAnswer) return;

    if (nameMatches(userAnswer, state.currentPokemon)) {
      state.answered = true;
      input.disabled = true;
      input.classList.add('correct');
      state.correctCount++;
      state.completed.push({ ...state.currentPokemon, correct: true });
      updateStats();
      updateSpriteGrid();
      updateProgress();
      setTimeout(() => showNextPokemon(), 350);
    }
  }

  // ===== SKIP =====
  function skipPokemon() {
    if (state.answered || !state.currentPokemon) return;
    state.skipped.push(state.currentPokemon);
    state.completed.push({ ...state.currentPokemon, correct: false, skipped: true });
    showNextPokemon();
  }

  // ===== DON'T KNOW =====
  function dontKnow() {
    if (state.answered || !state.currentPokemon) return;
    const input = $('#input-answer');
    input.value = state.currentPokemon.name;
    input.disabled = true;
    state.answered = true;
    input.classList.add('wrong');
    state.wrongCount++;
    state.completed.push({ ...state.currentPokemon, correct: false });
    showFeedback(false, `Era: ${state.currentPokemon.name}`);
    updateStats();
    updateSpriteGrid();
    setTimeout(() => showNextPokemon(), 1200);
  }

  function showFeedback(correct, text) {
    const f = $('#feedback');
    f.className = `feedback ${correct ? 'correct' : 'wrong'}`;
    $('#feedback-text').textContent = text;
    f.classList.remove('hidden');
  }

  // ===== PROGRESS / STATS =====
  function updateProgress() {
    const total = POKEMON.length;
    const done = state.completedIds.size;
    $('#progress-fill').style.width = `${(done/total)*100}%`;
    $('#quiz-counter').textContent = `${done} / ${total}`;
  }

  function updateStats() {
    $('#stat-correct').textContent = state.correctCount;
    $('#stat-wrong').textContent = state.wrongCount;
    $('#stat-pending').textContent = state.queue.length;
    $('#stat-skipped').textContent = state.skipped.length;
  }

  // ===== LIST MODE =====
  function renderListMode() {
    listState = { found: new Set(), correctNames: {} };
    const grid = $('#list-pokemon-grid');
    grid.innerHTML = '';

    POKEMON.forEach(p => {
      listState.correctNames[p.id] = p.name;
      const el = document.createElement('div');
      el.className = 'list-pokemon-item';
      el.dataset.id = p.id;
      el.innerHTML = `
        <div class="list-pokemon-sprite-placeholder">?</div>
        <img src="${p.sprite}" alt="${p.id}" class="list-pokemon-img hidden">
        <span class="list-pokemon-num">#${p.id}</span>
        <span class="list-pokemon-name">???</span>
      `;
      grid.appendChild(el);
    });

    const input = $('#list-input');
    input.value = '';
    input.disabled = false;
    input.focus();
    $('#list-feedback').classList.add('hidden');
    updateListStats();
  }

  function onListInput() {
    const input = $('#list-input');
    const val = input.value.trim().toLowerCase();
    if (!val) return;

    let found = false;
    let foundPokemon = null;

    for (const p of POKEMON) {
      if (!listState.found.has(p.id) && nameMatches(val, p)) {
        listState.found.add(p.id);
        foundPokemon = p;
        found = true;
        break;
      }
    }

    if (found) {
      const el = document.querySelector(`.list-pokemon-item[data-id="${foundPokemon.id}"]`);
      if (el) {
        el.classList.add('found');
        el.querySelector('.list-pokemon-name').textContent = foundPokemon.name;
        el.querySelector('.list-pokemon-sprite-placeholder').classList.add('hidden');
        el.querySelector('.list-pokemon-img').classList.remove('hidden');
      }
      input.value = '';
      state.correctCount++;
      updateListStats();

      if (listState.found.size === POKEMON.length) {
        input.disabled = true;
        showListFeedback(true, '¡Completaste todos!');
        setTimeout(() => finishListQuiz(), 1500);
      }
    }
  }

  function updateListStats() {
    $('#list-correct').textContent = listState.found.size;
    $('#list-remaining').textContent = POKEMON.length - listState.found.size;
    $('#stat-correct').textContent = listState.found.size;
    $('#stat-wrong').textContent = 0;
    $('#stat-pending').textContent = POKEMON.length - listState.found.size;
    $('#stat-skipped').textContent = 0;
  }

  function showListFeedback(correct, text) {
    const f = $('#list-feedback');
    f.className = `feedback ${correct ? 'correct' : 'wrong'}`;
    $('#list-feedback-text').textContent = text;
    f.classList.remove('hidden');
  }

  function finishListQuiz() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.completed = [];
    POKEMON.forEach(p => {
      state.completed.push({ ...p, correct: listState.found.has(p.id) });
    });
    state.correctCount = listState.found.size;
    state.wrongCount = POKEMON.length - listState.found.size;
    showResults();
  }

  function giveUpListQuiz() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    // Populate state.completed for results
    state.completed = [];
    POKEMON.forEach(p => {
      if (listState.found.has(p.id)) {
        state.completed.push({ ...p, correct: true });
      } else {
        state.completed.push({ ...p, correct: false });
        const el = document.querySelector(`.list-pokemon-item[data-id="${p.id}"]`);
        if (el) {
          el.classList.add('wrong-reveal');
          el.querySelector('.list-pokemon-name').textContent = p.name;
          el.querySelector('.list-pokemon-name').style.color = 'var(--wrong)';
          el.querySelector('.list-pokemon-sprite-placeholder').classList.add('hidden');
          el.querySelector('.list-pokemon-img').classList.remove('hidden');
        }
      }
    });
    $('#list-input').disabled = true;
    state.correctCount = listState.found.size;
    state.wrongCount = POKEMON.length - listState.found.size;
    showResults();
  }

  // ===== FINISH =====
  function finishQuiz() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    // Mark all skipped as yellow in sprite grid
    state.completed.forEach(p => {
      if (p.skipped) {
        const el = document.querySelector(`.sprite-grid-item[data-id="${p.id}"]`);
        if (el) {
          el.classList.add('done', 'skipped');
        }
      }
    });
    wrongForReview = state.completed.filter(p => !p.correct && !p.skipped);
    showResults();
  }

  // ===== REVIEW QUIZ =====
  function startReview(wrongPokemon) {
    wrongForReview = [];
    reviewState = {
      queue: shuffle([...wrongPokemon]),
      currentPokemon: null,
      hintsUsed: 0,
      correctCount: 0,
      startTime: Date.now(),
      timerInterval: null
    };

    // Hide quiz screens, show review
    $('#screen-quiz-single').classList.add('hidden');
    $('#screen-quiz-list').classList.add('hidden');

    const reviewScreen = $('#screen-review');
    reviewScreen.classList.remove('hidden');
    reviewScreen.classList.add('active');

    // Update review stats
    updateReviewStats();
    showNextReviewPokemon();
  }

  function showNextReviewPokemon() {
    if (reviewState.queue.length === 0) {
      finishReview();
      return;
    }

    reviewState.currentPokemon = reviewState.queue.shift();
    reviewState.hintsUsed = 0;

    const container = $('#review-card');
    container.innerHTML = `
      <div class="pokemon-number">#${reviewState.currentPokemon.id}</div>
      <div class="sprite-container">
        <img src="${reviewState.currentPokemon.sprite}" alt="${reviewState.currentPokemon.id}" id="review-sprite">
      </div>
      <input type="text" id="review-input" class="input-answer" placeholder="Escribe el nombre..." autocomplete="off" autofocus>
      <div id="review-feedback" class="feedback hidden">
        <span id="review-feedback-text"></span>
      </div>
      <div id="review-hint" class="review-hint hidden"></div>
      <div class="action-buttons">
        <button id="btn-review-hint" class="btn btn-skip">💡 Pista (${3 - reviewState.hintsUsed})</button>
        <button id="btn-review-skip" class="btn btn-skip">Skip →</button>
        <button id="btn-review-dont-know" class="btn btn-danger">No sé</button>
      </div>
    `;

    // Setup review input
    const input = $('#review-input');
    input.addEventListener('input', onReviewInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onReviewInput();
      }
    });

    // Setup review buttons
    $('#btn-review-hint').addEventListener('click', showReviewHint);
    $('#btn-review-skip').addEventListener('click', skipReviewPokemon);
    $('#btn-review-dont-know').addEventListener('click', dontKnowReviewPokemon);

    input.focus();
    updateReviewStats();
  }

  function onReviewInput() {
    const input = $('#review-input');
    const val = input.value.trim().toLowerCase();
    if (!val || !reviewState.currentPokemon) return;

    if (nameMatches(val, reviewState.currentPokemon)) {
      input.disabled = true;
      input.classList.add('correct');
      reviewState.correctCount++;

      const feedback = $('#review-feedback');
      feedback.className = 'feedback correct';
      $('#review-feedback-text').textContent = `¡Correcto! ${reviewState.currentPokemon.name}`;
      feedback.classList.remove('hidden');

      setTimeout(() => showNextReviewPokemon(), 600);
    }
  }

  function showReviewHint() {
    if (!reviewState.currentPokemon || reviewState.hintsUsed >= 3) return;

    const name = reviewState.currentPokemon.name.toLowerCase();
    reviewState.hintsUsed++;

    let hintText = '';
    for (let i = 0; i < reviewState.hintsUsed; i++) {
      hintText += name[i] || ' ';
    }

    const hintEl = $('#review-hint');
    hintEl.className = 'review-hint';
    hintEl.textContent = `Pista: ${hintText}`;

    // Update hint button
    const btn = $('#btn-review-hint');
    btn.textContent = `💡 Pista (${3 - reviewState.hintsUsed})`;
    if (reviewState.hintsUsed >= 3) {
      btn.disabled = true;
    }

    // Focus back on input
    $('#review-input').focus();
  }

  function skipReviewPokemon() {
    if (!reviewState.currentPokemon) return;
    reviewState.queue.push(reviewState.currentPokemon);
    showNextReviewPokemon();
  }

  function dontKnowReviewPokemon() {
    if (!reviewState.currentPokemon) return;
    const input = $('#review-input');
    input.value = reviewState.currentPokemon.name;
    input.disabled = true;
    input.classList.add('wrong');

    const feedback = $('#review-feedback');
    feedback.className = 'feedback wrong';
    $('#review-feedback-text').textContent = `Era: ${reviewState.currentPokemon.name}`;
    feedback.classList.remove('hidden');

    setTimeout(() => showNextReviewPokemon(), 1200);
  }

  function updateReviewStats() {
    const total = reviewState.correctCount + reviewState.queue.length + (reviewState.currentPokemon ? 1 : 0);
    const remaining = reviewState.queue.length + (reviewState.currentPokemon ? 1 : 0);
    $('#review-title').textContent = `Repaso - Quedan ${remaining}`;
  }

  function finishReview() {
    const reviewScreen = $('#screen-review');
    reviewScreen.classList.add('hidden');
    reviewScreen.classList.remove('active');
    showResults();
  }

  // ===== RESULTS =====
  function showResults() {
    const time = getElapsed();
    const total = POKEMON.length;
    const correct = state.correctCount;
    const percent = Math.round((correct / total) * 100);

    $('#result-correct').textContent = `${correct}/${total}`;
    $('#result-percent').textContent = `(${percent}%)`;
    $('#result-wrong').textContent = state.wrongCount;
    $('#result-time').textContent = time;

    const wrongSection = $('#wrong-list-section');
    const wrongList = $('#wrong-list');
    const wrongPokemon = state.completed.filter(p => !p.correct && !p.skipped);

    // Show review button if there are wrong pokemon (not in list mode)
    const btnReview = $('#btn-review');
    if (wrongPokemon.length > 0 && state.mode !== 'list') {
      btnReview.classList.remove('hidden');
    } else {
      btnReview.classList.add('hidden');
    }

    if (wrongPokemon.length > 0) {
      wrongList.innerHTML = wrongPokemon.map(p => `
        <div class="wrong-item">
          <img src="${p.sprite}" alt="${p.name}">
          <div class="wrong-item-info">
            <span class="wrong-item-number">#${p.id}</span>
            <span class="wrong-item-name">${p.name}</span>
          </div>
        </div>
      `).join('');
      wrongSection.classList.remove('hidden');
    } else {
      wrongSection.classList.add('hidden');
    }

    saveRecord(correct, state.wrongCount);
    showScreen('results');
  }

  // ===== HISTORY (local + global KV) =====
  let rankingTab = 'all';

  const MODE_LABELS = { all: 'Global', ordered: 'Ordenado', random: 'Random', list: 'Lista' };

  function getPlayerName() {
    const pi = $('#input-player');
    const v = (pi ? pi.value : localStorage.getItem('pokemon-quiz-player') || '').trim().slice(0, 20);
    return v || 'Anonimo';
  }

  async function sendAttempt(correct, wrong) {
    const total = POKEMON.length;
    const percent = Math.round((correct / total) * 100);
    try {
      await fetch('/api/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: getPlayerName(),
          mode: state.mode,
          correct, wrong, total, percent,
          time: getElapsed()
        })
      });
    } catch (e) {
      console.warn('No se pudo guardar en ranking global', e);
    }
    loadGlobalRanking();
    loadResultsRanking();
  }

  async function fetchRankingHtml(mode) {
    const url = mode && mode !== 'all' ? `/api/scores?limit=50&mode=${mode}` : '/api/scores?limit=50';
    const r = await fetch(url);
    const data = await r.json();
    if (!data.attempts || data.attempts.length === 0) {
      return '<div class="history-row">Sin intentos todavia. Se el primero!</div>';
    }
    return data.attempts.slice(0, 20).map(a => {
      const d = a.date ? new Date(a.date).toLocaleDateString('es-ES') : '';
      const modeBadge = (!mode || mode === 'all') ? ` <span class="global-mode">${escapeHtml(a.mode)} ${d}</span>` : ` <span class="global-mode">${d}</span>`;
      return `<div class="history-row global-row">` +
        `<span class="global-name">${escapeHtml(a.name)}${modeBadge}</span>` +
        `<span class="global-score">${a.correct}/${a.total} (${a.percent}%)</span>` +
        `<span class="global-time">${escapeHtml(a.time)}</span>` +
        `</div>`;
    }).join('');
  }

  async function loadGlobalRanking() {
    const list = $('#global-list');
    if (list) list.innerHTML = '<div class="history-row">Cargando ranking...</div>';
    try {
      const html = await fetchRankingHtml(rankingTab);
      if (list) list.innerHTML = html;
    } catch (e) {
      if (list) list.innerHTML = '<div class="history-row">Ranking no disponible (KV sin configurar o sin conexion).</div>';
    }
  }

  async function loadResultsRanking() {
    const resultsList = $('#global-results-list');
    const title = $('#global-results-title');
    const mode = state.mode || 'all';
    if (title) title.textContent = `🌍 Ranking — ${MODE_LABELS[mode] || mode}`;
    if (resultsList) resultsList.innerHTML = '<div class="history-row">Cargando ranking...</div>';
    try {
      const html = await fetchRankingHtml(mode);
      if (resultsList) resultsList.innerHTML = html;
    } catch (e) {
      if (resultsList) resultsList.innerHTML = '<div class="history-row">Ranking no disponible (KV sin configurar o sin conexion).</div>';
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function saveRecord(correct, wrong) {
    const h = JSON.parse(localStorage.getItem('pokemon-quiz-history') || '[]');
    h.unshift({
      date: new Date().toLocaleDateString('es-ES'),
      mode: state.mode,
      time: getElapsed(),
      correct, wrong,
      total: POKEMON.length
    });
    if (h.length > 10) h.length = 10;
    localStorage.setItem('pokemon-quiz-history', JSON.stringify(h));
    loadHistory();
    sendAttempt(correct, wrong);
  }

  function loadHistory() {
    const h = JSON.parse(localStorage.getItem('pokemon-quiz-history') || '[]');
    const sec = $('#history-section');
    const list = $('#history-list');
    if (h.length === 0) { sec.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    list.innerHTML = h.map(r => `
      <div class="history-row">
        <span>${r.date}</span>
        <span class="history-mode">${r.mode}</span>
        <span>${r.time}</span>
        <span class="${r.correct > r.wrong ? 'history-good' : 'history-bad'}">${r.correct}/${r.total}</span>
      </div>
    `).join('');
  }

  // ===== EVENT LISTENERS =====
  function setupEventListeners() {
    $('#btn-start').addEventListener('click', startQuiz);
    $('#btn-back').addEventListener('click', () => {
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (reviewState.timerInterval) clearInterval(reviewState.timerInterval);
      showScreen('start');
      $('#screen-review').classList.add('hidden');
      $('#screen-review').classList.remove('active');
    });

    document.addEventListener('keydown', (e) => {
      if (screens.start.classList.contains('active') && e.key === 'Enter' && document.activeElement !== $('#input-player')) startQuiz();
    });

    // Single mode input
    const input = $('#input-answer');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.answered) showNextPokemon();
        else onInput();
      }
    });

    $('#btn-skip').addEventListener('click', skipPokemon);
    $('#btn-dont-know').addEventListener('click', dontKnow);

    // List mode input
    const listInput = $('#list-input');
    listInput.addEventListener('input', onListInput);
    listInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onListInput();
      }
    });
    $('#btn-list-giveup').addEventListener('click', giveUpListQuiz);

    // Review back button
    $('#btn-back-review').addEventListener('click', () => {
      $('#screen-review').classList.add('hidden');
      $('#screen-review').classList.remove('active');
      showScreen('start');
    });

    // Results
    $('#btn-retry').addEventListener('click', startQuiz);
    $('#btn-review').addEventListener('click', () => {
      if (wrongForReview.length > 0) {
        startReview(wrongForReview);
      }
    });
    $('#btn-home').addEventListener('click', () => {
      showScreen('start');
      $('#screen-review').classList.add('hidden');
    });
    $('#btn-view-wrong').addEventListener('click', () => {
      $('#wrong-list-section').classList.toggle('hidden');
    });
  }

  init();
})();
