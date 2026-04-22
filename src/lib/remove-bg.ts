"use client";

let removeBgModule: typeof import("@imgly/background-removal") | null = null;
let loading = false;

export async function removeBackground(imageDataUrl: string): Promise<string> {
  // Lazy load the module
  if (!removeBgModule && !loading) {
    loading = true;
    removeBgModule = await import("@imgly/background-removal");
    loading = false;
  }

  // Wait if another call is loading the module
  while (loading) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!removeBgModule) throw new Error("Failed to load background removal module");

  // Convert data URL to blob
  const res = await fetch(imageDataUrl);
  const inputBlob = await res.blob();

  // Run in a non-blocking way by yielding to the browser between steps
  // The library uses ONNX Runtime Web which runs on WebGL/WASM,
  // so it shouldn't fully block but the initial model load can be heavy
  const resultBlob = await removeBgModule.removeBackground(inputBlob, {
    output: {
      format: "image/png",
    },
  });

  // Convert back to data URL
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(resultBlob);
  });
}
