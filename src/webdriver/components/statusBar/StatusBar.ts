import { AbstractElement } from "../AbstractElement";
import { By } from "selenium-webdriver";
import { NotificationsCenter } from "../workbench/NotificationsCenter";

/**
 * Page object for the status bar at the bottom
 */
export class StatusBar extends AbstractElement {
    constructor() {
        super(By.id('workbench.parts.statusbar'), By.className('monaco-workbench'));
    }

    /**
     * Open the notifications center
     */
    async openNotificationsCenter(): Promise<NotificationsCenter> {
        await this.toggleNotificationsCentre(true);
        return new NotificationsCenter();
    }

    /**
     * Close the notifications center
     */
    async closeNotificationsCenter(): Promise<void> {
        await this.toggleNotificationsCentre(false);
    }

    /**
     * Open the language selection quick pick
     * Only works with an open editor
     */
    async openLanguageSelection(): Promise<void> {
        await this.findElement(By.id('status.editor.mode')).click();
    }

    /**
     * Get the current language label text
     * Only works with an open editor
     */
    async getCurrentLanguage(): Promise<string> {
        return await this.findElement(By.id('status.editor.mode')).getText();
    }

    /**
     * Open the quick pick for line endings selection
     * Only works with an open editor
     */
    async openLineEndingSelection(): Promise<void> {
        await this.findElement(By.id('status.editor.eol')).click();
    }

    /**
     * Get the currently selected line ending as text
     * Only works with an open editor
     */
    async getCurrentLineEnding(): Promise<string> {
        return await this.findElement(By.id('status.editor.eol')).getText();
    }

    /**
     * Open the encoding selection quick pick
     * Only works with an open editor
     */
    async openEncodingSelection(): Promise<void> {
        await this.findElement(By.id('status.editor.encoding')).click();
    }

    /**
     * Get the name of the current encoding as text
     * Only works with an open editor
     */
    async getCurrentEncoding(): Promise<string> {
        return await this.findElement(By.id('status.editor.encoding')).getText();
    }

    /**
     * Open the indentation selection quick pick
     * Only works with an open editor
     */
    async openIndentationSelection(): Promise<void> {
        await this.findElement(By.id('status.editor.indentation')).click();
    }

    /**
     * Get the current indentation option label as text
     * Only works with an open editor
     */
    async getCurrentIndentation(): Promise<string> {
        return await this.findElement(By.id('status.editor.indentation')).getText();
    }

    /**
     * Open the line selection input box
     * Only works with an open editor
     */
    async openLineSelection(): Promise<void> {
        await this.findElement(By.id('status.editor.selection')).click();
    }

    /**
     * Get the current editor coordinates as text
     * Only works with an open editor
     */
    async getCurrentPosition(): Promise<string> {
        return await this.findElement(By.id('status.editor.selection')).getText();
    }

    /**
     * Get the name of specified Status Bar item by ID as text
     * Only works with an open editor
     */
    async getItemByID(id: string): Promise<string> {
        return await this.findElement(By.id(id)).getText();
    }

    /**
     * Open/Close notification centre
     * @param open true to open, false to close
     */
    private async toggleNotificationsCentre(open: boolean): Promise<void> {
        let visible = false;
        try {
            const klass = await this.enclosingItem.findElement(By.className('notifications-center')).getAttribute('class');
            visible = klass.indexOf('visible') > -1;
        } catch (err) {
            // element doesn't exist until the button is first clicked
        }
        if (visible !== open) {
            await this.findElement(By.className('octicon-bell')).click();
        }
    }
}