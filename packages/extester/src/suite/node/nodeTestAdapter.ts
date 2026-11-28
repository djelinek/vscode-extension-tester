/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License", destination); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { afterEach, run } from 'node:test';
import type { SuiteContext, TestContext } from 'node:test';
import { spec } from 'node:test/reporters';
import { finished } from 'node:stream/promises';
import sanitize from 'sanitize-filename';
import type { VSBrowser } from '../../browser';
import { registerTypeScriptModules } from '../../util/typescript';
import { exitCode, GlobalFixturesState, RunContext, TestRunnerAdapter } from '../adapter';

/** Environment variables selecting tests by name with the other runners, which node:test cannot honour */
export const GREP_ENVS = ['EXTESTER_GREP', 'MOCHA_GREP'];

/** First Node.js version whose test runner can run the test files in the current process (`isolation: 'none'`) */
export const NODE_TEST_MIN_VERSION = '22.8.0';

/** Failure types of the test runner's `test:fail` events that only repeat a failure reported elsewhere */
const AGGREGATE_FAILURES = new Set(['subtestsFailed']);

/** Subset of the data of a `test:fail` event read here */
interface TestFailEvent {
	details: { error?: { failureType?: string } };
}

/** Subset of the data of `test:enqueue` and `test:complete` events read here */
export interface TestLocationEvent {
	name: string;
	nesting: number;
	file?: string;
	line?: number;
	column?: number;
}

/**
 * Tells when every top-level test of an in-process run has finished. With `isolation: 'none'`, `node:test`
 * ends the run (runs the root `after` hooks and ends the report) only once the event loop is empty, which
 * never happens while ExTester keeps VS Code and ChromeDriver running. All test files are imported, and
 * so all top-level tests enqueued, before the first test starts, so the run is over once each of them completed.
 */
export class RunCompletion {
	private readonly enqueued = new Set<string>();
	private readonly completed = new Set<string>();
	private done = false;

	/**
	 * @param onDone called once, when the last top-level test completed
	 */
	constructor(private readonly onDone: () => void) {}

	/** Record a `test:enqueue` event */
	enqueue(data: TestLocationEvent): void {
		if (data.nesting === 0) {
			this.enqueued.add(key(data));
		}
	}

	/** Record a `test:complete` event */
	complete(data: TestLocationEvent): void {
		const id = key(data);
		if (data.nesting !== 0 || !this.enqueued.has(id) || this.done) {
			return;
		}
		this.completed.add(id);
		if (this.completed.size === this.enqueued.size) {
			this.done = true;
			this.onDone();
		}
	}
}

function key(data: TestLocationEvent): string {
	return `${data.file}:${data.line}:${data.column}:${data.name}`;
}

/**
 * Runs the tests with the Node.js built-in test runner (`node:test`, experimental). The test files
 * run in the ExTester process, one at a time, so they share `VSBrowser.instance` and the page
 * objects with ExTester, as with Mocha. The workbench starts before the run and stops after it.
 */
export class NodeTestAdapter implements TestRunnerAdapter {
	readonly name = 'node';
	readonly loadsTestFilesInProcess = true;

	async run({ testFiles, browser, workbench }: RunContext): Promise<number> {
		assertNodeTestSupported();
		// node:test imports the test files with the ES module loader, which the CommonJS TypeScript hook does not cover
		registerTypeScriptModules(testFiles);
		const state: GlobalFixturesState = { setupFailed: false, teardownFailed: false };
		let failures = 0;
		try {
			try {
				await workbench.setup();
			} catch (err) {
				state.setupFailed = true;
				console.error('Error in global setup:', err);
			}
			if (!state.setupFailed) {
				failures = await runTestFiles(testFiles, browser);
			}
		} finally {
			try {
				await workbench.teardown();
			} catch (err) {
				console.error('Error shutting down the workbench:', err);
				state.teardownFailed = true;
			}
		}
		return exitCode(failures, state);
	}
}

/**
 * Run the test files with `node:test` in this process and report them with the spec reporter
 * @param testFiles test files, in run order
 * @param browser browser taking the screenshots of failed tests
 * @returns number of failed tests, hooks and test files
 */
