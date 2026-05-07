const data = window.TRAINER_DATA;

const state = {
  mode: "training",
  quiz: null,
  timerId: null,
};

const el = {
  stats: document.getElementById("stats"),
  tabs: document.querySelectorAll(".tab"),
  trainingSetup: document.getElementById("training-setup"),
  examSetup: document.getElementById("exam-setup"),
  dictionarySetup: document.getElementById("dictionary-setup"),
  setupPanel: document.getElementById("setup-panel"),
  quizPanel: document.getElementById("quiz-panel"),
  resultPanel: document.getElementById("result-panel"),
  quizLabel: document.getElementById("quiz-label"),
  quizTitle: document.getElementById("quiz-title"),
  question: document.getElementById("question"),
  answerForm: document.getElementById("answer-form"),
  answerInputWrap: document.getElementById("answer-input-wrap"),
  submitBtn: document.getElementById("submit-btn"),
  feedback: document.getElementById("feedback"),
  correctAnswer: document.getElementById("correct-answer"),
  nextBtn: document.getElementById("next-btn"),
  stopBtn: document.getElementById("stop-btn"),
  progress: document.getElementById("progress"),
  score: document.getElementById("score"),
  timer: document.getElementById("timer"),
};

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sample(list, count) {
  return shuffle(list).slice(0, Math.min(count, list.length));
}

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[“”"'`´]/g, "")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[–—-]/g, " ")
    .replace(/[^\p{L}\p{N}\s/]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const bigrams = (str) => {
    const clean = ` ${str} `;
    const result = new Map();
    for (let i = 0; i < clean.length - 1; i += 1) {
      const pair = clean.slice(i, i + 2);
      result.set(pair, (result.get(pair) || 0) + 1);
    }
    return result;
  };

  const aSet = bigrams(a);
  const bSet = bigrams(b);
  let intersection = 0;

  aSet.forEach((count, pair) => {
    intersection += Math.min(count, bSet.get(pair) || 0);
  });

  const total = [...aSet.values()].reduce((s, n) => s + n, 0) + [...bSet.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * intersection) / total;
}

function expectedVariants(text) {
  const variants = new Set();
  const full = normalize(text);
  if (full) variants.add(full);

  const noParen = normalize((text || "").replace(/\([^)]*\)/g, " "));
  if (noParen) variants.add(noParen);

  const splitPieces = (text || "")
    .split(/;|\/|\bor\b|\u2014|\u2013/i)
    .map((x) => normalize(x))
    .filter((x) => x.length > 2);

  splitPieces.forEach((part) => {
    variants.add(part);
    const partsByComma = part.split(",").map((x) => x.trim()).filter((x) => x.length > 2);
    partsByComma.forEach((piece) => variants.add(piece));
  });

  return [...variants];
}

function isTextCorrect(user, expected) {
  const userN = normalize(user);
  if (!userN) return false;

  const variants = expectedVariants(expected);

  if (variants.some((v) => userN === v)) return true;

  const best = variants.reduce((max, variant) => Math.max(max, diceSimilarity(userN, variant)), 0);
  return best >= 0.92;
}

function renderStats() {
  el.stats.innerHTML = `
    <div class="stat"><strong>${data.translation.length}</strong><span>Терминов на перевод</span></div>
    <div class="stat"><strong>${data.abbreviations.length}</strong><span>Аббревиатур</span></div>
    <div class="stat"><strong>${data.definitions.length}</strong><span>Терминов с определениями</span></div>
  `;
}

function renderTrainingSetup() {
  el.trainingSetup.innerHTML = `
    <div class="setup-grid">
      <div class="field">
        <label for="section">Раздел</label>
        <select id="section">
          <option value="translation">Перевод терминов</option>
          <option value="abbreviations">Аббревиатуры</option>
          <option value="definitions">Термины и определения</option>
        </select>
      </div>

      <div class="field">
        <label for="count">Количество вопросов</label>
        <input type="number" id="count" min="5" max="50" value="20" />
      </div>

      <div class="field" id="translation-direction-wrap">
        <label for="translation-direction">Направление перевода</label>
        <select id="translation-direction">
          <option value="ru-en">Русский → English</option>
          <option value="en-ru">English → Русский</option>
        </select>
      </div>

      <div class="field hidden" id="definitions-direction-wrap">
        <label for="definitions-direction">Режим определений</label>
        <select id="definitions-direction">
          <option value="term-definition">Термин → выбрать определение</option>
          <option value="definition-term">Определение → выбрать термин</option>
        </select>
      </div>
    </div>

    <p class="note">Проверка в заданиях с вводом текста терпима к регистру, лишним пробелам и части синонимов.</p>
    <button class="btn primary" id="start-training">Начать тренировку</button>
  `;

  const section = document.getElementById("section");
  const translationWrap = document.getElementById("translation-direction-wrap");
  const definitionsWrap = document.getElementById("definitions-direction-wrap");

  function updateVisibility() {
    translationWrap.classList.toggle("hidden", section.value !== "translation");
    definitionsWrap.classList.toggle("hidden", section.value !== "definitions");
  }

  section.addEventListener("change", updateVisibility);
  updateVisibility();

  document.getElementById("start-training").addEventListener("click", () => {
    const count = Number(document.getElementById("count").value || 20);
    const translationDirection = document.getElementById("translation-direction").value;
    const definitionsDirection = document.getElementById("definitions-direction").value;
    const config = {
      type: "training",
      section: section.value,
      count,
      translationDirection,
      definitionsDirection,
    };
    startQuiz(config);
  });
}

