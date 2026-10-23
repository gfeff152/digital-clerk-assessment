(() => {
  'use strict';
  const quiz = globalThis.QuizData;
  const core = globalThis.QuizCore;
  const $ = id => document.getElementById(id);
  const letters = ['A', 'B', 'C', 'D'];
  const total = quiz.questions.length;
  // A changed question bank uses a separate progress record.
  const storageKey = `${quiz.id}:${JSON.stringify(quiz.questions.map(q => [q.question, q.options, q.answer]))}`;
  let state = core.initialState();
  let storageAvailable = true;
  let lastOption = null;
  let restartOrigin = null;
  let copyRequest = 0;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) state = core.restoreState(JSON.parse(saved), quiz.questions);
  } catch { state = core.initialState(); }

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; }
    catch { storageAvailable = false; }
    $('storage-status').textContent = storageAvailable ? '進度會儲存在此瀏覽器' : '無法儲存，關閉頁面後進度不保留';
  }

  function updateProgress() {
    const completed = state.answers.length;
    $('completed-count').textContent = completed;
    $('total-caption').textContent = ` / ${total}`;
    $('progress').setAttribute('aria-valuemax', total);
    $('progress').setAttribute('aria-valuenow', completed);
    $('progress').setAttribute('aria-valuetext', `已答對 ${completed} 題，共 ${total} 題`);
    $('progress-fill').style.width = `${completed / total * 100}%`;
    $('steps').replaceChildren(...quiz.questions.map((_, index) => {
      const item = document.createElement('li');
      const done = index < completed;
      const current = index === state.index;
      item.className = `step${done ? ' done' : current ? ' current' : ''}`;
      item.textContent = done ? '✓' : String(index + 1).padStart(2, '0');
      item.setAttribute('aria-label', `第 ${index + 1} 題，${done ? '已答對' : current ? '作答中' : '尚未解鎖'}`);
      if (current) item.setAttribute('aria-current', 'step');
      return item;
    }));
    $('progress-tip').textContent = state.index === total ? '十題全數通過，學習達成。' : '答對一題，解鎖下一步。';
  }

  function focusHeading(element) {
    element.focus({ preventScroll: true });
    if (matchMedia('(max-width:760px)').matches) element.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function makeOption(question, option, questionIndex, solved, wrongOptions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'option';
    const wrong = wrongOptions.includes(option);
    const correct = solved && question.answer === option;
    button.classList.toggle('wrong', wrong);
    button.classList.toggle('correct', correct);
    button.classList.toggle('solved', solved);
    button.disabled = solved;
    button.setAttribute('aria-label', `${letters[option]}. ${question.options[option]}${wrong ? '，錯誤選項' : correct ? '，正確答案' : ''}`);
    const letter = document.createElement('span');
    letter.className = 'option-letter'; letter.textContent = letters[option];
    const label = document.createElement('span');
    label.className = 'option-text'; label.textContent = question.options[option];
    button.append(letter, label);
    if (wrong || correct) {
      const status = document.createElement('span');
      status.className = 'option-state';
      const symbol = document.createElement('span');
      symbol.textContent = correct ? '✓' : '×'; symbol.setAttribute('aria-hidden', 'true');
      status.append(symbol, document.createTextNode(correct ? '答對了' : '錯誤選項'));
      button.append(status);
    }
    button.addEventListener('click', () => {
      const result = core.choose(state, quiz.questions, option, questionIndex);
      if (result.result === 'ignored') return;
      state = result.state;
      lastOption = option;
      render();
      // Keep keyboard focus on the chosen option until the learner advances.
      // Focusing "next" here would let a held Enter key unexpectedly advance.
      if (result.result === 'wrong') $('options').children[option].focus({ preventScroll: true });
      else $('question-title').focus({ preventScroll: true });
    });
    return button;
  }

  function render(focus = false) {
    persist();
    updateProgress();
    const finished = state.index === total;
    $('question-view').hidden = finished;
    $('completion-view').hidden = !finished;
    if (finished) {
      $('completion-title').replaceChildren(document.createTextNode('恭喜你完成'), document.createElement('br'), document.createTextNode(`第 ${quiz.number} 張評量！`));
      $('password').textContent = quiz.password;
      $('completion-count').textContent = `${total} / ${total}`;
      $('copy-status').textContent = '';
      if (focus) focusHeading($('completion-title'));
      return;
    }
    const index = state.index;
    const question = quiz.questions[index];
    const solved = state.answers.length === index + 1;
    const wrongOptions = state.mistakes.filter(x => x.question === index).map(x => x.option);
    $('question-counter').textContent = `QUESTION ${String(index + 1).padStart(2, '0')} / ${total}`;
    $('question-title').textContent = question.question;
    $('options').replaceChildren(...question.options.map((_, option) => makeOption(question, option, index, solved, wrongOptions)));
    const feedback = $('feedback');
    feedback.hidden = !solved && wrongOptions.length === 0;
    feedback.className = `feedback ${solved ? 'correct' : 'wrong'}`;
    feedback.replaceChildren();
    if (!feedback.hidden) {
      const title = document.createElement('strong');
      const selected = lastOption ?? wrongOptions.at(-1);
      title.textContent = solved ? '✓ 答對了！這一題已通過。' : `${letters[selected]} 是錯誤選項，請再試一次。`;
      const detail = document.createElement('p');
      detail.textContent = solved ? question.explanation : `提示：${question.hint}`;
      feedback.append(title, detail);
    }
    $('next').disabled = !solved;
    $('next').dataset.question = String(index);
    $('next-label').textContent = index === total - 1 ? '查看通關密碼' : '下一題';
    $('next-status').textContent = solved ? (index === total - 1 ? '十題全對，可以領取通關密碼了。' : '這一題通過了，繼續前進！') : '這一題答對後，就能繼續。';
    if (focus) focusHeading($('question-title'));
  }

  $('course-title').textContent = quiz.title;
  $('chapter').textContent = `第 ${quiz.number} 單元`;
  $('assessment-label').textContent = `第 ${quiz.number} 單元評量`;
  document.title = `第 ${quiz.number} 單元評量｜王牌店員學習站`;
  $('next').addEventListener('click', event => {
    const updated = core.next(state, quiz.questions, Number(event.currentTarget.dataset.question));
    if (updated === state) return;
    state = updated; lastOption = null; render(true);
  });

  function openRestart(event) {
    restartOrigin = event.currentTarget;
    $('restart-dialog').returnValue = '';
    $('restart-dialog').showModal();
  }
  $('restart').addEventListener('click', openRestart);
  $('practice-again').addEventListener('click', openRestart);
  $('restart-dialog').addEventListener('close', () => {
    if ($('restart-dialog').returnValue === 'restart') {
      copyRequest++;
      state = core.initialState(); lastOption = null;
      $('copy-status').textContent = '';
      render(true);
    } else restartOrigin?.focus({ preventScroll: true });
  });

  $('copy-password').addEventListener('click', async () => {
    if (state.index !== total) return;
    const request = ++copyRequest;
    try {
      await navigator.clipboard.writeText(quiz.password);
      if (request === copyRequest && state.index === total) $('copy-status').textContent = '密碼已複製。';
    } catch {
      if (request === copyRequest && state.index === total) $('copy-status').textContent = '無法自動複製，請選取上方密碼手動複製。';
    }
  });
  render();
})();
