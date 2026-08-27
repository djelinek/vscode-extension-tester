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

import * as path from 'node:path';
import { expect } from 'chai';
import {
	TextEditor,
	EditorView,
	StatusBar,
	InputBox,
	ContentAssist,
	Workbench,
	FindWidget,
	VSBrowser,
	ModalDialog,
	after,
	before,
	afterEach,
	beforeEach,
} from 'vscode-extension-tester';
import { satisfies } from 'compare-versions';
import { getWaitHelper, waitFor } from '../testUtils';

describe('ContentAssist', function () {
	let assist: ContentAssist;
	let editor: TextEditor;

	before(async function (this: Mocha.Context) {
		this.timeout(180000);
		// Ensure the driver is at the top-level window context before doing anything,
		// in case the previous test suite left it inside a webview frame.
		await VSBrowser.instance.driver.switchTo().defaultContent();
		// Close all editors first to ensure a clean state regardless of what ran before.
		await new EditorView().closeAllEditors();
		const testFilePath = path.resolve(__dirname, '..', '..', '..', 'resources', 'test-file.ts');
		const ew = new EditorView();
		// Open the file via CLI. On macOS CI the CLI command can silently
		// fail when VS Code is still settling after a workspace change, so
		// retry the open if the tab doesn't appear within 30s.
		await waitFor(
			async () => {
				await VSBrowser.instance.openResources(testFilePath);
				const titles = await ew.getOpenEditorTitles();
				return titles.includes('test-file.ts');
			},
			{ timeout: 60000, pollInterval: 10000, message: 'test-file.ts editor did not open' },
		);

		try {
			await ew.closeEditor('Welcome');
		} catch (error) {
			// continue - Welcome page is not displayed
		}
		editor = (await ew.openEditor('test-file.ts')) as TextEditor;

		// Wait for JS/TS language features to fully initialize.
		// Phase 1: Try to observe the "Initializing JS/TS language features"
		// status bar item appearing. On CI the language service can start late,
		// so we give it up to 15s to show up. If it never appears, the service
		// may have already finished (or not started); we verify via phase 3.
		const statusBar = new StatusBar();
		let sawInitializing = false;
		try {
			await waitFor(
				async () => {
					const progress = await statusBar.getItem('Initializing JS/TS language features');
					if (progress) {
						sawInitializing = true;
					}
					return sawInitializing;
				},
				{ timeout: 15000, pollInterval: 500 },
			);
		} catch {
			// Item never appeared — may have already finished or not started yet
		}
		// Phase 2: If we saw the initializing item, wait for it to disappear.
		if (sawInitializing) {
			await waitFor(async () => !(await statusBar.getItem('Initializing JS/TS language features')), {
				timeout: 60000,
				message: 'Initializing JS/TS language features was not finished yet!',
			});
		}
		// Phase 3: Verify content assist actually returns suggestions.
		// This is the ground-truth readiness check — the status bar item can
		// appear and disappear too quickly to observe on fast machines, or
		// not appear at all on CI until well after we checked.
		const wait = getWaitHelper();
		await waitFor(
			async () => {
				try {
					const testAssist = (await editor.toggleContentAssist(true)) as ContentAssist;
					const items = await testAssist.getItems();
					await editor.toggleContentAssist(false);
					await wait.sleep(300);
					return items.length > 0;
				} catch {
					try {
						await editor.toggleContentAssist(false);
					} catch {
						// ignore
					}
					return false;
				}
			},
			{ timeout: 60000, pollInterval: 5000, message: 'Content assist produced no suggestions — TypeScript language service may not be ready' },
		);
	});

	beforeEach(async function (this: Mocha.Context) {
		this.timeout(30000);
		const wait = getWaitHelper();
		assist = (await editor.toggleContentAssist(true)) as ContentAssist;
		// Wait for content assist to stabilize
		await wait.forStable(assist, { timeout: 5000 });
	});

	afterEach(async function () {
		const wait = getWaitHelper();
		await editor.toggleContentAssist(false);
		await wait.sleep(500); // Brief wait for assist to close
	});

	after(async function () {
		await new EditorView().closeAllEditors();
	});

	it('getItems retrieves the suggestions', async function () {
		const items = await assist.getItems();
		expect(items).not.empty;
	});

	it('getItem retrieves suggestion by text', async function () {
		this.timeout(30000);
		const item = await assist.getItem('AbortController');
		expect(await item?.getLabel()).equals('AbortController');
	});

	it('getItem can find an item beyond visible range', async function () {
		this.timeout(30000);
		const item = await assist.getItem('Buffer');
		expect(item).not.undefined;
	});

	it('hasItem finds items beyond visible range', async function () {
		this.timeout(30000);
		const exists = await assist.hasItem('Error');
		expect(exists).is.true;
	});
});

