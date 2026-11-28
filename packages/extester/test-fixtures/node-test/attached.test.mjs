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

// Fixture for the node:test adapter unit test: runs in the ExTester process against a fake WebDriver server.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { VSBrowser } from 'vscode-extension-tester';

describe('Attached suite', () => {
	it('drives the session of the ExTester process', async () => {
		assert.equal(await VSBrowser.instance.driver.getTitle(), 'Fake VS Code');
	});

	it('fails on purpose', () => {
		assert.equal(1, 2);
	});
});
