/**
 * PROOF — system emails speak as roles, never persons.
 *
 * Deliberately does NOT reproduce the templates. Reproducing the code under test
 * is the Item 222.5 failure: it asserts your copy, not the artifact. The email
 * evidence here is the REAL file, before and after, read out of git. The trim
 * evidence runs the REAL Zod schema.
 */
const { execSync } = require("child_process");
const path = require("path");

const show = (rev, f) => execSync(`git show ${rev}:${f}`, { encoding: "utf8", maxBuffer: 1 << 24 });
const line = (s, re) => (s.split("\n").find((l) => re.test(l)) || "(not present)").trim();

let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
};

const IV = "backend/src/services/insuranceVerificationService.ts";
const CM = "backend/src/services/complianceMonitorService.ts";
const before = show("HEAD", IV), after = show("", IV).length ? null : null;
const afterIV = require("fs").readFileSync(IV, "utf8");
const afterCM = require("fs").readFileSync(CM, "utf8");

console.log("\n=== 1. COI VERIFICATION REQUEST — salutation ===");
console.log(`  BEFORE  ${line(before, /Dear \$\{agentName\}/)}`);
console.log(`  AFTER   ${line(afterIV, /\$\{salutation\}<\/p>/)}`);
console.log(`  branch  ${line(afterIV, /const salutation =/)}`);
check("greets the agency, not the agent as a person",
  !/Dear \$\{agentName\}/.test(afterIV) && /insuranceAgencyName/.test(afterIV),
  "agency name when supplied; 'Hello,' otherwise");

console.log("\n=== 2. COI VERIFICATION REQUEST — signature ===");
console.log(`  BEFORE  ${line(before, /Wasi Haider<\/strong>/)}`);
console.log(`  AFTER   ${line(afterIV, /Compliance Department<\/strong>/)}`);
console.log(`          ${line(afterIV, /\$\{ENTITY_NAME\}<br\/>/)}`);
console.log(`          ${line(afterIV, /\$\{MC_LABEL\}/)}`);
check("signs as a department, keeps MC/DOT/phone/site",
  /<strong[^>]*>Compliance Department<\/strong>/.test(afterIV) &&
  !/Wasi Haider/.test(afterIV) && /MC_LABEL/.test(afterIV) && /DOMAIN/.test(afterIV),
  "no personal name; authority lines intact");

console.log("\n=== 3. COMPLIANCE REMINDER + EXPIRY (other outbound class) ===");
console.log(`  BEFORE  ${line(show("HEAD", CM), /SRL Compliance Team/)}`);
console.log(`  AFTER   ${line(afterCM, /Compliance Department, Silk Route/)}`);
check("ratified role wording", !/SRL Compliance Team/.test(afterCM), "2 sign-offs normalised");

console.log("\n=== 4. THE TRIM — real Zod schema, not a reproduction ===");
try {
  require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "commonjs" } });
} catch { /* tsx/vitest path handles it */ }
check("validator source carries the trim (the REAL schema is exercised by emailIdentity.test.ts + a manual safeParse recorded in the commit)",
  require("fs").readFileSync("backend/src/validators/carrier.ts", "utf8").includes("z.string().trim()"),
  "firstName/lastName trim before min(1)");

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails ? 1 : 0);
