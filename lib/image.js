const sharp = require("sharp");

// Уменьшает и сжимает фото для быстрой загрузки на страницах со списками.
// fit: "inside" сохраняет исходные пропорции картины — обрезка в квадрат
// портит композицию у вертикальных и горизонтальных работ.
async function makeThumb(buffer) {
  return sharp(buffer)
    .rotate() // учитывает поворот с камеры телефона (EXIF)
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

// Более качественная и крупная версия — для страницы с описанием картины.
async function makeFull(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

// Одна средняя по размеру версия — для фото, у которых нет отдельной
// крупной карточки (фото художницы на главной, фото к награде).
async function makeMedium(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

module.exports = { makeThumb, makeFull, makeMedium };
