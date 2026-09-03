const github = require("./github");

const CONTENT_PATH = "data/content.json";

const DEFAULT_CONTENT = {
  home: {
    title: "Имя Фамилия",
    greeting:
      "Добро пожаловать на мой сайт. Здесь собраны мои картины, награды и выставки.",
    photo: null,
    about: "",
  },
  gallery: [], // { id, title, year, event, description, imageThumb, imageFull }
  awards: [], // { id, title, year, description, image }
  exhibitions: [], // { id, title, year, place, description }
  process: [], // { id, title, imageThumb, imageFull } — фото рукоделия
};

let cache = null; // { data, sha }
let loadPromise = null; // чтобы не запускать загрузку с GitHub параллельно дважды

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
  const data = JSON.parse(file.content);
  migrateLegacyFields(data);
  cache = { data, sha: file.sha };
  return cache.data;
}

// Гарантирует, что данные загружены, независимо от того, как именно
// запущен сервер. На обычном хостинге (Render) данные загружаются один раз
// при старте, до того как сервер начинает принимать запросы — и тогда
// ensureLoaded() ничего заново не делает, просто сразу возвращает готовые
// данные. Но на serverless-платформах вроде Vercel нет гарантии, что
// "старт сервера" и "первый запрос" разделены по времени — запрос может
// прийти прямо во время самой первой загрузки. ensureLoaded() перед
// каждым запросом на всякий случай убеждается, что данные точно готовы,
// и при этом не запускает повторную загрузку, если она уже идёт или уже
// завершилась.
function ensureLoaded() {
  if (cache) return Promise.resolve(cache.data);
  if (!loadPromise) loadPromise = load();
  return loadPromise;
}

// Картины, добавленные до обновления кода, хранят фото в одном поле
// "image". Новый код показывает отдельно уменьшенную и качественную
// версии — если их ещё нет, временно используем старое фото для обеих,
// чтобы оно не пропадало с сайта. При следующем редактировании картины
// появятся уже настоящие уменьшенная и качественная версии.
function migrateLegacyFields(data) {
  (data.gallery || []).forEach((item) => {
    if (item.image && !item.imageThumb && !item.imageFull) {
      item.imageThumb = item.image;
      item.imageFull = item.image;
    }
    if (item.event === undefined) item.event = "";
  });
  if (data.home && data.home.about === undefined) data.home.about = "";
  if (!data.process) data.process = [];
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

module.exports = { load, ensureLoaded, get, save, nextId, DEFAULT_CONTENT };
