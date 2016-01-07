angular.module('home', ['ngRoute'])
  .config(['$routeProvider', function($routeProvider) {
    $routeProvider.when('/home', {
      templateUrl: 'home/home.tpl.html',
      controller: 'HomeCtrl',
      controllerAs: 'home'
    });
  }])
  .controller('HomeCtrl', ['$scope', '$location', '$timeout', 'tools', function($scope, $location, $timeout, tools) {
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
      checked: exts.indexOf('avi') != -1 || true
    }, {
      ext: 'mp4',
      checked: exts.indexOf('mp4') != -1 || true
    }, {
      ext: 'mkv',
      checked: exts.indexOf('mkv') != -1 || true
    }, {
      ext: 'flv',
      checked: exts.indexOf('flv') != -1
    }, {
      ext: 'iso',
      checked: exts.indexOf('iso') != -1
    }];
    $scope.$watch('home.checkboxes', function() {
      $scope.home.updateSubmitStatus();
    }, true);



    $scope.home.getDirChooser = function(value) {
      var chooser = document.createElement('input');
      chooser.setAttribute('type', 'file');
      chooser.setAttribute('webkitdirectory', '');
      chooser.val = value || '';
      chooser.modified = value;
      chooser.addEventListener('change', function() {
        if (!this.value) {
          return;
        }
        this.val = this.value;
        if (!this.modified) {
          for (var d = $scope.home.directories.length - 1; d >= 0; d--) {
            if (d != this.index) {
              if ($scope.home.directories[d].val == this.val) {
                this.val = '';
                return;
              }
              if ($scope.home.directories[d].val.indexOf(this.val) != -1) {
                $scope.home.directories.splice(d, 1);
                break;
              }
              if (this.val.indexOf($scope.home.directories[d].val) != -1) {
                this.val = '';
                return;
              }
            }
          }
          this.modified = true;
          $scope.home.directories = [$scope.home.getDirChooser()].concat($scope.home.directories);
        } else {
          for (var d = $scope.home.directories.length - 1; d >= 0; d--) {
            if (d != this.index && $scope.home.directories[d].val == this.val) {
              $scope.home.directories.splice(this.index, 1);
            }
          }
        }
        $scope.home.updateSubmitStatus();
        $scope.$apply();
      });
      chooser.show = function() {
        this.click();
      };
      return chooser;
    };
    $scope.home.directories = [$scope.home.getDirChooser()];
    $scope.home.removeDirectory = function(index){
      $scope.home.directories.splice(index, 1);
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
      var browser = document.createElement('input');
      browser.setAttribute('type', 'file');
      browser.setAttribute('accept', '.exe,.app');
      browser.val = value || '';
      browser.addEventListener('change', function() {
        if (!this.value) {
          return;
        }
        this.val = this.value.replace(/\\/g, '/');
        $scope.home.updateSubmitStatus();
      });
      browser.show = function() {
        this.click();
      };
      return browser;
    };
    $scope.home.playerPath = $scope.home.getFileBrowser(localStorage.playerPath);
    $scope.home.clearPlayer = function() {
      $scope.home.playerPath.val = '';
    };
    $scope.home.findPlayer = function() {
      $scope.home.playerPath.show();
    };



    $scope.home.updateSubmitStatus = function() {
      if ($scope.home.directories.length == 1) {
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
