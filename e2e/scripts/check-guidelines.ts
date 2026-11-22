// Enforces the mechanical rules in e2e/GUIDELINES.md. Exits non-zero on any violation.
// e2e/stack is the harness: it starts services, and contains no tests or locators.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const E2E = process.argv[2] ?? join(import.meta.dir, "..");
const SCANNED = ["journeys", "pages", "support", "playwright.config.ts"];

const LOCATOR_METHODS = new Set([
  "locator", "frameLocator", "getByRole", "getByText", "getByLabel", "getByPlaceholder",
  "getByAltText", "getByTitle", "getByTestId", "$", "$$", "$eval", "$$eval",
]);
const LOCATOR_REFINEMENTS = new Set(["filter", "first", "last", "nth", "and", "or", "contentFrame"]);
const WAIT_CALLS = new Set(["setInterval", "sleep", "toPass", "poll"]);
const TIMEOUT_CALLS = new Set(["setTimeout", "setDefaultTimeout", "setDefaultNavigationTimeout", "slow"]);
const TIMEOUT_KEYS = new Set(["timeout", "actionTimeout", "navigationTimeout", "globalTimeout"]);

const files = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => files(join(path, name)))
    : path.endsWith(".ts") ? [path] : [];

const violations: string[] = [];

function check(path: string) {
  const name = relative(E2E, path);
  const inPages = name.startsWith(`pages${sep}`);
  const inJourneys = name.startsWith(`journeys${sep}`);
  const isConfig = name === "playwright.config.ts";
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const report = (node: ts.Node, message: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    violations.push(`${name}:${line + 1}: ${message}`);
  };

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const method = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee) ? callee.text : "";

      if (LOCATOR_METHODS.has(method)) {
        if (!inPages) report(node, `rule 2: locator ${method}() outside a POM`);
        else if (method !== "getByRole") report(node, `rule 3: ${method}() is not a role locator`);
        else {
          const options = node.arguments[1];
          const named = options && ts.isObjectLiteralExpression(options) &&
            options.properties.some((p) => p.name?.getText() === "name");
          if (!named) report(node, "rule 3: getByRole() needs an accessible name");
        }
      }
      if (LOCATOR_REFINEMENTS.has(method) && ts.isPropertyAccessExpression(callee)) {
        report(node, `rule 3: locator refinement ${method}()`);
      }
      if (/^waitFor/.test(method) || WAIT_CALLS.has(method)) report(node, `rule 5: wait ${method}()`);
      if (TIMEOUT_CALLS.has(method)) report(node, `rule 6: ${method}()`);
      if (method === "configure" && callee.getText().startsWith("expect")) {
        report(node, "rule 6: expect.configure()");
      }
      if (inJourneys && ts.isIdentifier(callee) && callee.text === "test") {
        const steps = (node.arguments[1]?.getText().match(/\btest\.step\(/g) ?? []).length;
        if (steps < 2) report(node, "rule 4: a journey needs multiple test.step() calls");
      }
    }
    if (ts.isStringLiteralLike(node) && node.text === "networkidle") report(node, "rule 5: networkidle");
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const key = node.name.getText().replace(/['"]/g, "");
      if (TIMEOUT_KEYS.has(key)) report(node, `rule 6: ${key} setting`);
      if (isConfig && key === "retries" &&
        !(ts.isPropertyAssignment(node) && node.initializer.getText() === "0")) {
        report(node, "config: retries must be 0");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (isConfig && !source.text.includes("retries: 0")) report(source, "config: retries must be 0");
}

SCANNED.flatMap((entry) => files(join(E2E, entry))).forEach(check);

if (violations.length) {
  console.error(violations.join("\n"));
  console.error(`\n${violations.length} violation(s) of e2e/GUIDELINES.md`);
  process.exit(1);
}
console.log("E2E guidelines check passed");
