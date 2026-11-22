# E2E test guidelines

Read this before adding or changing an E2E test. These rules are not optional.

1. **Happy paths of critical user journeys only.** Edge cases and error states belong in unit or component tests.
2. **Locators live only in Page Object Models.** Test files never contain a locator. They call POM methods.
3. **Locators use accessibility markers only.** Use `getByRole` with an accessible name. Never use CSS, XPath, test IDs, label or text locators, or other tricks. If an element cannot be reached by role and name, fix the app's accessibility.
4. **Tests are multi-step journeys.** Do not write a "create" test and a "delete" test. Write a single journey that performs each operation as a `test.step`.
5. **No waits.** No sleeps, `waitForTimeout`, `waitForSelector`, `waitForLoadState`, `waitForResponse`, or network-idle. Rely on Playwright's auto-waiting actions and web-first assertions.
6. **Timeouts can never be increased.** Do not raise a timeout in config, in a test, or on a single call, and do not use `test.slow()`. If something is too slow, fix the cause.
7. **CI runs two copies of the E2E tests:** one on Chromium and one on Firefox.