function renderExamSetup() {
  el.examSetup.innerHTML = `
    <p class="note">Формат приближен к КМ2: 25 переводов (RU→EN), 10 расшифровок аббревиатур, 6 терминов на определения.</p>
    <div class="setup-grid">
      <div class="result-card"><strong>25</strong>Перевод терминов</div>
      <div class="result-card"><strong>10</strong>Аббревиатуры</div>
      <div class="result-card"><strong>6</strong>Определения</div>
    </div>
    <p class="note">В блоке определений используются варианты ответа (multiple choice), чтобы тренироваться быстрее и объективнее.</p>
    <button class="btn primary" id="start-exam">Запустить пробный КМ2</button>
  `;

  document.getElementById("start-exam").addEventListener("click", () => {
    startQuiz({ type: "exam" });
  });
}

function dictionaryItemsByType(type) {
  if (type === "translation") {
    return data.translation.map((item) => ({
      title: item.en,
      value: item.ru,
      section: "Перевод",
    }));
  }

  if (type === "abbreviations") {
    return data.abbreviations.map((item) => ({
      title: item.abbr,
      value: item.expansion,
      section: "Аббревиатуры",
    }));
  }

  return data.definitions.map((item) => ({
    title: item.term,
    value: item.definition,
    section: "Определения",
  }));
}

function renderDictionaryRows(type, query) {
  const normalizedQuery = normalize(query || "");
  const list = dictionaryItemsByType(type).filter((item) => {
    if (!normalizedQuery) return true;
    return normalize(`${item.title} ${item.value}`).includes(normalizedQuery);
  });

  const rows = list
    .map(
      (item, idx) => `
      <div class="dict-row">
        <div class="dict-index">${idx + 1}</div>
        <div class="dict-content">
          <p class="dict-title">${item.title}</p>
          <p class="dict-value">${item.value}</p>
        </div>
      </div>
    `
    )
    .join("");

  const totalNode = document.getElementById("dict-total");
  const rowsNode = document.getElementById("dict-rows");
  if (totalNode) totalNode.textContent = `Найдено: ${list.length}`;
  if (rowsNode) {
    rowsNode.innerHTML = rows || `<p class="note">Ничего не найдено, попробуй другой запрос.</p>`;
  }
}

function renderDictionarySetup() {
  el.dictionarySetup.innerHTML = `
    <div class="setup-grid">
      <div class="field">
        <label for="dict-type">Раздел словаря</label>
        <select id="dict-type">
          <option value="translation">Перевод: English ↔ Русский</option>
          <option value="abbreviations">Аббревиатуры</option>
          <option value="definitions">Термины и определения</option>
        </select>
      </div>
      <div class="field">
        <label for="dict-search">Поиск</label>
        <input id="dict-search" type="text" placeholder="Например: firewall, backup, RAM" />
      </div>
    </div>
    <p class="note" id="dict-total"></p>
    <div class="dict-list" id="dict-rows"></div>
  `;

  const typeNode = document.getElementById("dict-type");
  const searchNode = document.getElementById("dict-search");

  function refreshDictionary() {
    renderDictionaryRows(typeNode.value, searchNode.value);
  }

  typeNode.addEventListener("change", refreshDictionary);
  searchNode.addEventListener("input", refreshDictionary);
  refreshDictionary();
}

function makeMcqOptions(correctValue, allValues) {
  const wrong = sample(
    allValues.filter((item) => item !== correctValue),
    3
  );
  return shuffle([correctValue, ...wrong]);
}

function buildTranslationQuestions(count, direction, label) {
  return sample(data.translation, count).map((item) => {
    const prompt = direction === "ru-en" ? item.ru : item.en;
    const expected = direction === "ru-en" ? item.en : item.ru;
    return {
      mode: "text",
      section: "translation",
      label,
      title: direction === "ru-en" ? "Переведи на английский" : "Переведи на русский",
      prompt,
      expected,
    };
  });
}

