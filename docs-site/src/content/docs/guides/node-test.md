---
title: Running Tests With node:test (Experimental)
---

ExTester runs tests with [Mocha](/vscode-extension-tester/guides/mocha-configuration/) by default. As an experimental option, it can run them with the [Node.js built-in test runner](https://nodejs.org/api/test.html) (`node:test`) instead, so your UI tests need no test framework dependency at all. The page objects, `VSBrowser` and all ExTester options work the same way; only the test framework changes.

:::caution[Experimental]
The node:test runner may change in minor releases. It needs Node.js 22.8 or newer.
:::

## Setup

There is nothing to install. Choose the runner on the command line:

```shell
extest setup-and-run './out/ui-test/**/*.test.js' --test_runner node
```

or in `extester.config.json`:

```json
{
  "run": {
    "testRunner": "node",
    "testFiles": ["./out/ui-test/**/*.test.js"]
  }
}
```

`node:test` is accepted as a name too. TypeScript test files run without a build step when [tsx](/vscode-extension-tester/guides/typescript-tests/) is installed, as with Mocha.

## Writing tests

Import the test API from `node:test`, assertions from `node:assert`, and the page objects from `vscode-extension-tester`:

```ts
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { ActivityBar } from 'vscode-extension-tester';

describe('ActivityBar', () => {
	let bar: ActivityBar;

	before(() => {
		bar = new ActivityBar();
	});

	for (const label of ['Explorer', 'Search']) {
		it(`has the ${label} view`, async () => {
			assert.ok(await bar.getViewControl(label));
		});
	}
});
```

Differences from Mocha tests:

- Import `before`, `after`, `beforeEach` and `afterEach` from `node:test`. The hook wrappers exported by ExTester are for Mocha only; ExTester screenshots failed tests, including tests whose hook failed, without them.
- **Hooks outside a `describe` apply to the whole run.** All test files share one run, so a top-level `before` in one file runs before every test of every file. Put hooks inside a `describe`.
- There is no default timeout. Set one per test or suite: `it('name', { timeout: 30_000 }, fn)`.
- To run some tests only, pass Node's own filter flags through `NODE_OPTIONS`, for example `NODE_OPTIONS='--test-name-pattern=ActivityBar' npx extest run-tests ...`, or `--test-skip-pattern` to skip the matching tests. In this mode Node.js ignores every other way of filtering, so ExTester stops with an error when `EXTESTER_GREP` or `MOCHA_GREP` is set, and `it.only` and `describe.only` do not filter.
- There is no configuration file. Mocha and Vitest configuration files are ignored, with a warning.

## How it works

The test files run in the `extest` process, one after another, exactly like a Mocha run: ExTester starts VS Code, runs the files with `node:test` (`isolation: 'none'`), reports them with Node's `spec` reporter, and shuts VS Code down once every test has finished. Because the tests share the ExTester process, the [hidden window](/vscode-extension-tester/guides/hidden-window/) mode works too.

Not supported yet:

- Other `node:test` reporters, coverage of the test files (`--experimental-test-coverage`) and watch mode.
- The ExTester Runner extension still runs tests with Mocha.
