"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "cn";

type Props = ImgHTMLAttributes<HTMLImageElement> & { src: string };

/**
 * The bitmap stays invisible until it has fully loaded. A slow response
 * therefore cannot paint scanlines. `decodedSrc` resets as soon as `src`
 * changes, and a cached image that is already `complete` (load may have
 * fired before React subscribed) is shown on the ref callback.
 */
export default function WholeImage({ src, className, style, alt = "", onLoad, onError, ...rest }: Props) {
  const [decodedSrc, setDecodedSrc] = useState<string | null>(null);
  const ready = decodedSrc === src;

  return (
    <img
      {...rest}
      ref={(node) => {
        if (node && node.getAttribute("src") === src && node.complete && node.naturalWidth > 0) {
          setDecodedSrc(src);
        }
      }}
      src={src}
      alt={alt}
      decoding="async"
      data-loaded={ready ? "true" : "false"}
      className={cn(className)}
      style={ready ? style : { ...style, opacity: 0 }}
      onLoad={(event) => {
        setDecodedSrc(src);
        onLoad?.(event);
      }}
      onError={(event) => {
        onError?.(event);
      }}
    />
  );
}
