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

import assert from 'assert';
import * as fs from 'fs';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import * as os from 'os';
import * as path from 'path';
import { Session, WebDriver } from 'selenium-webdriver';
import { Executor, HttpClient } from 'selenium-webdriver/http';
import { VSBrowser } from '../browser';
import { createTestRunnerAdapter, parseTestRunner, selectTestRunner } from '../suite/adapter';
import {
	assertNodeTestSupported,
	countsAsFailure,
	assertNoNameFilterEnv,
	NodeTestAdapter,
	nodeTestRunOptions,
	RunCompletion,
	screenshotName,
} from '../suite/node/nodeTestAdapter';
import { ReleaseQuality } from '../util/codeUtil';

describe('node:test runner selection', () => {
	it('accepts node and node:test', () => {
		assert.strictEqual(parseTestRunner('node'), 'node');
		assert.strictEqual(parseTestRunner('node:test'), 'node');
		assert.strictEqual(parseTestRunner(' Node:Test '), 'node');
	});

	it('rejects a name filter set for the other runners', () => {
		const saved = process.env.EXTESTER_GREP;
		process.env.EXTESTER_GREP = 'editor';
		try {
			assert.throws(() => selectTestRunner({ testRunner: 'node' }), /EXTESTER_GREP is not supported with the node:test runner/);
		} finally {
			if (saved === undefined) {
				delete process.env.EXTESTER_GREP;
			} else {
				process.env.EXTESTER_GREP = saved;
			}
		}
	});

	it('keeps the hidden window mode, as the tests run in the ExTester process', () => {
		assert.deepStrictEqual(selectTestRunner({ testRunner: 'node', hiddenWindow: true }, true), { name: 'node' });
	});

	it('ignores the Mocha and Vitest configuration files', () => {
		const log = console.log;
		const messages: string[] = [];
		console.log = (...args: unknown[]) => messages.push(args.join(' '));
		try {
			assert.deepStrictEqual(selectTestRunner({ testRunner: 'node', config: '.mocharc.yml', vitestConfig: 'vitest.config.ts' }), { name: 'node' });
		} finally {
			console.log = log;
		}
		assert.strictEqual(messages.length, 2);
		assert.match(messages[0], /Mocha configuration \.mocharc\.yml is ignored, the tests run with node:test/);
		assert.match(messages[1], /Vitest configuration vitest\.config\.ts is ignored, the tests run with node:test/);
	});

	it('creates the node:test adapter, which loads the test files in process', () => {
		const adapter = createTestRunnerAdapter('node');
		assert.ok(adapter instanceof NodeTestAdapter);
		assert.strictEqual(adapter.loadsTestFilesInProcess, true);
	});
});

describe('node:test adapter options', () => {
	it('runs the files in this process, one at a time', () => {
		assert.deepStrictEqual(nodeTestRunOptions(['a.test.js']), { files: ['a.test.js'], isolation: 'none', concurrency: 1 });
	});

	it('rejects EXTESTER_GREP and MOCHA_GREP, which node:test would ignore, pointing to its own flag', () => {
		assert.doesNotThrow(() => assertNoNameFilterEnv({}));
		assert.throws(
			() => assertNoNameFilterEnv({ EXTESTER_GREP: 'editor' }),
			/EXTESTER_GREP is not supported with the node:test runner.*--test-name-pattern="editor"/,
		);
		assert.throws(() => assertNoNameFilterEnv({ MOCHA_GREP: 'slow' }), /MOCHA_GREP is not supported with the node:test runner/);
	});

	it('names screenshots like Mocha does', () => {
		assert.strictEqual(screenshotName('Editor > opens a file'), 'Editor opens a file');
		assert.strictEqual(screenshotName('a/b: c'), 'ab c');
	});

	it('does not count a suite whose tests failed as another failure', () => {
		assert.strictEqual(countsAsFailure({ details: { error: { failureType: 'testCodeFailure' } } }), true);
		assert.strictEqual(countsAsFailure({ details: { error: { failureType: 'hookFailed' } } }), true);
		assert.strictEqual(countsAsFailure({ details: { error: { failureType: 'subtestsFailed' } } }), false);
		assert.strictEqual(countsAsFailure({ details: {} }), true);
	});

	it('needs Node.js 22.8 or newer', () => {
		assert.doesNotThrow(() => assertNodeTestSupported('22.8.0'));
		assert.doesNotThrow(() => assertNodeTestSupported('24.0.0'));
		assert.throws(() => assertNodeTestSupported('22.7.0'), /needs Node.js 22.8.0 or newer/);
		assert.throws(() => assertNodeTestSupported('20.19.0'), /needs Node.js 22.8.0 or newer/);
	});
});

