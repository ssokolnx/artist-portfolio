(function () {
  var modal = document.getElementById("artwork-modal");
  if (!modal) return;

  var imageEl = modal.querySelector(".modal__image");
  var titleEl = modal.querySelector(".modal__title");
  var yearEl = modal.querySelector(".modal__year");
  var eventEl = modal.querySelector(".modal__event");
  var descEl = modal.querySelector(".modal__desc");
  var closeBtn = modal.querySelector(".modal__close");

  function setField(el, value) {
    if (value) {
      el.textContent = value;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function openModal(card) {
    imageEl.src = card.dataset.image || "";
    imageEl.alt = card.dataset.title || "";
    titleEl.textContent = card.dataset.title || "";
    setField(yearEl, card.dataset.year);
    setField(eventEl, card.dataset.event);
    setField(descEl, card.dataset.description);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    imageEl.src = "";
  }

  document.querySelectorAll("[data-modal-card]").forEach(function (card) {
    card.addEventListener("click", function (e) {
      e.preventDefault();
      openModal(card);
    });
  });

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });
})();
