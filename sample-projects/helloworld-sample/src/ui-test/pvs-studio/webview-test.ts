import { Workbench, EditorView, WebviewView, By } from 'vscode-extension-tester';
import { expect } from 'chai';

describe('Sample WebView Test', function () {

    let view: WebviewView;

    before(async function () {
        this.timeout(8000);
        // open a sample web view
        await new Workbench().executeCommand('PVS-Studio: Show Window');
        await new Promise((res) => { setTimeout(res, 500); });
        // init the WebView page object
        view = new WebviewView();
        // switch webdriver into the webview iframe, now all webdriver commands are
        // relative to the webview document's root
        // make sure not to try accessing elements outside the web view while switched inside and vice versa
        await view.switchToFrame();
    });

    after(async function () {
        // after we are done with the webview, switch webdriver back to the vscode window
        await view.switchBack();
        await new EditorView().closeAllEditors();
    });

    it('Look for a web element', async function () {
        const label = 'Open report';
        const element = await view.findWebElement(By.xpath(`.//button[text()='${label}']`));
        // await element.click();
        expect(await element.getText()).has.string(label);
    });

    it('Look for all elements with given locator', async function () {
        const elements = await view.findWebElements(By.xpath('.//button'));
        expect(elements.length).equals(2);
    });
});