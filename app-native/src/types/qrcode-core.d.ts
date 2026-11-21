// The qrcode package's core (pure JS, no canvas or files), used to draw a QR code with react-native-svg (21 Nov 2026).
declare module 'qrcode/lib/core/qrcode' {
  export function create(text: string, opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): { modules: { size: number; data: Uint8Array } };
}
