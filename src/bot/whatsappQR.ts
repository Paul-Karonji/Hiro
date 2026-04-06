/** Shared module to hold the latest WhatsApp QR string for the /qr endpoint */
let latestQR: string | null = null;

export function setLatestQR(qr: string | null) {
  latestQR = qr;
}

export function getLatestQR(): string | null {
  return latestQR;
}