describe('TextEditor', function () {
	let editor: TextEditor;
	let view: EditorView;

	const testText = process.platform === 'win32' ? `line1\r\nline2\r\nline3` : `line1\nline2\nline3`;

	before(async function (this: Mocha.Context) {
		this.timeout(30000);
		await new Workbench().executeCommand('Create: New File...');
		await (await InputBox.create()).selectQuickPick('Text File');
		view = new EditorView();
		// Wait for an untitled editor tab to be active before proceeding.
		await waitFor(
			async () => {
				const titles = await view.getOpenEditorTitles();
				return titles.some((t) => t.startsWith('Untitled'));
			},
			{ timeout: 15000, message: 'Untitled editor did not open' },
		);
		editor = new TextEditor(view);
		// Confirm the editor element is visible before interacting with it.
		await waitFor(
			async () => {
				try {
					return await editor.isDisplayed();
				} catch {
					return false;
				}
			},
			{ timeout: 10000, message: 'New file editor was not visible' },
		);

		await new StatusBar().openLanguageSelection();
		const input = await InputBox.create();
		await input.setText('typescript');
		await input.selectQuickPick('TypeScript');
	});

	after(async function (this: Mocha.Context) {
		this.timeout(30000);
		const wait = getWaitHelper();
		// Dismiss any open overlay (find widget, context menu, suggest widget).
		try {
			await editor.getDriver().actions().sendKeys('\uE00C').perform();
		} catch {
			// ignore
		}
		// Dismiss any already-open dialog from a previous test failure.
		try {
			await new ModalDialog().pushButton("Don't Save");
			await wait.sleep(500);
		} catch {
			// no dialog present
		}
		// Close the dirty untitled editor tab directly — closeEditor clicks
		// the close button and returns without waiting, so it won't hang
		// when the Save dialog appears (unlike closeAllEditors which loops).
		try {
			const title = await editor.getTitle();
			await view.closeEditor(title);
		} catch {
			// editor may already be closed
		}
		// Handle the Save dialog triggered by closing the dirty buffer.
		await wait.sleep(500);
		try {
			await new ModalDialog().pushButton("Don't Save");
			await wait.sleep(500);
		} catch {
			// no dialog appeared — buffer was clean
		}
		// Close any remaining clean editors.
		try {
			await view.closeAllEditors();
		} catch {
			// best-effort cleanup
		}
	});

	it('can get and set text', async function () {
		await editor.setText(testText);
		const text = await editor.getText();
		expect(text).equals(testText);
	});

	it('can get and set text at line', async function () {
		await editor.setTextAtLine(2, 'line5');
		const line = await editor.getTextAtLine(2);
		expect(line).has.string('line5');
	});

	it('can type text at given coordinates', async function () {
		this.timeout(5000);
		await editor.typeTextAt(1, 6, '1');
		const line = await editor.getTextAtLine(1);
		expect(line).has.string('line11');
	});

	it('getCoordinates works', async function () {
		this.timeout(15000);

		await editor.setCursor(1, 1);
		expect(await editor.getCoordinates()).to.deep.equal([1, 1]);

		const lineCount = await editor.getNumberOfLines();
		const lastLine = await editor.getTextAtLine(lineCount);

		await editor.setCursor(lineCount, lastLine.length);
		expect(await editor.getCoordinates()).to.deep.equal([lineCount, lastLine.length]);
	});

	it('getNumberOfLines works', async function () {
		const lines = await editor.getNumberOfLines();
		expect(lines).equals(3);
	});

	it('toggleContentAssist works', async function () {
		this.timeout(15000);
		const assist = (await editor.toggleContentAssist(true)) as ContentAssist;
		expect(await assist.isDisplayed()).is.true;

		await editor.toggleContentAssist(false);
	});

	it('getTab works', async function () {
		const tab = await editor.getTab();
		expect(await tab.getTitle()).equals(await editor.getTitle());
	});

	(process.platform === 'darwin' && satisfies(VSBrowser.instance.version, '<1.101.0') ? it.skip : it)('formatDocument works', async function () {
		expect(await editor.formatDocument()).not.to.throw;
	});

	describe('move/set cursor', function () {
		const params = [
			{ file: 'file-with-spaces.ts', indent: 'spaces' },
			{ file: 'file-with-tabs.ts', indent: 'tabs' },
		];

		for (const param of params) {
			describe(`file using ${param.indent}`, function () {
				let editor: TextEditor;
				let ew: EditorView;

				beforeEach(async function (this: Mocha.Context) {
					this.timeout(90000);
					const filePath = path.resolve(__dirname, '..', '..', '..', 'resources', param.file);
					ew = new EditorView();
					// Open the file with retry. On macOS CI the CLI open command
					// can fail silently, especially after a workspace folder change.
					await waitFor(
						async () => {
							try {
								await VSBrowser.instance.openResources(filePath);
							} catch {
								// CLI open may fail transiently
							}
							return (await ew.getOpenEditorTitles()).includes(param.file);
						},
						{ timeout: 60_000, pollInterval: 10000, message: `Unable to find opened editor with title '${param.file}'` },
					);
					editor = (await ew.openEditor(param.file)) as TextEditor;
				});

				afterEach(async function (this: Mocha.Context) {
					this.timeout(15000);
					try {
						await ew.closeEditor(param.file);
					} catch {
						// tab may already be closed
					}
				});

				for (const coor of [
					[2, 5],
					[3, 9],
				]) {
					it(`move cursor to position [Ln ${coor[0]}, Col ${coor[1]}]`, async function () {
						this.timeout(30000);
						await editor.moveCursor(coor[0], coor[1]);
						expect(await editor.getCoordinates()).to.deep.equal(coor);
					});
				}

				// set cursor using command prompt is not working properly for tabs indentation in VS Code, see https://github.com/microsoft/vscode/issues/198780
				for (const coor of [
					[2, 12],
					[3, 15],
				]) {
					it(`set cursor to position [Ln ${coor[0]}, Col ${coor[1]}]`, async function () {
						this.timeout(30000);
						await editor.setCursor(coor[0], coor[1]);
						expect(await editor.getCoordinates()).to.deep.equal(coor);
					});
				}
			});
		}
	});

	describe('searching', function () {
		before(async function () {
			const ew = new EditorView();
			const editors = await ew.getOpenEditorTitles();
			editor = (await ew.openEditor(editors[0])) as TextEditor;
			await editor.setText('aline\n    bline\n\tcline\ndline\nnope\neline1 eline2\nnope again\nfline');
		});

		it('getLineOfText works', async function () {
			const line = await editor.getLineOfText('line');
			expect(line).equals(1);
		});

		it('getLineOfText finds multiple occurrences', async function () {
			const line = await editor.getLineOfText('line', 5);
			expect(line).equals(6);
		});

		it('getLineOfText finds multiple occurrences on the same line', async function () {
			const line = await editor.getLineOfText('line', 6);
			expect(line).equals(6);
		});

		it('getLineOfText returns -1 on no line found', async function () {
			const line = await editor.getLineOfText('wat');
			expect(line).equals(-1);
		});

		it('getLineOfText returns last known occurrence if there are fewer than specified', async function () {
			const line = await editor.getLineOfText('line', 15);
			expect(line).equals(8);
		});

		it('selectText selects first occurrence', async function () {
			const text = 'line';
			await editor.selectText(text);
			const cursor = await editor.getCoordinates();
			expect(cursor).to.deep.equal([1, 6]);
		});

		it('selectText selects second occurrence on same line', async function () {
			const text = 'line';
			await editor.selectText(text, 6);
			const cursor = await editor.getCoordinates();
			expect(cursor).to.deep.equal([6, 13]);
		});

		it('selected text can be get (spaces)', async function () {
			const text = 'bline';
			await editor.selectText(text);
			expect(await editor.getSelectedText()).equals(text);
		});

		it('selected text can be get (tabs)', async function () {
			const text = 'cline';
			await editor.selectText(text);
			expect(await editor.getSelectedText()).equals(text);
		});

		it("selectText errors if given text doesn't exist", async function () {
			const text = 'wat';
			try {
				await editor.selectText(text);
			} catch (err) {
				if (err instanceof Error) {
					expect(err.message).has.string(`Text '${text}' not found`);
				} else {
					expect.fail();
				}
			}
		});

		(process.platform === 'darwin' && satisfies(VSBrowser.instance.version, '<1.101.0') ? it.skip : it)('getSelection works', async function () {
			await editor.selectText('cline');
			const selection = await editor.getSelection();

			expect(selection).not.undefined;

			const menu = await selection?.openContextMenu();
			await menu?.close();
		});
	});

	describe('find widget', function () {
		let widget: FindWidget;

		before(async function () {
			widget = await editor.openFindWidget();
		});

		after(async function () {
			await widget.close();
		});

		it('toggleReplace works', async function () {
			const height = (await widget.getRect()).height;
			await widget.toggleReplace(true);
			expect((await widget.getRect()).height).to.be.gt(height);
		});

		it('setSearchText works', async function () {
			await widget.setSearchText('line');
			expect(await widget.getSearchText()).equals('line');
		});

		it('setReplaceText works', async function () {
			await widget.setReplaceText('line1');
			expect(await widget.getReplaceText()).equals('line1');
		});

		it('getResultCount works', async function () {
			const count = await widget.getResultCount();
			expect(count[0]).gte(1);
			expect(count[1]).gt(1);
		});

		it('nextMatch works', async function () {
			const count = (await widget.getResultCount())[0];
			await widget.nextMatch();
			expect((await widget.getResultCount())[0]).equals(count + 1);
		});

		it('previousMatch works', async function () {
			const count = (await widget.getResultCount())[0];
			await widget.previousMatch();
			expect((await widget.getResultCount())[0]).equals(count - 1);
		});

		it('replace works', async function () {
			await widget.replace();
			expect(await editor.getLineOfText('line1')).gt(0);
		});

		it('replace all works', async function () {
			const original = await editor.getText();
			await widget.replaceAll();
			expect(await editor.getText()).not.equals(original);
		});

		it('toggleMatchCase works', async function () {
			await widget.toggleMatchCase(true);
		});

		it('toggleMatchWholeWord works', async function () {
			await widget.toggleMatchWholeWord(true);
		});

		it('toggleUseRegularExpression works', async function () {
			await widget.toggleUseRegularExpression(true);
		});

		it('togglePreserveCase works', async function () {
			await widget.togglePreserveCase(true);
		});
	});

	describe('CodeLens', function () {
		before(async function (this: Mocha.Context) {
			this.timeout(20000);
			const wait = getWaitHelper();
			await new Workbench().executeCommand('Enable CodeLens');
			// older versions of vscode don't fire the update event immediately, give it some encouragement
			// otherwise the lenses end up empty
			await new Workbench().executeCommand('Enable CodeLens');
			// Wait for CodeLens to appear — use a generous timeout for slow CI runners
			await wait.forCondition(
				async () => {
					const lenses = await editor.getCodeLenses();
					return lenses.length > 0;
				},
				{ timeout: 15000, message: 'CodeLens did not appear' },
			);
		});

		after(async function (this: Mocha.Context) {
			this.timeout(15000);
			await new Workbench().executeCommand('Disable Codelens');
			// Notifications cleanup is best-effort: if the center is already closed
			// or has no notifications the clear button may not be accessible.
			try {
				const nc = await new Workbench().openNotificationsCenter();
				await nc.clearAllNotifications();
				await nc.close();
			} catch {
				// Ignore — notifications may already be gone
			}
		});

		it('getCodeLens works with index', async function () {
			const lens0 = await editor.getCodeLens(0);
			const lens0Duplicate = await editor.getCodeLens(0);
			const lens1 = await editor.getCodeLens(1);

			expect(await lens0?.getId()).not.equal(await lens1?.getId());
			expect(await lens0?.getId()).equal(await lens0Duplicate?.getId());
		});

		it('getCodeLens works with partial text', async function () {
			const lens = await editor.getCodeLens('Codelens provided');
			expect(await lens?.getText()).has.string('Codelens provided');
			expect(await lens?.getTooltip()).has.string('Tooltip provided');
		});

		it('getCodeLenses works with second in the span', async function () {
			const lens = await editor.getCodeLens(6);
			expect(lens).is.not.undefined;
			expect(await lens?.getText()).has.string('Codelens provided');
			expect(await lens?.getTooltip()).has.string('Tooltip provided');
		});

		it('getCodeLens returns undefined when nothing is found', async function () {
			const lens1 = await editor.getCodeLens('This does not exist');
			expect(lens1).is.undefined;

			const lens2 = await editor.getCodeLens(666);
			expect(lens2).is.undefined;
		});

		it('clicking triggers the lens command', async function () {
			this.timeout(20000);
			const lens = await editor.getCodeLens(2);
			await lens?.click();
			// Wait for notification to appear
			await waitFor(
				async () => {
					const notifications = await new Workbench().getNotifications();
					const messages = await Promise.all(notifications.map(async (notification) => await notification.getMessage()));
					return messages.some((message) => message.includes('CodeLens action clicked'));
				},
				{ timeout: 10_000, message: 'Notification for lens command was not displayed!' },
			);
		});
	});
});
