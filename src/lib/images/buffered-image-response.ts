/** Full body + Content-Length so the response is not an open-ended chunked stream. */
export function bufferedImageResponse(body: Uint8Array, contentType: string, cacheControl: string): Response {
  const bytes = new Uint8Array(body);
  return new Response(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
