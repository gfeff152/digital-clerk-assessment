(function (root) {
  'use strict';

  function initialState() {
    return { index: 0, answers: [], mistakes: [] };
  }

  function validQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return false;
    for (var index = 0; index < questions.length; index += 1) {
      var question = questions[index];
      if (!question || !Array.isArray(question.options) || question.options.length === 0 ||
        !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) return false;
    }
    return true;
  }

  function validMistake(mistake, questions, index) {
    return mistake && Number.isInteger(mistake.question) && mistake.question >= 0 &&
      mistake.question <= index && mistake.question < questions.length &&
      Number.isInteger(mistake.option) && mistake.option >= 0 &&
      mistake.option < questions[mistake.question].options.length &&
      mistake.option !== questions[mistake.question].answer;
  }

  function restoreState(saved, questions) {
    var restored = initialState();
    if (!validQuestions(questions) || !saved || typeof saved !== 'object' || Array.isArray(saved) ||
      !Number.isInteger(saved.index) || saved.index < 0 || saved.index > questions.length ||
      !Array.isArray(saved.answers)) return restored;

    // A stored index never unlocks a question without the complete correct prefix.
    // Conversely, answers beyond the stored current question are not reachable.
    var limit = Math.min(questions.length, saved.index + 1);
    for (var index = 0; index < limit; index += 1) {
      if (saved.answers[index] !== questions[index].answer) break;
      restored.answers.push(saved.answers[index]);
    }
    restored.index = Math.min(saved.index, restored.answers.length);

    if (Array.isArray(saved.mistakes)) {
      var seen = new Set();
      saved.mistakes.forEach(function (mistake) {
        if (!validMistake(mistake, questions, restored.index)) return;
        var key = mistake.question + ':' + mistake.option;
        if (seen.has(key)) return;
        seen.add(key);
        restored.mistakes.push({ question: mistake.question, option: mistake.option });
      });
    }
    return restored;
  }

  function validState(state, questions) {
    if (!validQuestions(questions) || !state || typeof state !== 'object' ||
      !Number.isInteger(state.index) || state.index < 0 || state.index > questions.length ||
      !Array.isArray(state.answers) || !Array.isArray(state.mistakes)) return false;
    var length = state.answers.length;
    if (length > questions.length ||
      (state.index === questions.length ? length !== questions.length : length !== state.index && length !== state.index + 1)) return false;
    for (var index = 0; index < length; index += 1) {
      if (state.answers[index] !== questions[index].answer) return false;
    }
    var seen = new Set();
    for (var item = 0; item < state.mistakes.length; item += 1) {
      var mistake = state.mistakes[item];
      if (!validMistake(mistake, questions, state.index)) return false;
      var key = mistake.question + ':' + mistake.option;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }

  function choose(state, questions, option, expectedIndex) {
    if (expectedIndex === undefined) expectedIndex = state && state.index;
    if (!validState(state, questions) || expectedIndex !== state.index ||
      state.index === questions.length || state.answers.length > state.index ||
      !Number.isInteger(option) || option < 0 || option >= questions[state.index].options.length) {
      return { state: state, result: 'ignored' };
    }
    var question = questions[state.index];
    if (option !== question.answer) {
      var exists = state.mistakes.some(function (mistake) {
        return mistake.question === state.index && mistake.option === option;
      });
      return {
        state: exists ? state : {
          index: state.index,
          answers: state.answers.slice(),
          mistakes: state.mistakes.concat({ question: state.index, option: option })
        },
        result: 'wrong'
      };
    }
    return {
      state: { index: state.index, answers: state.answers.concat(option), mistakes: state.mistakes.slice() },
      result: 'correct'
    };
  }

  function next(state, questions, expectedIndex) {
    if (expectedIndex === undefined) expectedIndex = state && state.index;
    if (!validState(state, questions) || expectedIndex !== state.index ||
      state.index >= questions.length || state.answers.length !== state.index + 1) return state;
    return { index: state.index + 1, answers: state.answers.slice(), mistakes: state.mistakes.slice() };
  }

  root.QuizCore = Object.freeze({
    initialState: initialState,
    restoreState: restoreState,
    choose: choose,
    next: next
  });
})(globalThis);
