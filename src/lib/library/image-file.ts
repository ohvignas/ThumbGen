/** Browser only: downscales an image file into a data URL before upload. */

export type ImageImportPreset = { maxSize: number; type: "image/jpeg" | "image/png" };

/** Persona photos and inspiration images (same as the former sidebar). */
export const PHOTO_IMPORT: ImageImportPreset = { maxSize: 1600, type: "image/jpeg" };

/** Manually imported logos keep transparency (same as the former sidebar). */
export const LOGO_IMPORT: ImageImportPreset = { maxSize: 512, type: "image/png" };

export function fileToDataUrl(file: File, preset: ImageImportPreset): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = image;
      if (width > preset.maxSize || height > preset.maxSize) {
        const ratio = Math.min(preset.maxSize / width, preset.maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas indisponible"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(preset.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.8) : canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image illisible"));
    };
    image.src = objectUrl;
  });
}
