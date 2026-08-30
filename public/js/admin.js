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
        bar.style.width = "100%";
        if (xhr.responseURL) {
          window.location.href = xhr.responseURL;
        } else {
          window.location.reload();
        }
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
})();