function buildAbbreviationQuestions(count, label) {
  return sample(data.abbreviations, count).map((item) => ({
    mode: "text",
    section: "abbreviations",
    label,
    title: "Расшифруй аббревиатуру",
    prompt: item.abbr,
    expected: item.expansion,
  }));
}

function buildDefinitionQuestions(count, direction, label) {
  const picked = sample(data.definitions, count);
  if (direction === "definition-term") {
    const termPool = data.definitions.map((d) => d.term);
    return picked.map((item) => ({
      mode: "mcq",
      section: "definitions",
      label,
      title: "Выбери термин по определению",
      prompt: item.definition,
      options: makeMcqOptions(item.term, termPool),
      correct: item.term,
    }));
  }

  const defPool = data.definitions.map((d) => d.definition);
  return picked.map((item) => ({
    mode: "mcq",
    section: "definitions",
    label,
    title: "Выбери определение термина",
    prompt: item.term,
    options: makeMcqOptions(item.definition, defPool),
    correct: item.definition,
  }));
}

function buildQuestions(config) {
  if (config.type === "exam") {
    const block1 = buildTranslationQuestions(25, "ru-en", "Блок 1/3: Перевод");
    const block2 = buildAbbreviationQuestions(10, "Блок 2/3: Аббревиатуры");
    const block3 = buildDefinitionQuestions(6, "term-definition", "Блок 3/3: Определения");
    return [...block1, ...block2, ...block3];
  }

  if (config.section === "translation") {
    return buildTranslationQuestions(config.count, config.translationDirection, "Тренировка: Перевод");
  }

  if (config.section === "abbreviations") {
    return buildAbbreviationQuestions(config.count, "Тренировка: Аббревиатуры");
  }

  return buildDefinitionQuestions(config.count, config.definitionsDirection, "Тренировка: Определения");
}

