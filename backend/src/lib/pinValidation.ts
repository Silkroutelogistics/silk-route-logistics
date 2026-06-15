// v3.8.amz — SRL Driver Academy Sprint T2: reject trivially-weak 6-digit PINs
// at set-time so the login surface isn't defending an 000000/123456 PIN.
// Defense-in-depth alongside the login rate limiter + per-driver lockout.

const WEAK_PINS = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555",
  "666666", "777777", "888888", "999999",
  "123456", "654321", "012345", "543210", "111222", "121212",
  "123123", "112233", "696969", "420420", "007007", "101010",
]);

const ASC = "0123456789";
const DESC = "9876543210";

/** True if the PIN is a known-weak / sequential / all-same pattern. */
export function isWeakPin(pin: string): boolean {
  if (WEAK_PINS.has(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true; // all same digit
  if (ASC.includes(pin) || DESC.includes(pin)) return true; // strict run
  return false;
}
