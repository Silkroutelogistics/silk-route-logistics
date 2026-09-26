import localFont from "next/font/local";

/**
 * The adopted-signature face: Alex Brush, SIL Open Font License 1.1 (license
 * beside the file). The same face the executed agreement PDF sets a signer's
 * typed name in, so the preview on the signing page is what the document shows.
 *
 * Not a typography face. It is loaded here and applied by class to the preview
 * alone, rather than joining the brand font tokens.
 */
export const signatureFont = localFont({
  src: "../fonts/AlexBrush-Regular.ttf",
  display: "swap",
});
