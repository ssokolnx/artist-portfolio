// Все данные и фотографии сайта хранятся прямо в GitHub-репозитории.
// Это избавляет от необходимости в отдельной базе данных или платном
// постоянном диске на Render — сайт всегда "помнит" всё, что в нём
// когда-либо сохранили, даже после перезапуска или редеплоя.

const API = "https://api.github.com";

function config() {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error(
      "Не заданы переменные окружения GITHUB_OWNER, GITHUB_REPO или GITHUB_TOKEN"
    );
  }
  return { owner, repo, branch, token };
}

function headers() {
  const { token } = config();
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Ссылка на картинку, которую видит браузер посетителя. Раньше это была
// прямая ссылка на raw.githubusercontent.com — но с мая 2026 года именно
// этот адрес GitHub стал нестабильно работать для посетителей из России
// (при этом сам api.github.com работает нормально). Поэтому теперь
// картинки отдаёт наш собственный сервер под своим адресом — он сам
// сходит за байтами на GitHub через api.github.com и отдаст их дальше.
// Российский посетитель сайта при этом вообще не обращается к серверам
// GitHub напрямую.
function rawUrl(path) {
  return "/img/" + path.replace(/^data\/images\//, "");
}

// Получить содержимое файла (и его sha, нужен для последующего обновления).
async function getFile(path) {
  const { owner, repo, branch } = config();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURI(
    path
  )}?ref=${branch}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub API ошибка при чтении ${path}: ${res.status}`);
  }
  const json = await res.json();
  const content = Buffer.from(json.content, "base64").toString("utf-8");
  return { content, sha: json.sha };
}

// Получить бинарное содержимое файла (фотографию) как есть, без
// перекодирования в текст — используется прокси-адресом /img/....
async function getBinaryFile(path) {
  const { owner, repo, branch } = config();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURI(
    path
  )}?ref=${branch}`;
  const res = await fetch(url, { headers: headers() });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub API ошибка при чтении ${path}: ${res.status}`);
  }
  const json = await res.json();
  return Buffer.from(json.content, "base64");
}

// Создать или обновить текстовый файл (например, content.json).
async function putFile({ path, content, message, sha }) {
  const { owner, repo, branch } = config();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURI(path)}`;
  const body = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ошибка при записи ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// Загрузить бинарный файл (картину/фото). buffer — Buffer с данными файла.
async function putBinaryFile({ path, buffer, message }) {
  const { owner, repo, branch } = config();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURI(path)}`;
  const body = {
    message,
    content: buffer.toString("base64"),
    branch,
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ошибка при загрузке ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// Удалить файл (например, при удалении картины из галереи).
async function deleteFile({ path, message, sha }) {
  const { owner, repo, branch } = config();
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURI(path)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch }),
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GitHub API ошибка при удалении ${path}: ${res.status} ${text}`);
  }
}

module.exports = { getFile, getBinaryFile, putFile, putBinaryFile, deleteFile, rawUrl };
