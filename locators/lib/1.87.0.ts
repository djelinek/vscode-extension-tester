import { By, fromText, LocatorDiff } from "monaco-page-objects";
export const diff: LocatorDiff = {
    locators: {
        BottomBarPanel: {
            close: 'Hide Panel',
            globalActions: By.className('global-actions'),
            action: (label: string) => By.xpath(`.//a[starts-with(@aria-label, '${label}')]`)
        },
        SettingsEditor: {
            comboValue: 'value'
        },
        FindWidget: {
            checkbox: (title: string) => By.xpath(`.//div[@role='checkbox' and starts-with(@aria-label, "${title}")]`)
        },
        Notification: {
            buttonConstructor: (title: string) => By.xpath(`.//a[@role='button' and text()='${title}']`),
            actionLabel: {
                value: fromText()
            }
        }
    }
}