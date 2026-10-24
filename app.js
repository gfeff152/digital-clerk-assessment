(() => {
  'use strict';
  const catalog = globalThis.QuizCatalog;
  const core = globalThis.QuizCore;
  const $ = id => document.getElementById(id);
  const letters = ['A', 'B', 'C', 'D'];
  const chapterNames = ['第一張評量', '第二章評量', '第三章評量', '第四章評量'];
  const states = new Map();
  let quiz = null;
  let state = core.initialState();
  let lastOption = null;
  let session = 0;
  let copyRequest = 0;
  let restartTarget = null;

  const isReady = chapter => !chapter.pending && chapter.questions.length === 10;
  // Preserve the original key of chapter one for existing learners.
  const keyFor = chapter => `${chapter.id}:${JSON.stringify(chapter.questions.map(q => [q.question, q.options, q.answer]))}`;
  function stateFor(chapter) {
    if (states.has(chapter.id)) return states.get(chapter.id);
    let restored = core.initialState();
    try { restored = core.restoreState(JSON.parse(localStorage.getItem(keyFor(chapter))), chapter.questions); }
    catch { /* Invalid or unavailable storage starts this chapter safely. */ }
    states.set(chapter.id, restored);
    return restored;
  }
  function persist() {
    if (!quiz || !isReady(quiz)) return;
    states.set(quiz.id, state);
    let saved = true;
    try { localStorage.setItem(keyFor(quiz), JSON.stringify(state)); }
    catch { saved = false; }
    $('storage-status').textContent = saved ? '本章進度會儲存在此瀏覽器' : '無法儲存，關閉頁面後進度不保留';
  }
  function focusHeading(element) {
    element.focus({ preventScroll: true });
    if (matchMedia('(max-width:760px)').matches) element.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function goHome() { location.hash = 'chapters'; }

  function renderPicker(focus) {
    document.title = '章節評量｜王牌店員學習站';
    $('available-count').textContent = `${catalog.filter(isReady).length} 章已開放 / 共 ${catalog.length} 章`;
    $('chapter-cards').replaceChildren(...catalog.map(chapter => {
      const button = document.createElement('button');
      const ready = isReady(chapter);
      const progress = ready ? stateFor(chapter) : null;
      const completed = progress?.answers.length ?? 0;
      button.type = 'button';
      button.className = `chapter-card${ready ? '' : ' chapter-pending'}${ready && progress.index === 10 ? ' chapter-complete' : ''}`;
      button.setAttribute('aria-label', chapterNames[chapter.number - 1]);
      const top = document.createElement('span'); top.className = 'chapter-card-top';
      const number = document.createElement('span'); number.className = 'chapter-number'; number.textContent = String(chapter.number).padStart(2, '0');
      const badge = document.createElement('span'); badge.className = 'chapter-badge'; badge.textContent = ready ? '10 題 · 已開放' : '題目待提供';
      top.append(number, badge);
      const label = document.createElement('strong'); label.className = 'chapter-label'; label.textContent = chapterNames[chapter.number - 1];
      const title = document.createElement('span'); title.className = 'chapter-topic'; title.textContent = ready ? chapter.title : '本章題目將於提供後開放';
      const bottom = document.createElement('span'); bottom.className = 'chapter-card-bottom';
      const status = document.createElement('span');
      status.textContent = !ready ? '敬請期待' : progress.index === 10 ? '✓ 已完成本章' : completed ? `已答對 ${completed} / 10 題` : '尚未開始';
      const action = document.createElement('span'); action.className = 'chapter-card-action';
      action.textContent = !ready ? '查看狀態 →' : progress.index === 10 ? '查看完成頁 →' : completed || progress.mistakes.length ? '繼續評量 →' : '開始評量 →';
      bottom.append(status, action);
      button.append(top, label, title, bottom);
      button.addEventListener('click', () => { location.hash = `chapter-${chapter.number}`; });
      return button;
    }));
    if (focus) focusHeading($('picker-title'));
  }

  function updateProgress() {
    const total = quiz.questions.length;
    const count = state.answers.length;
    $('completed-count').textContent = count;
    $('total-caption').textContent = ` / ${total}`;
    $('progress').setAttribute('aria-valuemax', total);
    $('progress').setAttribute('aria-valuenow', count);
    $('progress').setAttribute('aria-valuetext', `本章已答對 ${count} 題，共 ${total} 題`);
    $('progress-fill').style.width = `${count / total * 100}%`;
    $('steps').replaceChildren(...quiz.questions.map((_, index) => {
      const item = document.createElement('li');
      const done = index < count;
      const current = index === state.index;
      item.className = `step${done ? ' done' : current ? ' current' : ''}`;
      item.textContent = done ? '✓' : String(index + 1).padStart(2, '0');
      item.setAttribute('aria-label', `第 ${index + 1} 題，${done ? '已答對' : current ? '作答中' : '尚未解鎖'}`);
      if (current) item.setAttribute('aria-current', 'step');
      return item;
    }));
    $('progress-tip').textContent = state.index === total ? '本章十題全數通過，學習達成。' : '答對一題，解鎖下一步。';
  }

  function makeOption(question, option, solved, wrongOptions) {
    const expectedIndex = state.index;
    const expectedSession = session;
    const expectedChapter = quiz.id;
    const button = document.createElement('button');
    const wrong = wrongOptions.includes(option);
    const correct = solved && question.answer === option;
    button.type = 'button';
    button.className = `option${wrong ? ' wrong' : ''}${correct ? ' correct' : ''}${solved ? ' solved' : ''}`;
    button.disabled = solved;
    button.setAttribute('aria-label', `${letters[option]}. ${question.options[option]}${wrong ? '，錯誤選項' : correct ? '，正確答案' : ''}`);
    const letter = document.createElement('span'); letter.className = 'option-letter'; letter.textContent = letters[option];
    const label = document.createElement('span'); label.className = 'option-text'; label.textContent = question.options[option];
    button.append(letter, label);
    if (wrong || correct) {
      const status = document.createElement('span'); status.className = 'option-state';
      const symbol = document.createElement('span'); symbol.textContent = correct ? '✓' : '×'; symbol.setAttribute('aria-hidden', 'true');
      status.append(symbol, document.createTextNode(correct ? '答對了' : '錯誤選項')); button.append(status);
    }
    button.addEventListener('click', () => {
      if (!quiz || expectedChapter !== quiz.id || expectedSession !== session) return;
      const result = core.choose(state, quiz.questions, option, expectedIndex);
      if (result.result === 'ignored') return;
      state = result.state; lastOption = option;
      renderAssessment();
      if (result.result === 'wrong') $('options').children[option].focus({ preventScroll: true });
      else $('question-title').focus({ preventScroll: true });
    });
    return button;
  }

  function renderAssessment(focus = false, save = true) {
    const ready = isReady(quiz);
    $('chapter').textContent = `第 ${quiz.number} 章`;
    $('course-title').textContent = quiz.title;
    $('course-tagline').textContent = quiz.tagLine || (quiz.number === 1 ? '即時回覆 · 關鍵字辨識 · 智慧推薦' : '題目待提供 · 敬請期待');
    $('assessment-label').textContent = chapterNames[quiz.number - 1];
    document.title = `${chapterNames[quiz.number - 1]}｜王牌店員學習站`;
    $('chapter-progress').hidden = !ready;
    $('save-info').hidden = !ready;
    $('restart').hidden = !ready;
    $('pending-view').hidden = ready;
    const finished = ready && state.index === quiz.questions.length;
    $('question-view').hidden = !ready || finished;
    $('completion-view').hidden = !finished;
    if (!ready) {
      $('pending-title').textContent = `第 ${quiz.number} 章題目待提供`;
      if (focus) focusHeading($('pending-title'));
      return;
    }
    if (save) persist();
    updateProgress();
    const total = quiz.questions.length;
    if (finished) {
      $('completion-title').replaceChildren(document.createTextNode('恭喜你完成'), document.createElement('br'), document.createTextNode(`第 ${quiz.number} 張評量！`));
      $('password').textContent = quiz.password;
      $('completion-count').textContent = `${total} / ${total}`;
      $('copy-status').textContent = '';
      if (focus) focusHeading($('completion-title'));
      return;
    }
    const question = quiz.questions[state.index];
    const solved = state.answers.length === state.index + 1;
    const wrongOptions = state.mistakes.filter(x => x.question === state.index).map(x => x.option);
    $('question-counter').textContent = `QUESTION ${String(state.index + 1).padStart(2, '0')} / ${total}`;
    $('question-title').textContent = question.question;
    $('options').replaceChildren(...question.options.map((_, option) => makeOption(question, option, solved, wrongOptions)));
    const feedback = $('feedback');
    feedback.hidden = !solved && wrongOptions.length === 0;
    feedback.className = `feedback ${solved ? 'correct' : 'wrong'}`;
    feedback.replaceChildren();
    if (!feedback.hidden) {
      const title = document.createElement('strong');
      const selected = lastOption ?? wrongOptions.at(-1);
      title.textContent = solved ? '✓ 答對了！這一題已通過。' : `${letters[selected]} 是錯誤選項，請再試一次。`;
      const detail = document.createElement('p'); detail.textContent = solved ? question.explanation : `提示：${question.hint}`;
      feedback.append(title, detail);
    }
    $('next').disabled = !solved;
    $('next').dataset.question = String(state.index);
    $('next').dataset.chapter = quiz.id;
    $('next-label').textContent = state.index === total - 1 ? '查看通關密碼' : '下一題';
    $('next-status').textContent = solved ? (state.index === total - 1 ? '本章十題全對，可以領取通關密碼了。' : '這一題通過了，繼續前進！') : '這一題答對後，就能繼續。';
    if (focus) focusHeading($('question-title'));
  }

  function showRoute(focus = true) {
    if ($('restart-dialog').open) { $('restart-dialog').returnValue = ''; $('restart-dialog').close(); }
    session++; copyRequest++; lastOption = null;
    $('password').textContent = ''; $('copy-status').textContent = '';
    const match = /^#chapter-([1-4])$/.exec(location.hash);
    quiz = match ? catalog.find(chapter => chapter.number === Number(match[1])) : null;
    $('chapter-picker').hidden = Boolean(quiz);
    $('assessment-shell').hidden = !quiz;
    $('all-chapters').hidden = !quiz;
    if (!quiz) { renderPicker(focus); return; }
    state = isReady(quiz) ? stateFor(quiz) : core.initialState();
    renderAssessment(focus);
  }

  $('next').addEventListener('click', event => {
    if (!quiz || !isReady(quiz) || event.currentTarget.dataset.chapter !== quiz.id) return;
    const updated = core.next(state, quiz.questions, Number(event.currentTarget.dataset.question));
    if (updated === state) return;
    state = updated; lastOption = null; renderAssessment(true);
  });
  for (const id of ['all-chapters', 'completion-home', 'pending-home']) $(id).addEventListener('click', goHome);
  function openRestart(event) {
    if (!quiz || !isReady(quiz)) return;
    restartTarget = { chapter: quiz.id, session, origin: event.currentTarget };
    $('restart-title').textContent = `要從第 ${quiz.number} 章第一題重新開始嗎？`;
    $('restart-dialog').returnValue = '';
    $('restart-dialog').showModal();
  }
  $('restart').addEventListener('click', openRestart);
  $('practice-again').addEventListener('click', openRestart);
  $('restart-dialog').addEventListener('close', () => {
    const target = restartTarget; restartTarget = null;
    if (!target || !quiz || target.chapter !== quiz.id || target.session !== session) return;
    if ($('restart-dialog').returnValue === 'restart') {
      copyRequest++; state = core.initialState(); lastOption = null;
      renderAssessment(true);
    } else target.origin.focus({ preventScroll: true });
  });
  $('copy-password').addEventListener('click', async () => {
    if (!quiz || !isReady(quiz) || state.index !== quiz.questions.length) return;
    const request = ++copyRequest;
    const chapter = quiz.id;
    const password = quiz.password;
    try {
      await navigator.clipboard.writeText(password);
      if (request === copyRequest && quiz?.id === chapter) $('copy-status').textContent = '密碼已複製。';
    } catch {
      if (request === copyRequest && quiz?.id === chapter) $('copy-status').textContent = '無法自動複製，請選取上方密碼手動複製。';
    }
  });
  addEventListener('storage', event => {
    const affected = catalog.filter(chapter => isReady(chapter) && (event.key === null || event.key === keyFor(chapter)));
    if (!affected.length) return;
    for (const chapter of affected) {
      let synced = core.initialState();
      try { synced = core.restoreState(JSON.parse(event.newValue), chapter.questions); }
      catch { /* A removed or corrupt record resets only its own chapter. */ }
      states.set(chapter.id, synced);
      if (quiz?.id === chapter.id) {
        session++; copyRequest++; lastOption = null; state = synced;
        if ($('restart-dialog').open) { $('restart-dialog').returnValue = ''; $('restart-dialog').close(); }
        // Reading another tab's update must not write it back or restore stale cache.
        renderAssessment(false, false);
        $('storage-status').textContent = '本章進度已從另一個分頁同步';
      }
    }
    if (!quiz) renderPicker(false);
  });
  addEventListener('hashchange', () => showRoute());
  showRoute(false);
})();
