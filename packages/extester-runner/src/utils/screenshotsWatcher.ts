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

import * as vscode from 'vscode';
import { Logger } from '../logger/logger';
import path from 'path';
import * as fs from 'fs';
import { ScreenshotsTreeProvider } from '../providers/screenshotsTreeProvider';

let watcher: vscode.FileSystemWatcher | undefined;

/**
 * Creates a file system watcher to monitor changes in the screenshots folder.
 *
 * This function sets up a `FileSystemWatcher` that listens for file creation, deletion,
 * and modification events. When an event occurs, it logs the change and refreshes
 * the test tree view to reflect the updates.
 *
 * @param {vscode.ExtensionContext} context - The extension context, used for managing subscriptions.
 * @param {ScreenshotsTreeProvider} screenshotsDataProvider - The tree data provider responsible for managing the screenshots view.
 * @param {Logger} logger - The logging utility for debugging and tracking file system events.
 */
export function createScreenshotsWatcher(context: vscode.ExtensionContext, screenshotsDataProvider: ScreenshotsTreeProvider, logger: Logger) {
	if (watcher) {
		watcher.dispose();
		logger.debug('ScreenshotsWatcher: Disposed previous screenshots watcher.');
	}

	logger.debug('ScreenshotsWatcher: Creating screenshots system watcher');

	const configuration = vscode.workspace.getConfiguration('extesterRunner');
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	const tempDirSettings = configuration.get<string>('tempFolder')?.trim();
	const envTempDir = process.env.TEST_RESOURCES?.trim();

	let baseTempDir: string | undefined = tempDirSettings ?? envTempDir;

	if (baseTempDir && baseTempDir.length > 0) {
		baseTempDir = path.isAbsolute(baseTempDir) ? baseTempDir : path.join(workspaceFolder ?? '', baseTempDir);
	} else {
		baseTempDir = path.join(process.env.TMPDIR ?? process.env.TEMP ?? '/tmp', 'test-resources');
	}

	const screenshotsDirectory = path.join(baseTempDir, 'screenshots');

	if (!fs.existsSync(screenshotsDirectory)) {
		logger.error(`ScreenshotsWatcher: Screenshots directory does not exist: ${screenshotsDirectory}`);
		return;
	}

	logger.info(`ScreenshotsWatcher: Watching screenshots directory: ${screenshotsDirectory}`);

	watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(screenshotsDirectory, '**/*'));

	/**
	 * Event listener for file creation.
	 */
	watcher.onDidCreate(() => {
		screenshotsDataProvider.refresh();
	});

	/**
	 * Event listener for file deletion.
	 */
	watcher.onDidChange(() => {
		screenshotsDataProvider.refresh();
	});

	/**
	 * Event listener for file modification.
	 */
	watcher.onDidDelete(() => {
		screenshotsDataProvider.refresh();
	});

	// Register the watcher for automatic disposal when the extension is deactivated.
	context.subscriptions.push(watcher);
}
