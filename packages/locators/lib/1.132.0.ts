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

import { By, LocatorDiff } from '@redhat-developer/page-objects';

export const diff: LocatorDiff = {
	locators: {
		// VS Code 1.132 adds a non-empty data-parent-flow-to-element-id attribute to
		// the container div of editor webviews, so the XPath predicate
		// not(@data-parent-flow-to-element-id) used by WebviewView.iframe (1.90+)
		// now excludes all editor webviews. Drop that attribute predicate and rely on
		// findBestContainingElement() (rect-overlap) to pick the correct iframe.
		// WebView.iframe already uses iframe.webview.ready since the base locator.
		// See https://github.com/redhat-developer/vscode-extension-tester/issues/2450
		WebviewView: {
			iframe: By.css(`iframe.webview.ready`),
		},
	},
};