describe('NodeTestAdapter run against a fake WebDriver server', function () {
	this.timeout(60_000);
	const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
	const savedResources = process.env.TEST_RESOURCES;
	let server: http.Server;
	let storage: string;

	before(async () => {
		storage = fs.mkdtempSync(path.join(os.tmpdir(), 'extester-node-test-'));
		process.env.TEST_RESOURCES = storage;
		server = http.createServer((req, res) => {
			res.setHeader('content-type', 'application/json');
			if (req.url?.endsWith('/title')) {
				res.end(JSON.stringify({ value: 'Fake VS Code' }));
			} else if (req.url?.endsWith('/screenshot')) {
				res.end(JSON.stringify({ value: PNG }));
			} else {
				res.statusCode = 404;
				res.end(JSON.stringify({ value: { error: 'unknown command', message: String(req.url) } }));
			}
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	});

	after(() => {
		server.close();
		fs.rmSync(storage, { recursive: true, force: true });
		if (savedResources === undefined) {
			delete process.env.TEST_RESOURCES;
		} else {
			process.env.TEST_RESOURCES = savedResources;
		}
	});

	it('starts the workbench, runs JavaScript and TypeScript files in this process, screenshots failures and stops the workbench', async () => {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const browser = new VSBrowser('1.100.0', ReleaseQuality.Stable);
		const events: string[] = [];
		const workbench = {
			setup: async () => {
				events.push('setup');
				// what browser.start() leaves behind, without launching VS Code
				Object.assign(browser, {
					_driver: new WebDriver(new Session('fake-session', {}), new Executor(Promise.resolve(new HttpClient(url)))),
				});
			},
			teardown: async () => {
				events.push('teardown');
			},
		};
		const fixtures = path.resolve(__dirname, '..', '..', 'test-fixtures', 'node-test');
		const testFiles = [path.join(fixtures, 'attached.test.mjs'), path.join(fixtures, 'second.test.ts')];

		const code = await new NodeTestAdapter().run({ testFiles, browser, workbench });

		assert.strictEqual(code, 1);
		assert.deepStrictEqual(events, ['setup', 'teardown']);
		assert.deepStrictEqual(fs.readdirSync(browser.getScreenshotsDir()), ['Attached suite fails on purpose.png']);
	});

	it('still stops the workbench and fails the run when it cannot start', async () => {
		const events: string[] = [];
		const workbench = {
			setup: async () => {
				events.push('setup');
				throw new Error('VS Code did not start');
			},
			teardown: async () => {
				events.push('teardown');
			},
		};
		const error = console.error;
		console.error = () => {};
		try {
			const code = await new NodeTestAdapter().run({ testFiles: [], browser: new VSBrowser('1.100.0', ReleaseQuality.Stable), workbench });
			assert.strictEqual(code, 1);
		} finally {
			console.error = error;
		}
		assert.deepStrictEqual(events, ['setup', 'teardown']);
	});
});

describe('RunCompletion', () => {
	const test = (name: string, nesting = 0, line = 1) => ({ name, nesting, file: '/a.test.js', line, column: 1 });

	it('fires once every top-level test completed', () => {
		let fired = 0;
		const completion = new RunCompletion(() => fired++);
		completion.enqueue(test('suite'));
		completion.enqueue(test('nested', 1, 2));
		completion.enqueue(test('top', 0, 3));
		completion.complete(test('nested', 1, 2));
		completion.complete(test('suite'));
		assert.strictEqual(fired, 0);
		completion.complete(test('top', 0, 3));
		assert.strictEqual(fired, 1);
	});

	it('ignores repeated and unknown completions', () => {
		let fired = 0;
		const completion = new RunCompletion(() => fired++);
		completion.enqueue(test('first'));
		completion.enqueue(test('second', 0, 2));
		completion.complete(test('first'));
		completion.complete(test('first'));
		completion.complete(test('other', 0, 9));
		assert.strictEqual(fired, 0);
		completion.complete(test('second', 0, 2));
		completion.complete(test('second', 0, 2));
		assert.strictEqual(fired, 1);
	});

	it('tells apart tests with the same name in different places', () => {
		let fired = 0;
		const completion = new RunCompletion(() => fired++);
		completion.enqueue(test('same', 0, 1));
		completion.enqueue(test('same', 0, 5));
		completion.complete(test('same', 0, 1));
		assert.strictEqual(fired, 0);
		completion.complete(test('same', 0, 5));
		assert.strictEqual(fired, 1);
	});
});
