require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const github = require("./lib/github");
const store = require("./lib/store");
const image = require("./lib/image");

const app = express();
// Ограничение размера на один файл — с запасом для фото с телефона.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
// Для массовой загрузки — до 10 картин за раз, чтобы не перегрузить память
// бесплатного сервера.
const uploadMany = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

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

app.get("/gallery/:id", (req, res) => {
  const item = content().gallery.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).render("not-found");
  res.render("artwork", { item });
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

// Помогает сохранить бинарный файл в GitHub под сгенерированным именем.
async function saveToRepo(buffer, folder, suffix, ext) {
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${suffix}${ext}`;
  const repoPath = `data/images/${folder}/${filename}`;
  await github.putBinaryFile({
    path: repoPath,
    buffer,
    message: `Загрузка изображения ${filename}`,
  });
  return repoPath;
}

// Одна оптимизированная версия — для фото художницы и фото к награде.
async function uploadOptimizedImage(file, folder) {
  const buffer = await image.makeMedium(file.buffer);
  return saveToRepo(buffer, folder, "", ".jpg");
}

// Две версии — маленькая (для списков, грузится быстро) и качественная
// (открывается при клике на картину).
async function uploadGalleryImage(file, folder) {
  const [thumbBuffer, fullBuffer] = await Promise.all([
    image.makeThumb(file.buffer),
    image.makeFull(file.buffer),
  ]);
  const [imageThumb, imageFull] = await Promise.all([
    saveToRepo(thumbBuffer, folder, "-thumb", ".jpg"),
    saveToRepo(fullBuffer, folder, "-full", ".jpg"),
  ]);
  return { imageThumb, imageFull };
}

// Превращает имя файла в аккуратное название картины по умолчанию,
// когда художница добавляет сразу много картин без ввода названий.
function titleFromFilename(originalname) {
  const base = path.basename(originalname || "картина", path.extname(originalname || ""));
  return base.replace(/[_-]+/g, " ").trim() || "Без названия";
}

// ----- Главная страница -----

app.post("/admin/home", requireAuth, upload.single("photo"), async (req, res, next) => {
  try {
    const data = content();
    data.home.title = req.body.title || "";
    data.home.greeting = req.body.greeting || "";
    if (req.file) {
      data.home.photo = await uploadOptimizedImage(req.file, "home");
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
      event: req.body.event || "",
      description: req.body.description || "",
      imageThumb: null,
      imageFull: null,
    };
    if (req.file) {
      const { imageThumb, imageFull } = await uploadGalleryImage(req.file, "gallery");
      item.imageThumb = imageThumb;
      item.imageFull = imageFull;
    }
    data.gallery.push(item);
    await store.save(`Добавлена картина: ${item.title}`);
    res.redirect("/admin?saved=gallery");
  } catch (err) {
    next(err);
  }
});

// Быстрое добавление сразу нескольких картин: одна фотография — одна
// новая запись в галерее с названием по имени файла. Год, описание и
// конкурс можно дозаполнить позже через «Изменить».
app.post("/admin/gallery/bulk-add", requireAuth, uploadMany.array("images", 10), async (req, res, next) => {
  try {
    const data = content();
    const files = req.files || [];
    for (const file of files) {
      const { imageThumb, imageFull } = await uploadGalleryImage(file, "gallery");
      data.gallery.push({
        id: store.nextId(data.gallery),
        title: titleFromFilename(file.originalname),
        year: null,
        event: "",
        description: "",
        imageThumb,
        imageFull,
      });
    }
    if (files.length > 0) {
      await store.save(`Добавлено картин: ${files.length}`);
    }
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
    item.event = req.body.event || "";
    item.description = req.body.description || "";
    if (req.file) {
      const { imageThumb, imageFull } = await uploadGalleryImage(req.file, "gallery");
      item.imageThumb = imageThumb;
      item.imageFull = imageFull;
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

app.post("/admin/awards/add", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const data = content();
    const item = {
      id: store.nextId(data.awards),
      title: req.body.title || "",
      year: req.body.year ? Number(req.body.year) : null,
      description: req.body.description || "",
      image: null,
    };
    if (req.file) {
      item.image = await uploadOptimizedImage(req.file, "awards");
    }
    data.awards.push(item);
    await store.save("Добавлена награда");
    res.redirect("/admin?saved=awards");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/awards/edit/:id", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    const data = content();
    const item = data.awards.find((i) => i.id === Number(req.params.id));
    if (item) {
      item.title = req.body.title || "";
      item.year = req.body.year ? Number(req.body.year) : null;
      item.description = req.body.description || "";
      if (req.file) {
        item.image = await uploadOptimizedImage(req.file, "awards");
      }
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
