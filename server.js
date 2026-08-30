require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const github = require("./lib/github");
const store = require("./lib/store");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

// Признак входа в админку хранится не в памяти сервера, а в подписанной
// куке в браузере. Так вход не слетает, если Render перезапустит сайт
// после "засыпания" на бесплатном тарифе.
app.use(
  cookieSession({
    name: "session",
    secret: process.env.SESSION_SECRET || "измени-меня",
    maxAge: 1000 * 60 * 60 * 12, // 12 часов
  })
);

// Данные сайта грузятся из GitHub один раз при старте и живут в памяти.
// Любое сохранение из админки сразу обновляет и память, и GitHub —
// сайт не нужно перезапускать, чтобы увидеть изменения.
function content() {
  return store.get();
}

app.use((req, res, next) => {
  res.locals.rawUrl = github.rawUrl;
  res.locals.siteTitle = content().home.title || "Портфолио";
  next();
});

// ---------- Публичные страницы ----------

app.get("/", (req, res) => {
  res.render("index", { home: content().home });
});

app.get("/gallery", (req, res) => {
  const items = [...content().gallery].sort((a, b) => (b.year || 0) - (a.year || 0));
  res.render("gallery", { items });
});

app.get("/awards", (req, res) => {
  const items = [...content().awards].sort((a, b) => (b.year || 0) - (a.year || 0));
  res.render("awards", { items });
});

app.get("/exhibitions", (req, res) => {
  const items = [...content().exhibitions].sort((a, b) => (b.year || 0) - (a.year || 0));
  res.render("exhibitions", { items });
});

// ---------- Вход в админку ----------

function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  res.redirect("/admin/login");
}

app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.ADMIN_PASSWORD) {
    req.session.authed = true;
    return res.redirect("/admin");
  }
  res.render("admin/login", { error: "Неверный пароль. Попробуйте ещё раз." });
});

app.post("/admin/logout", (req, res) => {
  req.session = null;
  res.redirect("/admin/login");
});

// ---------- Админка ----------

app.get("/admin", requireAuth, (req, res) => {
  res.render("admin/dashboard", {
    home: content().home,
    gallery: [...content().gallery].sort((a, b) => (b.year || 0) - (a.year || 0)),
    awards: [...content().awards].sort((a, b) => (b.year || 0) - (a.year || 0)),
    exhibitions: [...content().exhibitions].sort((a, b) => (b.year || 0) - (a.year || 0)),
    saved: req.query.saved || null,
  });
});

// Помогает превратить загруженный файл в имя + путь + сохранить в GitHub.
async function uploadImageFile(file, folder) {
  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${safeExt}`;
  const repoPath = `data/images/${folder}/${filename}`;
  await github.putBinaryFile({
    path: repoPath,
    buffer: file.buffer,
    message: `Загрузка изображения ${filename}`,
  });
  return repoPath;
}

// ----- Главная страница -----

app.post("/admin/home", requireAuth, upload.single("photo"), async (req, res, next) => {
  try {
    const data = content();
    data.home.title = req.body.title || "";
    data.home.greeting = req.body.greeting || "";
    if (req.file) {
      data.home.photo = await uploadImageFile(req.file, "home");
    }
    await store.save("Обновление главной страницы");
    res.redirect("/admin?saved=home");
  } catch (err) {
    next(err);
  }
});

// ----- Галерея -----

app.post("/admin/gallery/add", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const data = content();
    const item = {
      id: store.nextId(data.gallery),
      title: req.body.title || "",
      year: req.body.year ? Number(req.body.year) : null,
      description: req.body.description || "",
      image: null,
    };
    if (req.file) {
      item.image = await uploadImageFile(req.file, "gallery");
    }
    data.gallery.push(item);
    await store.save(`Добавлена картина: ${item.title}`);
    res.redirect("/admin?saved=gallery");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/gallery/edit/:id", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const data = content();
    const item = data.gallery.find((i) => i.id === Number(req.params.id));
    if (!item) return res.redirect("/admin?saved=notfound");
    item.title = req.body.title || "";
    item.year = req.body.year ? Number(req.body.year) : null;
    item.description = req.body.description || "";
    if (req.file) {
      item.image = await uploadImageFile(req.file, "gallery");
    }
    await store.save(`Изменена картина: ${item.title}`);
    res.redirect("/admin?saved=gallery");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/gallery/delete/:id", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    const idx = data.gallery.findIndex((i) => i.id === Number(req.params.id));
    if (idx !== -1) {
      data.gallery.splice(idx, 1);
      await store.save("Удалена картина");
    }
    res.redirect("/admin?saved=gallery");
  } catch (err) {
    next(err);
  }
});

// ----- Награды -----

app.post("/admin/awards/add", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    data.awards.push({
      id: store.nextId(data.awards),
      title: req.body.title || "",
      year: req.body.year ? Number(req.body.year) : null,
      description: req.body.description || "",
    });
    await store.save("Добавлена награда");
    res.redirect("/admin?saved=awards");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/awards/edit/:id", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    const item = data.awards.find((i) => i.id === Number(req.params.id));
    if (item) {
      item.title = req.body.title || "";
      item.year = req.body.year ? Number(req.body.year) : null;
      item.description = req.body.description || "";
      await store.save("Изменена награда");
    }
    res.redirect("/admin?saved=awards");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/awards/delete/:id", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    const idx = data.awards.findIndex((i) => i.id === Number(req.params.id));
    if (idx !== -1) {
      data.awards.splice(idx, 1);
      await store.save("Удалена награда");
    }
    res.redirect("/admin?saved=awards");
  } catch (err) {
    next(err);
  }
});

// ----- Выставки -----

app.post("/admin/exhibitions/add", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    data.exhibitions.push({
      id: store.nextId(data.exhibitions),
      title: req.body.title || "",
      year: req.body.year ? Number(req.body.year) : null,
      place: req.body.place || "",
      description: req.body.description || "",
    });
    await store.save("Добавлена выставка");
    res.redirect("/admin?saved=exhibitions");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/exhibitions/edit/:id", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    const item = data.exhibitions.find((i) => i.id === Number(req.params.id));
    if (item) {
      item.title = req.body.title || "";
      item.year = req.body.year ? Number(req.body.year) : null;
      item.place = req.body.place || "";
      item.description = req.body.description || "";
      await store.save("Изменена выставка");
    }
    res.redirect("/admin?saved=exhibitions");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/exhibitions/delete/:id", requireAuth, async (req, res, next) => {
  try {
    const data = content();
    const idx = data.exhibitions.findIndex((i) => i.id === Number(req.params.id));
    if (idx !== -1) {
      data.exhibitions.splice(idx, 1);
      await store.save("Удалена выставка");
    }
    res.redirect("/admin?saved=exhibitions");
  } catch (err) {
    next(err);
  }
});

// Обработчик ошибок — чтобы вместо "белого экрана" была понятная страница.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(
    `<div style="font-family:sans-serif;max-width:600px;margin:60px auto;padding:24px;">
      <h2>Что-то пошло не так</h2>
      <p>${err.message}</p>
      <p><a href="javascript:history.back()">Назад</a></p>
    </div>`
  );
});

const PORT = process.env.PORT || 3000;

store
  .load()
  .then(() => {
    app.listen(PORT, () => console.log(`Сайт запущен на порту ${PORT}`));
  })
  .catch((err) => {
    console.error("Не удалось загрузить данные из GitHub при старте:", err);
    process.exit(1);
  });
