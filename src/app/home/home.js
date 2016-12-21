/*global path:false */

angular.module('home', ['ngRoute'])
  .config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/home', {
      templateUrl: 'home/home.tpl.html',
      controller: 'HomeCtrl',
      controllerAs: 'home'
    });
  }])
  .controller('HomeCtrl', ['$scope', '$location', '$timeout', function($scope, $location, $timeout) {
    console.log('HomeCtrl');
    $scope.home = this;


    // Set default values
    if (!localStorage.type) {
      localStorage.type = 'Unknow';
    }
    if (!localStorage.display) {
      localStorage.display = 'list';
    }
    if (!localStorage.sorting) {
      localStorage.sorting = 'name';
    }


    var exts = JSON.parse(localStorage.extentions || '[]');
    $scope.home.checkboxes = [{
      ext: 'avi',
      checked: exts.indexOf('avi') !== -1 || true
    }, {
      ext: 'mp4',
      checked: exts.indexOf('mp4') !== -1 || true
    }, {
      ext: 'mkv',
      checked: exts.indexOf('mkv') !== -1 || true
    }, {
      ext: 'flv',
      checked: exts.indexOf('flv') !== -1
    }, {
      ext: 'iso',
      checked: exts.indexOf('iso') !== -1
    }, {
      ext: 'part',
      checked: exts.indexOf('part') !== -1
    }];
    $scope.$watch('home.checkboxes', function() {
      $scope.home.updateSubmitStatus();
    }, true);



    $scope.home.getDirChooser = function(value) {
      return {
        val: value || '',
        modified: value,
        show: function() {
          const dirPaths = dialog.showOpenDialog(win, {
            title: 'Choose a directory...',
            defaultPath: this.val || app.getPath('home'),
            properties: ['openDirectory'],
          });

          if (!dirPaths || !dirPaths.length) {
            return;
          }

          this.val = dirPaths[0];

          if (!this.modified) {
            for (var d = $scope.home.directories.length - 1; d >= 0; d--) {
              if (d !== this.index) {
                if ($scope.home.directories[d].val === this.val) {
                  this.val = '';
                  return;
                }
                if ($scope.home.directories[d].val.indexOf(this.val) !== -1) {
                  $scope.home.directories.splice(d, 1);
                  continue;
                }
                if (~this.val.indexOf($scope.home.directories[d].val)) {
                  this.val = '';
                  return;
                }
              }
            }
            this.modified = true;
            $scope.home.directories = [$scope.home.getDirChooser()].concat($scope.home.directories);
          } else {
            for (var d = $scope.home.directories.length - 1; d >= 0; d--) {
              if (d !== this.index && $scope.home.directories[d].val === this.val) {
                $scope.home.directories.splice(this.index, 1);
              }
            }
          }
          $scope.home.updateSubmitStatus();
        }
      };
    };
    $scope.home.directories = [$scope.home.getDirChooser()];
    $scope.home.removeDirectory = function(index) {
      $scope.home.directories.splice(index, 1);
      $scope.home.updateSubmitStatus();
    };
    $scope.home.choose = function(index) {
      $scope.home.directories[index].index = index;
      $scope.home.directories[index].show();
    };

    var paths = JSON.parse(localStorage.path2browse || '[]');
    for (var p = paths.length - 1; p >= 0; p--) {
      $scope.home.directories.push($scope.home.getDirChooser(path.join(paths[p])));
    }

    $scope.home.getFileBrowser = function(value) {
      const extensions = [];
      switch (process.platform) {
        case 'darwin':
          extensions.push('app');
          break;
        case 'win32':
          extensions.push('exe');
          break;
        default:
          extensions.push('*');

      }

      return {
        val: value || '',
        show: function() {
          const filePaths = dialog.showOpenDialog(win, {
            title: 'Choose an application...',
            defaultPath: path.dirname(this.val || app.getPath('home')),
            properties: ['openFile'],
            filters: [{
              name: 'Application',
              extensions
            }]
          });

          if (!filePaths || !filePaths.length) {
            return;
          }
          this.val = filePaths[0].replace(/\\/g, '/');
          $scope.home.updateSubmitStatus();
        }
      };
    };
    $scope.home.playerPath = $scope.home.getFileBrowser(localStorage.playerPath);
    $scope.home.clearPlayer = function() {
      $scope.home.playerPath.val = '';
      $scope.home.updateSubmitStatus();
    };
    $scope.home.findPlayer = function() {
      $scope.home.playerPath.show();
    };



    $scope.home.updateSubmitStatus = function() {
      if ($scope.home.directories.length === 1) {
        return $scope.home.setSubmitStatus(false);
      }

      for (var c = $scope.home.checkboxes.length - 1; c >= 0; c--) {
        if ($scope.home.checkboxes[c].checked) {
          return $scope.home.setSubmitStatus(true);
        }
      }
      return $scope.home.setSubmitStatus(false);
    };
    $scope.home.setSubmitStatus = function(status) {
      $scope.home.next = status ? 'enabled' : '';
      $timeout();
    };


    $scope.home.launch = function(ok) {
      if (ok) {
        var dirs = [];
        var cbs = [];

        for (var d = $scope.home.directories.length - 1; d > 0; d--) {
          dirs.push($scope.home.directories[d].val.replace(/\\/g, '/'));
        }

        for (var c = $scope.home.checkboxes.length - 1; c >= 0; c--) {
          if ($scope.home.checkboxes[c].checked) {
            cbs.push($scope.home.checkboxes[c].ext);
          }
        }

        if (localStorage.playerPath === $scope.home.playerPath.val && localStorage.extentions === JSON.stringify(cbs) && localStorage.path2browse === JSON.stringify(dirs)) {
          $location.path(localStorage.display + '/' + localStorage.type);
        } else {
          localStorage.playerPath = $scope.home.playerPath.val;
          localStorage.extentions = JSON.stringify(cbs);
          localStorage.path2browse = JSON.stringify(dirs);

          $scope.main.updateDatabase(function() {
            $location.path(localStorage.display + '/' + localStorage.type);
          });
        }

        $scope.home.hidePop = true;
      }
    };
  }]);