function startTimer() {
  stopTimer();
  state.timerId = setInterval(() => {
    if (!state.quiz) return;
    const elapsed = Math.floor((Date.now() - state.quiz.startedAt) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const s = String(elapsed % 60).padStart(2, "0");
    el.timer.textContent = `Время: ${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function startQuiz(config) {
  const questions = buildQuestions(config);
  state.quiz = {
    config,
    questions,
    index: 0,
    correct: 0,
    startedAt: Date.now(),
    answeredCurrent: false,
    bySection: {
      translation: { total: 0, correct: 0 },
      abbreviations: { total: 0, correct: 0 },
      definitions: { total: 0, correct: 0 },
    },
  };

  questions.forEach((q) => {
    state.quiz.bySection[q.section].total += 1;
  });

  el.setupPanel.classList.add("hidden");
  el.resultPanel.classList.add("hidden");
  el.quizPanel.classList.remove("hidden");

  startTimer();
  renderQuestion();
}

function renderQuestion() {
  const { questions, index, correct, answeredCurrent } = state.quiz;
  const question = questions[index];

  el.quizLabel.textContent = question.label;
  el.quizTitle.textContent = question.title;
  el.progress.textContent = `Вопрос: ${index + 1}/${questions.length}`;
  el.score.textContent = `Верно: ${correct}`;

  el.question.textContent = question.prompt;
  el.feedback.className = "feedback hidden";
  el.feedback.textContent = "";
  el.correctAnswer.className = "correct-answer hidden";
  el.correctAnswer.textContent = "";
  el.nextBtn.disabled = !answeredCurrent;

  if (question.mode === "text") {
    el.answerInputWrap.innerHTML = `<input id="user-text-answer" type="text" autocomplete="off" placeholder="Введи ответ" />`;
    setTimeout(() => {
      const input = document.getElementById("user-text-answer");
      if (input) input.focus();
    }, 0);
  } else {
    const name = `option-${index}`;
    const optionsHtml = question.options
      .map(
        (option, idx) => `
          <label class="option">
            <input type="radio" name="${name}" value="${encodeURIComponent(option)}" />
            <span>${String.fromCharCode(65 + idx)}. ${option}</span>
          </label>
        `
      )
      .join("");

    el.answerInputWrap.innerHTML = `<div class="options">${optionsHtml}</div>`;
  }

  el.submitBtn.disabled = answeredCurrent;
}

function showFeedback(isCorrect, text) {
  el.feedback.classList.remove("hidden", "ok", "bad");
  el.feedback.classList.add(isCorrect ? "ok" : "bad");
  el.feedback.innerHTML = text;
}

function submitAnswer(event) {
  event.preventDefault();
  if (!state.quiz || state.quiz.answeredCurrent) return;

  const q = state.quiz.questions[state.quiz.index];
  let userAnswer = "";

  if (q.mode === "text") {
    const input = document.getElementById("user-text-answer");
    userAnswer = input ? input.value.trim() : "";
  } else {
    const selected = el.answerInputWrap.querySelector("input[type='radio']:checked");
    userAnswer = selected ? decodeURIComponent(selected.value) : "";
  }

  if (!userAnswer) {
    showFeedback(false, "Выбери или введи ответ, потом проверь.");
    return;
  }

  const ok = q.mode === "text" ? isTextCorrect(userAnswer, q.expected) : userAnswer === q.correct;

  if (ok) {
    state.quiz.correct += 1;
    state.quiz.bySection[q.section].correct += 1;
  }

  state.quiz.answeredCurrent = true;

  const rightAnswer = q.mode === "text" ? q.expected : q.correct;
  const feedbackText = ok
    ? `Верно. <br><strong>Ответ:</strong> ${rightAnswer}`
    : `Неверно. <br><strong>Твой ответ:</strong> ${userAnswer}<br><strong>Правильный:</strong> ${rightAnswer}`;

  showFeedback(ok, feedbackText);
  if (!ok && state.quiz.config.type === "training") {
    el.correctAnswer.classList.remove("hidden");
    el.correctAnswer.innerHTML = `<strong>Правильный вариант:</strong> ${rightAnswer}`;
  }
  el.submitBtn.disabled = true;
  el.nextBtn.disabled = false;
  el.score.textContent = `Верно: ${state.quiz.correct}`;
}

function nextQuestion() {
  if (!state.quiz) return;

  if (state.quiz.index >= state.quiz.questions.length - 1) {
    finishQuiz();
    return;
  }

  state.quiz.index += 1;
  state.quiz.answeredCurrent = false;
  renderQuestion();
}

function finishQuiz() {
  if (!state.quiz) return;

  stopTimer();

  const total = state.quiz.questions.length;
  const correct = state.quiz.correct;
  const percent = Math.round((correct / total) * 100);
  const elapsedSec = Math.floor((Date.now() - state.quiz.startedAt) / 1000);
  const m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const s = String(elapsedSec % 60).padStart(2, "0");

  const by = state.quiz.bySection;

  el.quizPanel.classList.add("hidden");
  el.resultPanel.classList.remove("hidden");
  el.setupPanel.classList.remove("hidden");

  el.resultPanel.innerHTML = `
    <p class="eyebrow">Результат</p>
    <h2>${state.quiz.config.type === "exam" ? "Пробный КМ2 завершен" : "Тренировка завершена"}</h2>
    <div class="result-grid">
      <div class="result-card"><strong>${correct}/${total}</strong>Правильных ответов</div>
      <div class="result-card"><strong>${percent}%</strong>Точность</div>
      <div class="result-card"><strong>${m}:${s}</strong>Время</div>
    </div>
    <div class="result-grid">
      <div class="result-card"><strong>${by.translation.correct}/${by.translation.total}</strong>Перевод</div>
      <div class="result-card"><strong>${by.abbreviations.correct}/${by.abbreviations.total}</strong>Аббревиатуры</div>
      <div class="result-card"><strong>${by.definitions.correct}/${by.definitions.total}</strong>Определения</div>
    </div>
    <p class="note">Рекомендация: доведи точность до 85%+ в пробном КМ2 и повтори слабый блок отдельно в режиме «Тренировка».</p>
    <button class="btn primary" id="restart-btn">Запустить еще раз</button>
  `;

  document.getElementById("restart-btn").addEventListener("click", () => {
    el.resultPanel.classList.add("hidden");
    if (state.mode === "training") {
      el.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === "training"));
      el.trainingSetup.classList.remove("hidden");
      el.examSetup.classList.add("hidden");
    }
  });

  state.quiz = null;
}

function stopQuiz() {
  if (!state.quiz) return;
  finishQuiz();
}

function switchMode(mode) {
  state.mode = mode;
  el.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  el.trainingSetup.classList.toggle("hidden", mode !== "training");
  el.examSetup.classList.toggle("hidden", mode !== "exam");
  el.dictionarySetup.classList.toggle("hidden", mode !== "dictionary");
  el.resultPanel.classList.add("hidden");
}

function init() {
  renderStats();
  renderTrainingSetup();
  renderExamSetup();
  renderDictionarySetup();

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
  });

  el.answerForm.addEventListener("submit", submitAnswer);
  el.nextBtn.addEventListener("click", nextQuestion);
  el.stopBtn.addEventListener("click", stopQuiz);

  switchMode("training");
}

init();
