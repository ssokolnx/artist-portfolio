(function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll(".carousel").forEach(function (carousel) {
    var track = carousel.querySelector(".carousel__track");
    if (!track) return;

    // В разметке (index.ejs) список отрисован тремя наборами подряд.
    // Ширина одного набора — треть общей ширины ленты. Прокрутка стартует
    // с начала среднего набора: слева и справа остаётся целый набор про
    // запас, поэтому крутить можно и вперёд, и назад — а когда человек
    // подходит близко к любому краю, лента незаметно "перепрыгивает" на
    // ту же позицию в соседнем наборе (наборы одинаковые, поэтому прыжок
    // не видно).
    var setWidth = 0;

    function measure() {
      setWidth = track.scrollWidth / 3;
    }
    measure();
    carousel.scrollLeft = setWidth;

    window.addEventListener("resize", function () {
      var offsetInSet = setWidth > 0 ? carousel.scrollLeft - setWidth : 0;
      measure();
      carousel.scrollLeft = setWidth + offsetInSet;
    });

    function keepInBounds() {
      if (setWidth <= 0) return;
      if (carousel.scrollLeft < setWidth * 0.5) {
        carousel.scrollLeft += setWidth;
      } else if (carousel.scrollLeft > setWidth * 1.5) {
        carousel.scrollLeft -= setWidth;
      }
    }

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
      keepInBounds();
    }

    // Прикосновение, клик или прокрутка колесом мыши — сразу останавливают
    // автопрокрутку и отдают управление человеку, в любую сторону.
    ["pointerdown", "wheel"].forEach(function (evt) {
      carousel.addEventListener(evt, pause, { passive: true });
    });
    carousel.addEventListener("mouseenter", pause);
    ["pointerup", "pointercancel", "mouseleave"].forEach(function (evt) {
      carousel.addEventListener(evt, scheduleResume, { passive: true });
    });

    if (reduceMotion || setWidth <= carousel.clientWidth) return;

    var speed = 0.45; // пикселей за кадр — неторопливый темп
    function tick() {
      if (!paused) {
        carousel.scrollLeft += speed;
        keepInBounds();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