async function runTestFiles(testFiles: string[], browser: VSBrowser): Promise<number> {
	if (testFiles.length === 0) {
		return 0;
	}
	let failures = 0;
	// node:test ends an in-process run from a 'beforeExit' listener it adds when the run starts
	const existingExitListeners = new Set(process.listeners('beforeExit'));
	const stream = run({
		...nodeTestRunOptions(testFiles),
		// called once the run's root test exists: a hook registered here applies to every test of every file
		setup: () => {
			afterEach(async (t: TestContext | SuiteContext) => {
				if ('passed' in t && !t.passed) {
					try {
						await browser.takeScreenshot(screenshotName(t.fullName));
					} catch (err) {
						console.log('Screenshot capture failed.', err);
					}
				}
			});
		},
	});
	const endRun = process.listeners('beforeExit').filter((listener) => !existingExitListeners.has(listener));
	const completion = new RunCompletion(() => {
		const code = Number(process.exitCode ?? 0);
		if (endRun.length > 0) {
			endRun.forEach((listener) => listener.call(process, code));
		} else {
			// the listener could not be told apart from the others: let them all see the run end
			process.emit('beforeExit', code);
		}
	});
	stream.on('test:enqueue', (data: TestLocationEvent) => completion.enqueue(data));
	stream.on('test:complete', (data: TestLocationEvent) => completion.complete(data));
	stream.on('test:fail', (data: TestFailEvent) => {
		failures += countsAsFailure(data) ? 1 : 0;
	});
	const reporter = stream.compose(spec);
	reporter.pipe(process.stdout, { end: false });
	await finished(reporter);
	return failures;
}

/**
 * Options of the `node:test` run: the test files in this process, one at a time.
 * Name filters are not among them: with `isolation: 'none'`, `run()` ignores `testNamePatterns` and
 * `testSkipPatterns` and only applies Node's own `--test-name-pattern` / `--test-skip-pattern` flags.
 * @param testFiles test files
 */
export function nodeTestRunOptions(testFiles: string[]) {
	return {
		files: testFiles,
		isolation: 'none' as const,
		concurrency: 1,
	};
}

/**
 * Reject the name filter environment variables of the other runners, which node:test would silently ignore
 * @param env environment to check
 * @throws an error pointing to Node's own name filter flags when one of them is set
 */
export function assertNoNameFilterEnv(env: NodeJS.ProcessEnv = process.env): void {
	const name = GREP_ENVS.find((variable) => env[variable]);
	if (name) {
		throw new Error(
			`${name} is not supported with the node:test runner: Node.js applies only its own name filters to tests running in the ExTester process. ` +
				`Unset ${name} and pass the filter to Node.js instead, e.g. NODE_OPTIONS='--test-name-pattern="${env[name]}"' (or --test-skip-pattern to skip matching tests).`,
		);
	}
}

/**
 * Whether a `test:fail` event is a failure of its own, rather than a suite failing because one of its tests failed
 * @param data event data
 */
export function countsAsFailure(data: TestFailEvent): boolean {
	return !AGGREGATE_FAILURES.has(data.details.error?.failureType ?? '');
}

/**
 * Screenshot file name of a test, matching the name Mocha runs use (`fullTitle()`: suite and test titles joined by spaces)
 * @param fullName `node:test` full test name, levels separated by ` > `
 */
export function screenshotName(fullName: string): string {
	return sanitize(fullName.split(' > ').join(' '));
}

/**
 * Check that this Node.js can run the test files in the current process
 * @param version Node.js version to check, the running one by default
 * @throws when the version is older than {@link NODE_TEST_MIN_VERSION}
 */
export function assertNodeTestSupported(version: string = process.versions.node): void {
	const [major, minor] = version.split('.').map(Number);
	const [minMajor, minMinor] = NODE_TEST_MIN_VERSION.split('.').map(Number);
	if (major < minMajor || (major === minMajor && minor < minMinor)) {
		throw new Error(
			`The node:test runner needs Node.js ${NODE_TEST_MIN_VERSION} or newer to run the tests in the ExTester process, this is Node.js ${version}.`,
		);
	}
}
