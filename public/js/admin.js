(function () {
  var overlay = document.getElementById("save-overlay");
  var bar = document.getElementById("save-overlay-bar");
  var label = document.getElementById("save-overlay-label");
  if (!overlay) return;

  function showOverlay(text) {
    bar.style.width = "0%";
    label.textContent = text;
    overlay.classList.add("is-visible");
  }

  function hideOverlay() {
    overlay.classList.remove("is-visible");
  }

  document.querySelectorAll(".admin-main form.card-form, .admin-main form.inline-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
        return;
      }

      var hasFile = form.querySelector('input[type="file"]');
      showOverlay(hasFile ? "Загрузка…" : "Сохранение…");

      var xhr = new XMLHttpRequest();
      xhr.open(form.method || "POST", form.action);

      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable) {
          var pct = Math.round((ev.loaded / ev.total) * 100);
          bar.style.width = pct + "%";
          label.textContent = (hasFile ? "Загрузка… " : "Сохранение… ") + pct + "%";
        }
      };

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 400) {
          bar.style.width = "100%";
          if (xhr.responseURL) {
            window.location.href = xhr.responseURL;
          } else {
            window.location.reload();
          }
          return;
        }

        hideOverlay();
        var text = (xhr.responseText || "")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        var message = text || ("Сервер вернул ошибку " + xhr.status + ".");
        window.alert("Не удалось сохранить.\n" + message);
      };

      xhr.onerror = function () {
        hideOverlay();
        window.alert("Не удалось сохранить. Проверьте соединение и попробуйте снова.");
      };

      var formData = new FormData(form);
      if (hasFile) {
        // Форма с файлом — сервер ждёт multipart/form-data (обрабатывается multer).
        xhr.send(formData);
      } else {
        // Форма без файла — сервер разбирает тело как application/x-www-form-urlencoded.
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        xhr.send(new URLSearchParams(formData).toString());
      }
    });
  });

  // ---- Звезда «Избранное»: переключается на месте, без перезагрузки
  // страницы. Раньше это была обычная форма — после отправки браузер
  // заново загружал всю страницу с нуля, и из-за сброса прокрутки
  // казалось, что админку выкинуло на первую вкладку. Теперь клик просто
  // меняет вид кнопки и тихо отправляет запрос в фоне. ----
  document.querySelectorAll(".tile__star-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector(".tile__star");
      if (!btn) return;
      var willBeFeatured = btn.classList.contains("tile__star--off");

      btn.classList.toggle("tile__star--off");
      btn.textContent = willBeFeatured ? "★" : "☆";
      btn.setAttribute("aria-label", willBeFeatured ? "Убрать из избранного" : "Добавить в избранное");

      fetch(form.action, { method: "POST" }).catch(function () {
        // Не получилось сохранить — возвращаем кнопку как было.
        btn.classList.toggle("tile__star--off");
        btn.textContent = willBeFeatured ? "☆" : "★";
        btn.setAttribute("aria-label", willBeFeatured ? "Добавить в избранное" : "Убрать из избранного");
        window.alert("Не удалось сохранить. Проверьте соединение и попробуйте снова.");
      });
    });
  });

  // ---- Модальные окна редактирования картины/фото: закрываются кликом
  // по затемнённому фону, крестиком или клавишей Esc. Пока окно открыто —
  // страница за ним не прокручивается. ----
  document.querySelectorAll(".tile > details").forEach(function (details) {
    var panel = details.querySelector(".tile__panel");
    if (!panel) return;

    details.addEventListener("toggle", function () {
      document.body.classList.toggle(
        "modal-open",
        Array.prototype.some.call(document.querySelectorAll(".tile > details"), function (d) {
          return d.open;
        })
      );
    });

    panel.addEventListener("click", function (e) {
      if (e.target === panel) details.open = false;
    });

    var closeBtn = panel.querySelector(".tile__panel-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        details.open = false;
      });
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".tile > details[open]").forEach(function (d) {
        d.open = false;
      });
    }
  });
})();
