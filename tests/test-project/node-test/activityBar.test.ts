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

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { ActivityBar, VSBrowser } from 'vscode-extension-tester';

describe('ActivityBar (node:test)', () => {
	let bar: ActivityBar;

	before(() => {
		bar = new ActivityBar();
	});

	it('runs in the ExTester process, against the VS Code window it started', () => {
		assert.ok(VSBrowser.instance.driver);
		assert.equal(VSBrowser.instance.isAttached, false);
	});

	it('getViewControls finds view containers', async () => {
		const controls = await bar.getViewControls();
		assert.ok(controls.length > 0);
	});

	for (const label of ['Explorer', 'Search', 'Extensions']) {
		it(`getViewControl finds ${label}`, async () => {
			assert.ok(await bar.getViewControl(label));
		});
	}

	it('getViewControl returns undefined with an invalid label', async () => {
		assert.equal(await bar.getViewControl('whatever'), undefined);
	});

	it('getGlobalAction finds the Manage action', async () => {
		assert.ok(await bar.getGlobalAction('Manage'));
	});
});
