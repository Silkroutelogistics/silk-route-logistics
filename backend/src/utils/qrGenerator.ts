/**
 * QR code generator for BOL v2.9 print templates.
 *
 * Encodes a deep-link URL of the shape
 * `https://silkroutelogistics.ai/track/<token>` at a 240px raster
 * width. PDFKit scales the PNG down to the final print size (95pt
 * for BOL v2.9). The higher source resolution preserves module
 * edges through the scale-down, giving a more reliable scan at
 * 1-2 ft under warehouse lighting.
 *
 * Colors mirror the BOL v2.9 page: navy dark modules (#0A2540) on
 * a cream light field (#FBF7F0) so the QR reads as native to the
 * document rather than a tacked-on sticker.
 *
 * Error correction level M (~15%) is the standard balance for
 * printed documents — robust against minor smudging and the
 * occasional scanner glare without bloating module count.
 */
import QRCode from 'qrcode';

const TRACK_BASE_URL = 'https://silkroutelogistics.ai/track';

export async function generateBOLQRBuffer(token: string): Promise<Buffer> {
  const url = `${TRACK_BASE_URL}/${token}`;
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 240,
    margin: 1,
    color: { dark: '#0A2540', light: '#FBF7F0' },
  });
}
