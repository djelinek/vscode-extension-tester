import * as assert from 'assert';
import * as path from 'path';
import { afterEach } from 'vscode-extension-tester';

describe(path.basename(__filename, '.js'), function () {
    describe('Second level', function () {
        describe('Third level', function () {
            afterEach(function () {
                throw new Error('Take a screenshot.');
            });
            it('Hello world', function () {
                assert.ok(true);
            });
        });
    });
});