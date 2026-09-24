/**
 * Remove comments so prose about a rule is not read as an instance of it.
 *
 * Every source-walking guard in this suite needs this, and for the same reason:
 * documentNumber.ts describes the retired scheme at length, controllers carry
 * comments explaining why a sanctioned exception exists, and a scanner that
 * reads those as code either fires on its own documentation or gets quietly
 * loosened until it stops firing at all (§19 Sub-pattern 17).
 *
 * It lives here rather than being exported from one of the test files that use
 * it. Importing a test module for a helper EXECUTES that module's suite in the
 * importer's context — the shipment-number guard came back reporting 14 cases
 * when it defines 7, because it had pulled the permanence guard's seven along
 * with the function it wanted. Two files then fail together for reasons neither
 * one owns.
 *
 * Crude but sufficient: it only has to stop prose being read as code, and a
 * string containing "//" is not a shape any of these scanners can match anyway.
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
