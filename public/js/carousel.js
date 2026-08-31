(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll(".carousel").forEach(function (carousel) {
    var track = carousel.querySelector(".carousel__track");
    if (!track) return;

    // Список внутри уже отрисован дважды (см. index.ejs) — ровно на середине
    // общей ширины начинается точная копия начала, поэтому прыжок туда
    // назад совершенно незаметен и создаёт иллюзию бесконечной ленты.
    var half = track.scrollWidth / 2;
    window.addEventListener("resize", function () {
      half = track.scrollWidth / 2;
    });

    var paused = false;
    var resumeTimer = null;

    function pause() {
      paused = true;
      if (resumeTimer) clearTimeout(resumeTimer);
    }
    function scheduleResume() {
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(function () {
        paused = false;
      }, 1800);
    }

    // Прикосновение, клик или прокрутка колесом мыши — сразу останавливают
    // автопрокрутку и отдают управление человеку. Через паузу после того,
    // как палец/курсор ушли — лента снова едет сама.
    ["pointerdown", "wheel"].forEach(function (evt) {
      carousel.addEventListener(evt, pause, { passive: true });
    });
    carousel.addEventListener("mouseenter", pause);
    ["pointerup", "pointercancel", "mouseleave"].forEach(function (evt) {
      carousel.addEventListener(evt, scheduleResume, { passive: true });
    });

    if (reduceMotion || half <= carousel.clientWidth) return;

    var speed = 0.45; // пикселей за кадр — неторопливый темп
    function tick() {
      if (!paused) {
        carousel.scrollLeft += speed;
        if (carousel.scrollLeft >= half) {
          carousel.scrollLeft -= half;
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
