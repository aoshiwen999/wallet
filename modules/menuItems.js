const { app, BrowserWindow, ipcMain: ipc, Menu, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const Windows = require('./windows');
const Settings = require('./settings');
const log = require('./utils/logger').create('menuItems');
const updateChecker = require('./updateChecker');
const seroNode = require('./seroNode.js');
// const swarmNode = require('./swarmNode.js');
const ClientBinaryManager = require('./clientBinaryManager');


// Make easier to return values for specific systems
const switchForSystem = function (options) {
    if (process.platform in options) {
        return options[process.platform];
    } else if ('default' in options) {
        return options.default;
    }
    return null;
};

if(!Settings.loadUserData('minerThread')){
    Settings.saveUserData('minerThread',1);
}

// create menu
// null -> null
const createMenu = function (webviews) {
    webviews = webviews || [];

    const menu = Menu.buildFromTemplate(menuTempl(webviews));
    Menu.setApplicationMenu(menu);
};

const restartNode = function (newType, newNetwork, syncMode, webviews) {
    newNetwork = newNetwork || seroNode.network;

    log.info('Switch node', newType, newNetwork);

    return seroNode.restart(newType, newNetwork, syncMode)
        .then(() => {
            Windows.getByType('main').load(global.interfaceAppUrl);

            createMenu(webviews);
            log.info('Node switch successful.');
        })
        .catch((err) => {
            log.error('Error switching node', err);
        });
};


const startMining = (webviews) => {
    var param = [];

    var minerThread = Settings.loadUserData('minerThread');


    if(!minerThread){
        Settings.saveUserData('minerThread',1);
        minerThread = 1;
    }

    if(typeof minerThread === 'string'){
        minerThread = parseInt(minerThread);
    }
    param.push(minerThread);
    console.log("miner_start:::",param);
    seroNode.send('miner_start', param)
        .then((ret) => {
            console.log('miner_start result:', ret.result);

            if (ret.result === null) {
                global.mining = true;
                createMenu(webviews);
            } else {
                Windows.createPopup('mining', {
                    electronOptions: {
                        width: 420,
                        height: 230,
                        alwaysOnTop: true,
                    },
                });
            }
        })
        .catch((err) => {
            console.error('miner_start err:', err);
        });
};

const stopMining = (webviews) => {
    seroNode.send('miner_stop', [1])
        .then((ret) => {
            log.info('miner_stop', ret.result);

            if (ret.result) {
                global.mining = false;
                createMenu(webviews);
            }
        })
        .catch((err) => {
            log.error('miner_stop', err);
        });
};


// create a menu template
// null -> obj
let menuTempl = function (webviews) {
    const menu = [];
    webviews = webviews || [];

    // APP
    const fileMenu = [];

    if (process.platform === 'darwin') {
        fileMenu.push(
            {
                label: i18n.t('mist.applicationMenu.app.about', { app: Settings.appName }),
                click() {
                    Windows.createPopup('about', {
                        electronOptions: {
                            width: 420,
                            height: 230,
                            alwaysOnTop: true,
                        },
                    });
                },
            },
            {
                label: i18n.t('mist.applicationMenu.app.checkForUpdates'),
                click() {
                    updateChecker.runVisibly();
                },
            },
            {
                label: i18n.t('mist.applicationMenu.app.checkForNodeUpdates'),
                click() {
                    // remove skipVersion
                    fs.writeFileSync(
                        path.join(Settings.userDataPath, 'skippedNodeVersion.json'),
                        '' // write no version
                    );

                    // true = will restart after updating and user consent
                    ClientBinaryManager.init(true);
                },
            },
            {
                type: 'separator',
            },
            {
                label: i18n.t('mist.applicationMenu.app.services', { app: Settings.appName }),
                role: 'services',
                submenu: [],
            },
            {
                type: 'separator',
            },
            {
                label: i18n.t('mist.applicationMenu.app.hide', { app: Settings.appName }),
                accelerator: 'Command+H',
                role: 'hide',
            },
            {
                label: i18n.t('mist.applicationMenu.app.hideOthers', { app: Settings.appName }),
                accelerator: 'Command+Alt+H',
                role: 'hideothers',
            },
            {
                label: i18n.t('mist.applicationMenu.app.showAll', { app: Settings.appName }),
                role: 'unhide',
            },
            {
                type: 'separator',
            }
        );
    }
    fileMenu.push(
        { label: i18n.t('mist.applicationMenu.app.quit', { app: Settings.appName }),
            accelerator: 'CommandOrControl+Q',
            click() {
                app.quit();
            },
        });
    menu.push({
        label: i18n.t('mist.applicationMenu.app.label', { app: Settings.appName }),
        submenu: fileMenu,
    });

    // ACCOUNTS
    menu.push({
        label: i18n.t('mist.applicationMenu.file.label'),
        submenu: [
            {
                label: i18n.t('mist.applicationMenu.file.newAccount'),
                accelerator: 'CommandOrControl+N',
                click() {
                    Windows.createPopup('requestAccount', {
                        electronOptions: {
                            width: 420,
                            height: 230,
                            alwaysOnTop: true,
                        },
                    });
                },
            },
            {
                label: i18n.t('mist.applicationMenu.file.importPresale'),
                accelerator: 'CommandOrControl+I',
                // enabled: seroNode.isMainNetwork,
                click() {
                    Windows.createPopup('importAccount', {
                        electronOptions: {
                            width: 600, height: 370, alwaysOnTop: true,
                        },
                    });
                },
            },
            {
                type: 'separator',
            },
            {
                label: i18n.t('mist.applicationMenu.file.backup'),
                submenu: [
                    {
                        label: i18n.t('mist.applicationMenu.file.backupKeyStore'),
                        click() {
                            let userPath = Settings.userHomePath;

                            // eth
                            if (seroNode.isSero) {
                                if (process.platform === 'win32') {
                                    userPath = `${Settings.appDataPath}\\Web3\\keys`;
                                } else {
                                    userPath += '/.web3/keys';
                                }

                            // geth
                            } else {
                                if (process.platform === 'darwin') {
                                    userPath = Settings.nodeDatadir + '/keystore';
                                }

                                if (process.platform === 'freebsd' ||
                                process.platform === 'linux' ||
                                process.platform === 'sunos') {
                                    userPath = Settings.nodeDatadir + '/.sero/keystore';
                                }

                                if (process.platform === 'win32') {
                                    userPath = `${Settings.nodeDatadir}\\keystore`;
                                }
                            }

                            shell.showItemInFolder(userPath);
                        },
                    }, {
                        label: i18n.t('mist.applicationMenu.file.backupMist'),
                        click() {
                            shell.openItem(Settings.userDataPath);
                        },
                    },
                ],
            },
            {
                type: 'separator',
            },
            // {
            //     label: i18n.t('mist.applicationMenu.file.swarmUpload'),
            //     accelerator: 'Shift+CommandOrControl+U',
            //     click() {
            //         const focusedWindow = BrowserWindow.getFocusedWindow();
            //         const paths = dialog.showOpenDialog(focusedWindow, {
            //             properties: ['openFile', 'openDirectory']
            //         });
            //         if (paths && paths.length === 1) {
            //             const isDir = fs.lstatSync(paths[0]).isDirectory();
            //             const defaultPath = path.join(paths[0], 'index.html');
            //             const uploadConfig = {
            //                 path: paths[0],
            //                 kind: isDir ? 'directory' : 'file',
            //                 defaultFile: fs.existsSync(defaultPath) ? '/index.html' : null
            //             };
            //             swarmNode.upload(uploadConfig).then((hash) => {
            //                 focusedWindow.webContents.executeJavaScript(`
            //                   Tabs.update('browser', {$set: {
            //                       url: 'bzz://${hash}',
            //                       redirect: 'bzz://${hash}'
            //                   }});
            //                   LocalStore.set('selectedTab', 'browser');
            //                 `);
            //             }).catch(e => console.log(e));
            //         }
            //     }
            // }
            ]
    });

    // EDIT
    menu.push({
        label: i18n.t('mist.applicationMenu.edit.label'),
        submenu: [
            {
                label: i18n.t('mist.applicationMenu.edit.undo'),
                accelerator: 'CommandOrControl+Z',
                role: 'undo',
            },
            {
                label: i18n.t('mist.applicationMenu.edit.redo'),
                accelerator: 'Shift+CommandOrControl+Z',
                role: 'redo',
            },
            {
                type: 'separator',
            },
            {
                label: i18n.t('mist.applicationMenu.edit.cut'),
                accelerator: 'CommandOrControl+X',
                role: 'cut',
            },
            {
                label: i18n.t('mist.applicationMenu.edit.copy'),
                accelerator: 'CommandOrControl+C',
                role: 'copy',
            },
            {
                label: i18n.t('mist.applicationMenu.edit.paste'),
                accelerator: 'CommandOrControl+V',
                role: 'paste',
            },
            {
                label: i18n.t('mist.applicationMenu.edit.selectAll'),
                accelerator: 'CommandOrControl+A',
                role: 'selectall',
            },
        ],
    });

    // LANGUAGE (VIEW)
    const switchLang = langCode => function (menuItem, browserWindow) {
        try {
            // update i18next instance in browserWindow (Mist meteor interface)
            browserWindow.webContents.executeJavaScript(
               `TAPi18n.setLanguage("${langCode}");`
            );

            // set Accept_Language header
            const session = browserWindow.webContents.session;
            session.setUserAgent(session.getUserAgent(), langCode);

            // set navigator.language (dev console only)
            // browserWindow.webContents.executeJavaScript(
            //     `Object.defineProperty(navigator, 'language, {
            //         get() { return ${langCode}; }
            //     });`
            // );

            // reload browserWindow to apply language change
            // browserWindow.webContents.reload();
        } catch (err) {
            log.error(err);
        } finally {
            Settings.language = langCode;
            ipc.emit('backendAction_setLanguage');
        }
    };

    const currentLanguage = Settings.language;
    const languageMenu = Object.keys(i18n.options.resources)
    .filter(langCode => (langCode === 'zh'||langCode === 'en'))
    .map((langCode) => {
        const menuItem = {
            label: i18n.t(`mist.applicationMenu.view.langCodes.${langCode}`),
            type: 'checkbox',
            checked: (langCode === currentLanguage),
            click: switchLang(langCode),
        };
        return menuItem;
    });

    languageMenu.unshift({
        label: i18n.t('mist.applicationMenu.view.default'),
        click: switchLang(i18n.getBestMatchedLangCode(app.getLocale())),
    }, {
        type: 'separator',
    });

    // VIEW
    menu.push({
        label: i18n.t('mist.applicationMenu.view.label'),
        submenu: [
            {
                label: i18n.t('mist.applicationMenu.view.fullscreen'),
                accelerator: switchForSystem({
                    darwin: 'Command+Control+F',
                    default: 'F11',
                }),
                click() {
                    const mainWindow = Windows.getByType('main');

                    mainWindow.window.setFullScreen(!mainWindow.window.isFullScreen());
                },
            },
            {
                label: i18n.t('mist.applicationMenu.view.languages'),
                submenu: languageMenu,
            },
        ],
    });


    // DEVELOP
    const devToolsMenu = [];
    let devtToolsSubMenu;
    let curWindow;

    // change for wallet
    if (Settings.uiMode === 'mist') {
        devtToolsSubMenu = [{
            label: i18n.t('mist.applicationMenu.develop.devToolsMistUI'),
            accelerator: 'Alt+CommandOrControl+I',
            click() {
                curWindow = BrowserWindow.getFocusedWindow();
                if (curWindow) {
                    curWindow.toggleDevTools();
                }
            },
        }, {
            type: 'separator',
        }];

        // add webviews
        webviews.forEach((webview) => {
            devtToolsSubMenu.push({
                label: i18n.t('mist.applicationMenu.develop.devToolsWebview', { webview: webview.name }),
                click() {
                    Windows.getByType('main').send('uiAction_toggleWebviewDevTool', webview._id);
                },
            });
        });

    // wallet
    } else {
        devtToolsSubMenu = [{
            label: i18n.t('mist.applicationMenu.develop.devToolsWalletUI'),
            accelerator: 'Alt+CommandOrControl+I',
            click() {
                curWindow = BrowserWindow.getFocusedWindow();
                if (curWindow) {
                    curWindow.toggleDevTools();
                }
            },
        }];
    }

    const externalNodeMsg = (seroNode.isOwnNode) ? '' : ` (${i18n.t('mist.applicationMenu.develop.externalNode')})`;
    devToolsMenu.push({
        label: i18n.t('mist.applicationMenu.develop.devTools'),
        submenu: devtToolsSubMenu,
    });

    if (Settings.uiMode === 'mist') {
        devToolsMenu.push({
            label: i18n.t('mist.applicationMenu.develop.openRemix'),
            enabled: true,
            click() {
                Windows.createPopup('remix', {
                    url: 'https://remix.web.sero.cash',
                    electronOptions: {
                        width: 1024,
                        height: 720,
                        center: true,
                        frame: true,
                        resizable: true,
                        titleBarStyle: 'default',
                    }
                });
            },
        });
    }

    // devToolsMenu.push({
    //     label: i18n.t('mist.applicationMenu.develop.runTests'),
    //     enabled: (Settings.uiMode === 'mist'),
    //     click() {
    //         Windows.getByType('main').send('uiAction_runTests', 'webview');
    //     },
    // });

    devToolsMenu.push({
        label: i18n.t('mist.applicationMenu.develop.logFiles') + externalNodeMsg,
        enabled: seroNode.isOwnNode || seroNode.isAlphaNetwork,
        click() {
            try {
                shell.showItemInFolder(`${Settings.userDataPath}/node.log`);
            } catch (e) {
                log.info(e);
            }
        },
    });

    // add node switching menu
    devToolsMenu.push({
        type: 'separator',
    });


    // add node switch
    if (process.platform === 'darwin' || process.platform === 'win32') {
        const nodeSubmenu = [];

        const geroClient = ClientBinaryManager.getClient('gero');

        if (geroClient) {
            nodeSubmenu.push({
                label: `gero ${geroClient.version}`,
                checked: seroNode.isOwnNode && seroNode.isGero,
                enabled: seroNode.isOwnNode,
                type: 'checkbox',
                click() {
                    restartNode('gero', null, 'full', webviews);
                },
            });
        }

        devToolsMenu.push({
            label: i18n.t('mist.applicationMenu.develop.seroNode'),
            submenu: nodeSubmenu,
        });
    }

    // add network switch
    devToolsMenu.push({
        label: i18n.t('mist.applicationMenu.develop.network'),
        submenu: [
            // {
            //     label: i18n.t('mist.applicationMenu.develop.mainNetwork'),
            //     accelerator: 'CommandOrControl+Alt+1',
            //     // checked: seroNode.isOwnNode && seroNode.isMainNetwork,
            //     enabled: seroNode.isOwnNode,
            //     type: 'checkbox',
            //     click() {
            //         restartNode(seroNode.type, 'main');
            //     },
            // },
            {
                label: 'Main Network',
                accelerator: 'CommandOrControl+Alt+2',
                checked: seroNode.isOwnNode && seroNode.isMainNetwork,
                enabled: seroNode.isOwnNode,
                type: 'checkbox',
                click() {
                    restartNode(seroNode.type, 'beta');
                },
            }
            // ,
            // {
            //     label: 'Alpha Network',
            //     accelerator: 'CommandOrControl+Alt+3',
            //     checked: seroNode.isOwnNode && seroNode.network === 'alpha',
            //     enabled: seroNode.isOwnNode,
            //     type: 'checkbox',
            //     click() {
            //         restartNode(seroNode.type, 'alpha');
            //     },
            // }
            // ,
            // {
            //     label: 'Develop Network',
            //     accelerator: 'CommandOrControl+Alt+4',
            //     checked: seroNode.isOwnNode && seroNode.isDevNetwork,
            //     enabled: seroNode.isExternalNode,
            //     type: 'checkbox',
            //     click() {
            //         restartNode(seroNode.type, 'dev');
            //     },
            // }
        ] });

    // Light mode switch should appear when not in Solo Mode (dev network)
    // if (seroNode.isOwnNode && seroNode.isGero && !seroNode.isDevNetwork) {
    //     devToolsMenu.push({
    //         label: 'Sync with Light client (beta)',
    //         enabled: true,
    //         checked: seroNode.isLightMode,
    //         type: 'checkbox',
    //         click() {
    //             restartNode('geth', null, (seroNode.isLightMode) ? 'fast' : 'light');
    //         },
    //     });
    // }

    // Enables mining menu: only in Solo mode and Ropsten network (testnet)
    // if (seroNode.isOwnNode && (seroNode.isTestNetwork || seroNode.isDevNetwork)) {
    //
    // }
    devToolsMenu.push({
        label: (global.mining) ? (i18n.t('mist.applicationMenu.develop.stopMining')  + '('+Settings.loadUserData('minerThread')+' Threads)'): (i18n.t('mist.applicationMenu.develop.startMining')+  '('+Settings.loadUserData('minerThread')+' Threads)'),
        accelerator: 'CommandOrControl+Shift+M',
        enabled: true,
        click() {
            if (global.mining) {
                stopMining(webviews);
            }else {
                try {
                    Windows.createPopup('configMining', {
                        electronOptions: {
                            width: 420,
                            height: 230,
                            alwaysOnTop: true,
                        },
                    });
                } catch (e) {
                    log.info(e);
                }
            }
        }
    });

    devToolsMenu.push({
        label: i18n.t('mist.applicationMenu.develop.hashrate.title'),
        enabled: true,
        click() {
            try {
                Windows.createPopup('hashrate', {
                    electronOptions: {
                        width: 420,
                        height: 260,
                        alwaysOnTop: true,
                    },
                });
            } catch (e) {
                log.info(e);
            }
        }
    });

    //
    // devToolsMenu.push({
    //     label: (global.mining) ? (i18n.t('mist.applicationMenu.develop.stopMining')  + '('+Settings.loadUserData('minerThread')+' Threads)'): (i18n.t('mist.applicationMenu.develop.startMining')+  '('+Settings.loadUserData('minerThread')+' Threads)'),
    //     accelerator: 'CommandOrControl+Shift+M',
    //     enabled: true,
    //     click() {
    //         if (global.mining) {
    //             stopMining(webviews);
    //         } else {
    //             startMining(webviews);
    //         }
    //     }
    // });

    //oneKeyRepair
    // devToolsMenu.push({
    //     label: i18n.t('mist.applicationMenu.develop.oneKeyRepair'),
    //     // label: 'One-key Repair',
    //     enabled: true,
    //     click() {
    //         try {
    //             Windows.createPopup('oneKeyRepair', {
    //                 electronOptions: {
    //                     width: 420,
    //                     height: 230,
    //                     alwaysOnTop: true,
    //                 },
    //             });
    //         } catch (e) {
    //             log.info(e);
    //         }
    //     },
    // });


    menu.push({
        label: ((global.mining) ? '⛏ ' : '') + i18n.t('mist.applicationMenu.develop.label'),
        submenu: devToolsMenu,
    });

    // WINDOW
    menu.push({
        label: i18n.t('mist.applicationMenu.window.label'),
        role: 'window',
        submenu: [
            {
                label: i18n.t('mist.applicationMenu.window.minimize'),
                accelerator: 'CommandOrControl+M',
                role: 'minimize',
            },
            {
                label: i18n.t('mist.applicationMenu.window.close'),
                accelerator: 'CommandOrControl+W',
                role: 'close',
            },
            {
                type: 'separator',
            },
            {
                label: i18n.t('mist.applicationMenu.window.toFront'),
                role: 'front',
            },
        ],
    });

    // HELP
    const helpMenu = [];

    if (process.platform === 'freebsd' || process.platform === 'linux' ||
            process.platform === 'sunos' || process.platform === 'win32') {
        helpMenu.push(
            {
                label: i18n.t('mist.applicationMenu.app.about', { app: Settings.appName }),
                click() {
                    Windows.createPopup('about', {
                        electronOptions: {
                            width: 420,
                            height: 230,
                            alwaysOnTop: true,
                        },
                    });
                },
            },
            {
                label: i18n.t('mist.applicationMenu.app.checkForUpdates'),
                click() {
                    updateChecker.runVisibly();
                },
            }
        );
    }
    helpMenu.push({
        label: i18n.t('mist.applicationMenu.help.mistWiki'),
        click() {
            shell.openExternal('https://github.com/sero-cash/wallet/wiki');
        },
    }, {
        label: i18n.t('mist.applicationMenu.help.gitter'),
        click() {
            shell.openExternal('https://gitter.im/sero-cash/wallet');
        },
    }, {
        label: i18n.t('mist.applicationMenu.help.reportBug'),
        click() {
            shell.openExternal('https://github.com/sero-cash/wallet/issues');
        },
    });

    menu.push({
        label: i18n.t('mist.applicationMenu.help.label'),
        role: 'help',
        submenu: helpMenu,
    });
    return menu;
};


module.exports = createMenu;
