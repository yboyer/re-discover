const { app, BrowserWindow, Menu, autoUpdater } = require('electron');
const path = require('path');
const url = require('url');

let mainWindow;


let template = [{
  label: 'Edit',
  submenu: [{
    label: 'Undo',
    accelerator: 'CmdOrCtrl+Z',
    role: 'undo'
  }, {
    label: 'Redo',
    accelerator: 'Shift+CmdOrCtrl+Z',
    role: 'redo'
  }, {
    type: 'separator'
  }, {
    label: 'Cut',
    accelerator: 'CmdOrCtrl+X',
    role: 'cut'
  }, {
    label: 'Copy',
    accelerator: 'CmdOrCtrl+C',
    role: 'copy'
  }, {
    label: 'Paste',
    accelerator: 'CmdOrCtrl+V',
    role: 'paste'
  }, {
    label: 'Select All',
    accelerator: 'CmdOrCtrl+A',
    role: 'selectall'
  }]
}, {
  label: 'View',
  submenu: [{
    label: 'Toggle Full Screen',
    accelerator: (function() {
      if (process.platform === 'darwin') {
        return 'Ctrl+Command+F';
      } else {
        return 'F11';
      }
    })(),
    click: function(item, focusedWindow) {
      if (focusedWindow) {
        focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
      }
    }
  }, {
    label: 'Toggle Developer Tools',
    accelerator: (function() {
      if (process.platform === 'darwin') {
        return 'Alt+Command+I';
      } else {
        return 'Ctrl+Shift+I';
      }
    })(),
    click: function(item, focusedWindow) {
      if (focusedWindow) {
        focusedWindow.toggleDevTools();
      }
    }
  }]
}, {
  label: 'Window',
  role: 'window',
  submenu: [{
    label: 'Minimize',
    accelerator: 'CmdOrCtrl+M',
    role: 'minimize'
  }, {
    label: 'Close',
    accelerator: 'CmdOrCtrl+W',
    role: 'close'
  }]
}, {
  label: 'Help',
  role: 'help',
  submenu: [{
    enabled: false,
    label: `Version ${app.getVersion()}`
  }]
}];


function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    minWidth: 300,
    minHeight: 500,
    width: 1250,
    height: 690
  });

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function() {
    mainWindow = null;
  });
}

function addUpdateMenuItems(items, position) {
  if (process.mas) {return;}

  const version = app.getVersion();
  let updateItems = [{
    label: `Version ${version}`,
    enabled: false
  }, {
    label: 'Checking for Update',
    enabled: false,
    key: 'checkingForUpdate'
  }, {
    label: 'Check for Update',
    visible: false,
    key: 'checkForUpdate',
    click: function() {
      autoUpdater.checkForUpdates();
    }
  }, {
    label: 'Restart and Install Update',
    enabled: true,
    visible: false,
    key: 'restartToUpdate',
    click: function() {
      autoUpdater.quitAndInstall();
    }
  }];

  items.splice.apply(items, [position, 0].concat(updateItems));
}

// Make a single instance
const shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});
if (shouldQuit) {
  app.exit();
}


app.on('ready', () => {
  createWindow();
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  app.quit();
});

app.on('activate', function() {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});


if (process.platform === 'win32') {
  const helpMenu = template[template.length - 1].submenu;
  addUpdateMenuItems(helpMenu, 0);
}

if (process.platform === 'darwin') {
  const name = app.getName();
  template.unshift({
    label: name,
    submenu: [{
      label: `About ${name}`,
      role: 'about'
    }, {
      type: 'separator'
    }, {
      label: 'Services',
      role: 'services',
      submenu: []
    }, {
      type: 'separator'
    }, {
      label: `Hide ${name}`,
      accelerator: 'Command+H',
      role: 'hide'
    }, {
      label: 'Hide Others',
      accelerator: 'Command+Alt+H',
      role: 'hideothers'
    }, {
      label: 'Show All',
      role: 'unhide'
    }, {
      type: 'separator'
    }, {
      label: 'Quit',
      accelerator: 'Command+Q',
      click: function() {
        app.quit();
      }
    }]
  });

  // Window menu.
  template[3].submenu.push({
    type: 'separator'
  }, {
    label: 'Bring All to Front',
    role: 'front'
  });

  addUpdateMenuItems(template[0].submenu, 1);
}
