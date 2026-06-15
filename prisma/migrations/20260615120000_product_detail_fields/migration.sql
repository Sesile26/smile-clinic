-- Сторінка товару: розгорнутий опис (longDescription) + галерея фото (images).
-- Адитивно: наявні рядки отримують images = [] та longDescription = NULL.
ALTER TABLE "Product" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "longDescription" TEXT;
