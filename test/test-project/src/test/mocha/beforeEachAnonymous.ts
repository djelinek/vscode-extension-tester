import * as assert from 'assert';
import * as path from 'path';
import { beforeEach } from 'vscode-extension-tester';


describe(path.basename(__filename, '.js'), function () {
    beforeEach(function () {
        throw new Error('Take a screenshot.');
    });
    it('Hello world', function () {
        assert.ok(true);
    });
});