const github = require("./github");

const CONTENT_PATH = "data/content.json";

const DEFAULT_CONTENT = {
  home: {
    title: "Имя Фамилия",
    greeting:
      "Добро пожаловать на мой сайт. Здесь собраны мои картины, награды и выставки.",
    photo: null,
  },
  gallery: [], // { id, title, year, event, description, imageThumb, imageFull }
  awards: [], // { id, title, year, description, image }
  exhibitions: [], // { id, title, year, place, description }
};

let cache = null; // { data, sha }

function nextId(list) {
  const max = list.reduce((m, item) => Math.max(m, item.id || 0), 0);
  return max + 1;
}

// Загружает content.json из GitHub. Если файла ещё нет — создаёт его
// с содержимым по умолчанию.
async function load() {
  const file = await github.getFile(CONTENT_PATH);
  if (!file) {
    const created = await github.putFile({
      path: CONTENT_PATH,
      content: JSON.stringify(DEFAULT_CONTENT, null, 2),
      message: "Создание начального содержимого сайта",
    });
    cache = { data: DEFAULT_CONTENT, sha: created.content.sha };
    return cache.data;
  }
  cache = { data: JSON.parse(file.content), sha: file.sha };
  return cache.data;
}

function get() {
  if (!cache) {
    throw new Error("Хранилище ещё не загружено — вызовите load() при старте сервера");
  }
  return cache.data;
}

// Сохраняет текущее состояние cache.data обратно в GitHub одним коммитом.
async function save(message) {
  const result = await github.putFile({
    path: CONTENT_PATH,
    content: JSON.stringify(cache.data, null, 2),
    message,
    sha: cache.sha,
  });
  cache.sha = result.content.sha;
}

module.exports = { load, get, save, nextId, DEFAULT_CONTENT };
