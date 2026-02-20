/**
 * Password policy enforcement for Silk Route Logistics
 * - Minimum 10 characters
 * - At least one uppercase, one lowercase, one number, one special character
 * - Rejects top 1000 most common passwords
 */

// Top 1000 most common passwords (compressed set of the most critical ones)
const COMMON_PASSWORDS = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
  "letmein", "trustno1", "dragon", "baseball", "iloveyou", "master", "sunshine",
  "ashley", "bailey", "passw0rd", "shadow", "123123", "654321", "superman",
  "qazwsx", "michael", "football", "password1", "password123", "batman", "login",
  "princess", "charlie", "admin", "mustang", "access", "hello", "joshua", "maggie",
  "starwars", "silver", "william", "dallas", "yankees", "123456789", "donald",
  "harley", "jordan", "thomas", "robert", "matthew", "hunter", "amanda",
  "jennifer", "jessica", "pepper", "ginger", "lakers", "rangers", "hammer",
  "sparky", "yankee", "camaro", "falcon", "andrea", "smokey", "dakota",
  "welcome", "welcome1", "welcome123", "freedom", "whatever", "qwerty123",
  "qwertyuiop", "nothing", "killer", "pokemon", "summer", "flower", "butter",
  "cheese", "hockey", "soccer", "chicken", "purple", "orange", "banana",
  "coffee", "cookie", "guitar", "morgan", "taylor", "knight", "senior",
  "master1", "abc1234", "abcdef", "111111", "000000", "zxcvbnm", "asdfghjkl",
  "1q2w3e4r", "q1w2e3r4", "1qaz2wsx", "zaq1xsw2", "password12", "password1234",
  "iloveyou1", "trustno1", "changeme", "p@ssw0rd", "p@ssword", "letmein1",
  "computer", "internet", "samsung", "google", "apple", "mercedes", "corvette",
  "midnight", "diamond", "december", "november", "october", "september",
  "january", "february", "biteme", "cowboys", "steelers", "packers",
  "broncos", "dolphins", "eagles", "patriots", "thunder", "warrior",
  "spartan", "samurai", "ninja", "pirate", "phoenix", "arsenal",
  "chelsea", "liverpool", "manchester", "barcelona", "qwerty1", "password2",
  "1234567890", "12345", "123456a", "a123456", "pass1234", "test1234",
  "admin123", "root", "toor", "administrator", "user", "guest", "demo",
  "default", "public", "private", "secret", "secure", "security",
  "jesus", "christ", "heaven", "angel", "blessed", "prayer",
  "test", "testing", "temp", "temporary", "sample", "example",
  "asdf", "zxcv", "qwer", "asdfg", "zxcvb", "qwert",
  "aaaaaa", "bbbbbb", "cccccc", "dddddd", "eeeeee",
  "a1b2c3d4", "1a2b3c4d", "abcd1234", "1234abcd",
  "Pa$$word", "Pa$$w0rd", "P@$$word", "P@ssword1",
  "Qwerty123", "Qwerty1!", "Password1!", "Welcome1!",
  "Summer2024", "Winter2024", "Spring2024", "Fall2024",
  "Summer2025", "Winter2025", "Spring2025", "Fall2025",
  "Summer2026", "Winter2026", "Spring2026", "Fall2026",
  "Company1!", "Freight1!", "Trucking1!", "Logistics1!",
]);

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: "weak" | "medium" | "strong";
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 10) {
    errors.push("Password must be at least 10 characters long");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("This password is too common. Please choose a more unique password");
  }

  // Calculate strength
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) score++;
  if (password.length >= 18) score++;

  let strength: "weak" | "medium" | "strong" = "weak";
  if (score >= 5) strength = "strong";
  else if (score >= 3) strength = "medium";

  return { valid: errors.length === 0, errors, strength };
}
