const electron = require('electron').remote;
const { app, shell, globalShortcut, dialog } = electron;
var fs = require('fs');
var path = require('path');
var https = require('https');
var win = electron.getCurrentWindow();
const { exec } = require('child_process');
var storageFolder = path.join(electron.app.getPath('home'), '.re-discover');
var postersPath = path.join(storageFolder, 'posters');

var fileUrl = function(str) {
  var pathName = path.resolve(str).replace(/\\/g, '/');

  if (pathName[0] !== '/') {
    pathName = '/' + pathName;
  }

  return encodeURI('file://' + pathName);
};
var filePosterPath = fileUrl(postersPath);


var Datastore = require('nedb'),
  db = new Datastore({
    filename: path.join(storageFolder, 'database.json'),
    autoload: true
  });

var psConfig = {
  minScrollbarLength: 20,
  suppressScrollX: true
};

angular.module('app', ['ngRoute', 'home', 'templates'])
  .config(['$routeProvider', function($routeProvider) {
    $routeProvider
      .when('/grid/:type', {
        templateUrl: 'grid/grid.tpl.html'
      })
      .when('/list/:type', {
        templateUrl: 'list/list.tpl.html'
      })
      .when('/duplicates/:type', {
        templateUrl: 'duplicates/duplicates.tpl.html'
      });
  }])
  .factory('tools', function() {
    return {
      _possibleLanguages: ['vff', 'vfq', 'vfi', 'vf2', 'vo', 'multi', 'french', 'truefrench'],
      downloadPoster: function(url, filename, callback) {
        https.get(url, function(response) {
          if (callback) {
            response.pipe(fs.createWriteStream(filename)).on('close', callback);
          } else {
            response.pipe(fs.createWriteStream(filename));
          }
        });
      },
      _removeEmptyElem: function(doc, done, step) {
        var tools = this;

        db.remove({
          _id: doc._id,
          updated: {
            $exists: false
          }
        }, {}, function() {
          // if element not removed
          db.update({
            path: doc.path
          }, {
            $set: {
              missing: true,
              duplicates: []
            }
          }, {}, function() {
            if (step) {
              step('Removing', tools.totalMissing);
            }
            if (--tools.totalMissing === 0) {
              done();
            }
          });
        });
      },
      _updateMissings: function(paths, done, step) {
        var tools = this;

        db.find({
          missing: {
            $ne: true
          },
          type: {
            $ne: 'Serie'
          },
          $where: function() {
            return paths.indexOf(this.path) === -1;
          }
        }, function(err, docs) {
          console.log('File missing:', docs.length, ':', docs);

          if (docs.length !== 0) {
            tools.totalMissing = docs.length;
            for (var d = docs.length - 1; d >= 0; d--) {
              tools._removeEmptyElem(docs[d], done, step);
            }
          } else {
            done();
          }
        });
      },
      updateDatabase: function(option) {
        var path2browse = JSON.parse(localStorage.path2browse || '[]');
        var tools = this;

        browseDirectories(path2browse, function(files) {
          var total = files.length;

          if (files.length === 0) {
            tools._updateMissings(files, option.done, option.step);
            return;
          }

          db.find({}, function(err, docs) {
            // Simplify the research of existant filenames
            var dbFilenames = {};
            for (var d = docs.length - 1; d >= 0; d--) {
              dbFilenames[docs[d].filename] = {
                path: docs[d].path,
                birthtime: docs[d].birthtime,
                quality: docs[d].quality,
                languages: docs[d].languages,
                duplicates: docs[d].duplicates,
                missing: docs[d].missing,
                size: docs[d].size
              };
            }


            var fileNames = [];
            var paths = [];
            for (var f = files.length - 1; f >= 0; f--) {
              var stat = fs.statSync(files[f]);
              var filename = path.parse(files[f]).name;
              var fullPath = path.join(files[f]);
              var size = Math.round(stat.size / 1048576);

              var quality = 'SD';
              if (/720/.test(filename)) {
                quality = 'HD';
              } else if (/1080/.test(filename)) {
                quality = 'Full HD';
              } else if (/2160/.test(filename) || /4K/i.test(filename)) {
                quality = 'Ultra HD';
              } else if (/4320/.test(filename) || /8K/i.test(filename)) {
                quality = '8K';
              }

              var languages = [];
              for (var p = tools._possibleLanguages.length - 1; p >= 0; p--) {
                if (new RegExp(tools._possibleLanguages[p], 'i').test(filename)) {
                  languages.push(tools._possibleLanguages[p].toUpperCase());
                }
              }

              var update;
              paths.push(fullPath);
              if (fileNames.indexOf(filename) === -1) {
                fileNames.push(filename);
                update = {
                  $set: {
                    path: fullPath,
                    birthtime: stat.birthtime,
                    quality: quality,
                    languages: languages,
                    duplicates: [],
                    missing: false,
                    size: size
                  }
                };
              } else {
                update = {
                  $push: {
                    duplicates: fullPath
                  }
                };
              }

              if (update.$set !== undefined && angular.equals(update.$set, dbFilenames[filename])) {
                if (--total === 0) {
                  tools._updateMissings(paths, option.done, option.step);
                }
              } else {
                db.update({
                  filename: filename,
                  clean_filename: filename.replace(/\.|\_/g, ' ').replace(/^\s*/, ''),
                  path: {
                    $exists: true
                  }
                }, update, {
                  upsert: true
                }, function() {
                  if (option.step) {
                    option.step('Adding', total);
                  }
                  // Find missing files
                  if (--total === 0) {
                    tools._updateMissings(paths, option.done, option.step);
                  }
                });
              }
            }
          });
        }, option.browsing);
      },
      removeEntry: function(id, callback) {
        fs.unlink(postersPath + '/' + id + '.jpg', function() {});
        fs.unlink(postersPath + '/_' + id + '.jpg', function() {});
        db.remove({
          _id: id
        }, {}, callback);
      }
    };
  })
  .filter('orderBrowser', function() {
    return function(items, param) {
      if (items === undefined) {
        return items;
      }
      console.time('Sort ' + param);

      var filtered = items.map(function(item) {
        return item;
      });

      switch (param) {
        case 'filename':
          filtered.sort(function(a, b) {
            return a.filename.localeCompare(b.filename);
          });
          break;

        case 'name':
          filtered.sort(function(a, b) {
            a.sortValue = a.name.charAt(0).removeDiacritics().toUpperCase();
            b.sortValue = b.name.charAt(0).removeDiacritics().toUpperCase();

            return Intl.Collator().compare(a.name, b.name);
          });
          break;

        case 'release':
          filtered.sort(function(a, b) {
            var asortDate = a.date || a.date_first;
            var bsortDate = b.date || b.date_first;
            a.sortValue = asortDate ? asortDate.getFullYear() : '----';
            b.sortValue = asortDate ? asortDate.getFullYear() : '----';

            return (bsortDate || 0) - (asortDate || 0);
          });
          break;

        case 'birthtime':
          filtered.sort(function(a, b) {
            a.sortValue = a.birthtime ? (a.birthtime.getMonth() + 1).twoDigits() + '/' + a.birthtime.getFullYear() : '--/----';
            b.sortValue = b.birthtime ? (b.birthtime.getMonth() + 1).twoDigits() + '/' + b.birthtime.getFullYear() : '--/----';

            return (b.birthtime || 0) - (a.birthtime || 0);
          });
          break;

        case 'season':
          filtered.sort(function(a, b) {
            a.sortValue = 'Season ' + a.season;
            b.sortValue = 'Season ' + b.season;

            var season = a.season - b.season;
            if (season !== 0) {
              return season;
            }

            return a.episode - b.episode;
          });
          break;
      }
      console.timeEnd('Sort ' + param);

      return filtered;
    };
  })
  .directive('compile', ['$compile', function($compile) {
    return function(scope, element, attrs) {
      scope.$watch(attrs.compile, function(value) {
        element.html(value);
        $compile(element.contents())(scope);
      });
    };
  }])
  .controller('MainCtrl', ['$scope', '$sce', '$location', '$timeout', 'tools', function($scope, $sce, $location, $timeout, tools) {
    console.log('MainCtrl');
    $scope.main = this;
    $scope.main.home = true;
    $scope.main.typeSections = [
      [],
      []
    ];
    $scope.main.genres = [];


    // Sidebar
    $scope.sidebar = {};
    $scope.sidebar.element = document.querySelector('.sidebar #sections');
    $scope.sidebar.updateScrollbar = function() {
      Ps.update($scope.sidebar.element);
    };
    Ps.initialize($scope.sidebar.element, psConfig);
    win.on('resize', $scope.sidebar.updateScrollbar);

    // Status message
    $scope.main.message = {
      messageNumber: 0,
      queueStatus: []
    };
    $scope.main.status = {
      spinner: '',
      text: ''
    };
    $scope.main.setMessage = function(data) {
      data.id = $scope.main.message.messageNumber++;

      var newStatus;

      console.info(data.text);

      if ($scope.main.status.show && $scope.main.status.spinner && !$scope.main.status.force) {
        if (data.removeId === $scope.main.status.id) {
          if (!data.spinner) {
            newStatus = $scope.main.message.queueStatus.pop();
          }

          if (!newStatus) {
            newStatus = data;
          }

        } else {
          if (data.removeId !== undefined) {
            for (var i = $scope.main.message.queueStatus.length - 1; i >= 0; i--) {
              if ($scope.main.message.queueStatus[i].id === data.removeId) {
                $scope.main.message.queueStatus.splice(i, 1);
                break;
              }
            }
          }

          if (data.spinner) {
            $scope.main.message.queueStatus.push(angular.copy($scope.main.status));

            newStatus = data;
          } else {
            return;
          }

        }
      } else {
        newStatus = data;
      }

      $timeout.cancel($scope.main.message.timeoutStatus);
      $scope.main.status.id = newStatus.id;
      $scope.main.status.show = 'show';
      $scope.main.status.spinner = newStatus.spinner ? 'spinner' : '';
      $scope.main.status.text = newStatus.text;
      $scope.main.status.force = newStatus.force;
      if (!newStatus.spinner || newStatus.force) {
        $scope.main.message.timeoutStatus = $timeout(function() {
          if ($scope.main.message.default === undefined) {
            $scope.main.status.show = '';
          } else {
            $scope.main.status.spinner = '';
            $scope.main.status.text = $scope.main.message.default;
          }
        }, 3000);
      }

      $timeout();

      return data.id;
    };
    $scope.main.setDefault = function(msg) {
      $timeout(function() {
        $scope.main.status.show = 'show';
        $scope.main.message.default = msg;
      });
    };

    $scope.main.checkUpdates = function() {
      requestAsync('https://raw.githubusercontent.com/yboyer/re-discover/master/package.json', function(status, res) {
        if (status === 200) {
          var version = JSON.parse(res).version;
          if (version !== app.getVersion()) {
            $scope.main.setDefault('<div ng-click="main.openReleasePage(\'' + version + '\')" class="link">Update available ! (v' + version + ')</div>');
          }
        }
      });
    };
    $scope.main.openReleasePage = function(tag) {
      shell.openExternal('https://github.com/yboyer/re-discover/releases/tag/v' + tag);
    };

    $scope.main.updateDatabase = function(callback) {
      if ($scope.main.databaseBusy) {
        return;
      }

      var dirs = 0;

      $scope.main.databaseBusy = true;
      var idMsg;
      tools.updateDatabase({
        done: function() {
          $scope.main.databaseBusy = false;
          $scope.main.setMessage({
            removeId: idMsg,
            text: 'Database updated'
          });

          $scope.main.updateSideBar();

          if (callback) {
            callback();
          } else {
            $scope.$broadcast('updateList');
          }
        },
        browsing: function(dir) {
          idMsg = $scope.main.setMessage({
            removeId: idMsg,
            spinner: true,
            text: 'Updating the database... (Browsing folder n°' + (++dirs) + ': “' + /([^(\/|\\)]*)\/*$/.exec(dir)[1] + '”)'
          });
        },
        step: function(action, nb) {
          idMsg = $scope.main.setMessage({
            removeId: idMsg,
            spinner: true,
            text: 'Updating the database... (' + action + ' file n°' + nb + ')'
          });
        }
      });
    };

    $scope.main.setHome = function() {
      $scope.main.home = true;
      $timeout(function() {
        $location.path('home');
      });
    };
    $scope.main.unsetHome = function() {
      $scope.main.home = false;
    };

    $scope.main.setView = function() {
      db.find({
        type: {
          $ne: 'Episode'
        }
      }).sort({
        type: 1
      }).exec(function(err, docs) {
        if (docs.length === 0) {
          if (!localStorage.hasOwnProperty('path2browse')) {
            $scope.main.setHome();
            return;
          } else {
            $scope.main.displayType('All');
          }
        } else {
          if ('All' === localStorage.type) {
            $location.url(localStorage.display + '/' + localStorage.type);
          } else {
            for (var d = docs.length - 1; d >= 0; d--) {
              if (
                'All' === localStorage.type ||
                docs[d].type === localStorage.type ||
                'Missing' === localStorage.type && docs[d].missing === true ||
                'Unknow' === localStorage.type && docs[d].type === undefined
              ) {
                $location.url(localStorage.display + '/' + localStorage.type);
                return;
              }
            }
            $scope.main.displayType('All');
          }
        }
      });
    };

    $scope.main.updateSideBar = function() {
      $scope.main.updateGenres();
      $scope.main.updateCategories();
    };
    $scope.main.updateCategories = function() {
      console.time('updateCategories');

      db.find({
        type: {
          $ne: 'Episode'
        }
      }).sort({
        type: 1,
        duplicates: 1,
        missing: 1
      }).exec(function(err, docs) {
        $scope.main.typeSections = [
          [],
          []
        ];

        for (var d = docs.length - 1; d >= 0; d--) {
          var type = docs[d].type || 'Unknow';
          var haveDuplicate = docs[d].duplicates && docs[d].duplicates.length !== 0;
          var isMissing = docs[d].missing;

          if ($scope.main.typeSections[0].indexOf(type) === -1) {
            $scope.main.typeSections[0].push(type);
          }

          if ($scope.main.typeSections[1].indexOf('Duplicate') === -1 && haveDuplicate) {
            $scope.main.typeSections[1].push('Duplicate');
          }

          if ($scope.main.typeSections[1].indexOf('Missing') === -1 && isMissing) {
            $scope.main.typeSections[1].push('Missing');
          }

          if (!docs[d].type && !haveDuplicate) {
            break;
          }
        }

        $scope.$apply();
        $scope.sidebar.updateScrollbar();
        console.timeEnd('updateCategories');
      });
    };
    $scope.main.updateGenres = function(query) {
      console.time('updateGenres');

      if (query) {
        $scope.main.genreQuery = query;
      }

      if (['Unknow', 'Duplicate'].indexOf($scope.main.type) !== -1) {
        $scope.main.genres.length = 0;
        $timeout(function() {
          $scope.sidebar.updateScrollbar();
        });
        console.timeEnd('updateGenres');
        return;
      }

      db.find($scope.main.genreQuery).sort({
        genre: 1
      }).exec(function(err, docs) {
        $scope.main.genres.length = 0;
        for (var d = docs.length - 1; d >= 0; d--) {
          var genres = docs[d].genre;
          if (!genres) {
            break;
          }
          for (var g = genres.length - 1; g >= 0; g--) {
            if ($scope.main.genres.indexOf(genres[g]) === -1) {
              $scope.main.genres.push(genres[g]);
            }
          }
        }
        $scope.$apply();
        console.timeEnd('updateGenres');
        $scope.sidebar.updateScrollbar();
      });
    };

    $scope.main.displayGenre = function(genre) {
      $location.search('genre', genre);
    };
    $scope.main.displayType = function(type) {
      if (type === 'Duplicate') {
        $location.url('duplicates/' + type);
        return;
      }

      localStorage.type = type.match(/^\w+/)[0];
      $location.url(localStorage.display + '/' + type);
    };


    // Preload posters and clean the 'posters' folder
    db.find({}, function(err, docs) {
      var ids = [];
      for (var d = docs.length - 1; d >= 0; d--) {
        ids.push(docs[d]._id);
      }

      fs.readdir(postersPath, function(err, files) {
        if (err) {
          fs.mkdirSync(postersPath);
        } else {
          for (var f = files.length - 1; f >= 0; f--) {
            if (ids.indexOf(path.parse(files[f]).name.replace('_', '')) === -1) {
              fs.unlink(files[f],
                function() {

                });
            } else {
              var img = document.createElement('img');
              img.src = filePosterPath + '/' + files[f];
            }
          }
        }
      });
    });


    // Listerners
    window.addEventListener('beforeunload', function(e) {
      e.returnValue = false;

      if ($scope.main.status.show && $scope.main.status.spinner) {
        const id = dialog.showMessageBox(win, {
          message: 'The application is currentely on process.',
          detail: 'Do you want to quit the app anyway ?',
          defaultId: 1,
          buttons: ['Yes', 'Cancel']
        });

        if (id === 0) {
          app.exit();
        }
      }
    });

    globalShortcut.register('F5', function () {
      $scope.main.updateDatabase();
    });

    globalShortcut.register('CmdOrCtrl+Shift+Delete', function () {
      const id = dialog.showMessageBox(win, {
        message: 'Warning !',
        detail: 'Do you really want reset the app as default ?',
        defaultId: 1,
        buttons: ['Yes', 'Cancel']
      });

      if (id === 0) {
        db.remove({}, {
          multi: true
        }, function() {
          db.loadDatabase(function() {
            localStorage.clear();
            fs.readdir(postersPath, function(err, files) {
              for (var f = files.length - 1; f >= 0; f--) {
                fs.unlinkSync(postersPath + '/' + files[f]);
              }
              exec(process.execPath);
              app.quit();
            });
          });
        });
      }
    });

    $scope.main.checkUpdates();
    $scope.main.setView();
    if (localStorage.path2browse !== undefined) {
      $scope.main.updateCategories();
      $scope.main.updateDatabase();
    }
  }])
  .controller('BrowserCtrl', ['$scope', '$routeParams', '$location', '$timeout', '$filter', 'tools', function($scope, $routeParams, $location, $timeout, $filter, tools) {
    console.log('BrowserCtrl');
    $scope.browser = this;
    $scope.find = {};
    $scope.display = {};

    var movieRegexp = /.+?(?=(\s*)?(\d{4}|\())/;
    var SXXEXXRegexp = /S(\d{1,})E(\d{1,})/i;
    var episodeRegexp = /.+?(?=(\s*)?(S\d{1,}))/i;
    var SXXEXXRegexpPattern = /\s\[S(\d{1,})E(\d{1,})\]/;


    // Set scroll event for dividers
    var elementsContainer = document.querySelector('.wrapElems');
    var divider = elementsContainer.querySelector('.divider.static');
    if (document.querySelector('.browser').classList.contains('list')) {
      elementsContainer.addEventListener('scroll', function() {
        var dividers = elementsContainer.querySelectorAll('.divider:not(.static)');
        if (dividers.length === 0) {
          return;
        }

        var scrollTop = this.scrollTop;
        for (var d = dividers.length - 1; d >= 0; d--) {
          var offsetTop = dividers[d].offsetTop;
          var offsetHeight = dividers[d].offsetHeight;

          if (scrollTop > offsetTop - offsetHeight) {
            if (divider.part !== d) {
              divider.status = '';
              divider.part = d;
            }
            if (scrollTop >= offsetTop) {
              if (divider.status === 'static') {
                return;
              }
              divider.status = 'static';
              divider.textContent = dividers[d].textContent;
              divider.style.top = '';
              divider.classList.remove('bottom');
            } else if (divider.status !== 'bottom') {
              divider.status = 'bottom';
              divider.textContent = dividers[d - 1].textContent;
              divider.style.top = offsetTop - offsetHeight + 'px';
              divider.classList.add('bottom');
            }
            return;
          }
        }
      });
    }
    $scope.browser.resetScroll = function() {
      elementsContainer.scrollTop = 0;
      if (!divider) {
        return;
      }
      divider.textContent = '';
      divider.status = '';
    };


    // Scrollbar
    Ps.initialize(elementsContainer, psConfig);
    $scope.browser.updateScrollbar = function() {
      $scope.browser.checkBrowserElements();
      Ps.update(elementsContainer);
    };
    win.on('resize', $scope.browser.updateScrollbar);

    // see-more
    $scope.main.displayed = $scope.browser.limitElements = $scope.browser.elementsPerPages = 100;
    $scope.browser.checkBrowserElements = function() {
      while (!$scope.browser.needStop() && elementsContainer.scrollTop + elementsContainer.offsetHeight >= elementsContainer.scrollHeight - 500) {
        $scope.browser.nextElements();
        $scope.browser.updateScrollbar();
      }
    };
    $scope.browser.nextElements = function() {
      console.time('increaseElementNumber');
      $scope.$apply(function() {
        $scope.browser.limitElements += $scope.browser.elementsPerPages;
        $scope.main.displayed = $scope.browser.limitElements;
      });
      console.timeEnd('increaseElementNumber');
    };
    $scope.browser.needStop = function() {
      var nbElem = $scope.browser.elements ? $scope.browser.elements.length : 0;
      return nbElem <= $scope.browser.limitElements;
    };
    elementsContainer.addEventListener('scroll', $scope.browser.checkBrowserElements);


    $scope.browser.disableFull = JSON.parse(localStorage.disableFull || 'false');
    $scope.browser.toggleFull = function() {
      $scope.browser.disableFull = localStorage.disableFull = !$scope.browser.disableFull;
      $timeout(function() {
        $scope.browser.updateScrollbar();
      });
    };
    $scope.browser.display = localStorage.display;
    $scope.browser.toggleDisplay = function() {
      if (localStorage.display === 'list') {
        $location.url($location.url().replace('list', 'grid'));
        localStorage.display = 'grid';
      } else {
        $location.url($location.url().replace('grid', 'list'));
        localStorage.display = 'list';
      }
    };

    $scope.browser.sorts = [{
      type: 'season',
      value: 'Season'
    }, {
      type: 'name',
      value: 'Alphabetical'
    }, {
      type: 'release',
      value: 'Release date'
    }, {
      type: 'birthtime',
      value: 'File date'
    }];
    $scope.browser.setSorting = function(sort) {
      $scope.browser.sorting = sort.type;

      if (sort.type !== 'season') {
        localStorage.sorting = sort.type;
      }

      $scope.browser.sortingName = sort.value;
      $scope.browser.sortElements();
      $timeout(function() {
        $scope.browser.updateScrollbar();
      });
    };


    $scope.browser.searchKD = function(e) {
      if (e.keyCode === 27) {
        e.target.blur();
        $scope.browser.searchValue = '';
        $scope.browser.updateList();
      }
    };


    $scope.browser.searchValue = '';
    $scope.browser.sorting = $location.search().sorting || localStorage.sorting;
    for (var s = $scope.browser.sorts.length - 1; s >= 0; s--) {
      if ($scope.browser.sorts[s].type === $scope.browser.sorting) {
        $scope.browser.sortingName = $scope.browser.sorts[s].value;
        break;
      }
    }
    $scope.browser.type = $routeParams.type;
    $scope.browser.genre = $location.search().genre || 'All';
    $scope.browser.serie_id = $location.search().serie_id;
    $scope.main.type = $scope.browser.type;
    $scope.main.genre = $scope.browser.genre;



    $scope.browser.query = {};
    if ($scope.browser.serie_id) {
      $scope.browser.query.serie_id = $scope.browser.serie_id;
    }
    switch ($scope.browser.type) {
      case 'All':
        $scope.browser.query.type = {
          $ne: 'Episode'
        };
        break;
      case 'Duplicate':
        $scope.browser.query.duplicates = {
          $exists: true
        };
        $scope.browser.query['duplicates.length'] = {
          $ne: 0
        };
        break;
      case 'Missing':
        $scope.browser.query.missing = true;
        break;
      case 'Unknow':
        $scope.browser.query.type = {
          $exists: false
        };
        break;
      default:
        $scope.browser.query.type = $scope.browser.type;
        if ($scope.browser.type !== 'Episode') {
          $scope.browser.query.missing = {
            $ne: true
          };
        }
    }
    $scope.main.updateGenres(angular.copy($scope.browser.query));
    if ($scope.browser.genre !== 'All') {
      if ($scope.browser.genre === 'Unknow') {
        $scope.browser.query.genre = {
          $exists: false
        };
      } else {
        $scope.browser.query.genre = $scope.browser.genre;
      }
    }

    if ($scope.browser.serie_id) {
      db.findOne({
        _id: $scope.browser.serie_id
      }, function(err, doc) {
        $scope.browser.searchIn = doc.title_fr;
      });
    } else if ($scope.browser.type !== 'All') {
      $scope.browser.searchIn = $scope.browser.type + 's';
    } else {
      $scope.browser.searchIn = '';
    }


    function setRead(_id) {
      db.update({
        _id: _id
      }, {
        $set: {
          readed: true
        }
      }, {}, function() {
        $scope.browser.updateList();
      });
    }

    $scope.browser.startPlayer = function(filePath) {
      if (localStorage.playerPath) {
        exec('"' + localStorage.playerPath + '" "' + filePath + '"');
      } else {
        shell.openItem(filePath);
      }
      $scope.main.setMessage({
        spinner: true,
        text: 'Starting the player..',
        force: true
      });
    };
    $scope.browser.play = function(e, _id) {
      e.stopPropagation();

      db.findOne({
        _id: _id
      }, function(err, doc) {
        // If the file exists
        fs.stat(doc.path, function(err) {
          if (err) {
            var idMsg = $scope.main.setMessage({
              spinner: true,
              text: 'File missing... Updating database...'
            });

            tools.updateDatabase({
              done: function() {
                $scope.main.setMessage({
                  removeId: idMsg,
                  text: 'Database updated'
                });

                $scope.main.updateSideBar();

                // Update the display the missing or not element
                $scope.browser.updateList({
                  callback: function() {
                    db.findOne({
                      _id: _id
                    }, function(err, doc) {
                      if (doc.missing) {
                        if (window.confirm('"' + doc.path + '" is missing. Do you want to remove it from the list ?')) {
                          if (doc.serie_id !== undefined) {
                            db.count({
                              serie_id: doc.serie_id,
                              _id: {
                                $ne: _id
                              }
                            }, function(err, count) {
                              if (count === 0) {
                                tools.removeEntry(doc.serie_id, function() {
                                  $scope.main.updateSideBar();
                                  $scope.main.displayType('All');
                                });
                              }
                            });
                          }

                          tools.removeEntry(_id, function(err, count) {
                            if (count !== 0) {
                              $scope.main.setMessage({
                                text: 'Removed'
                              });
                              $scope.browser.updateList();
                              $scope.main.updateSideBar();
                            }
                          });
                        }
                      } else {
                        $scope.browser.startPlayer(doc.path);
                        setRead(doc._id);
                      }
                    });
                  }
                });
              }
            });
            return false;
          } else if (doc.missing) {
            db.update({
              _id: doc._id
            }, {
              $set: {
                missing: false
              }
            }, {}, function() {
              $scope.browser.updateList();
            });
          }
          $scope.browser.startPlayer(doc.path);
          setRead(doc._id);
        });
      });
    };
    $scope.browser.goToEpisodes = function(e, id) {
      e.stopPropagation();
      $scope.main.displayType('Episode?serie_id=' + id + '&sorting=season');
    };

    $scope.browser.dirname = function(filePath) {
      return path.dirname(filePath);
    };


    $scope.display.show = function(e, id) {
      e.stopPropagation();

      db.findOne({
        _id: id
      }, function(e, d) {
        if (!d.updated) {
          $scope.display.showItem(d.path);
          return;
        }
        if (d.date) {
          d.date = d.date.toLocaleDateString('en-GB');
        } else if (d.date_first) {
          d.date = d.date_first.toLocaleDateString('en-GB') + ' - ' + d.date_last.toLocaleDateString('en-GB');
        }
        if (d.size) {
          d.size = readableBytes(d.size);
        }
        d.posterBackgroundUrl = d.poster_url ? 'background-image: url(\'' + filePosterPath + '/' + d._id + '.jpg?' + d.update_orig + '\')' : '';
        $scope.display.element = d;
        $scope.browser.status = 'display';
        $scope.$apply();
      });
    };
    $scope.display.close = function() {
      $scope.browser.status = '';
    };
    $scope.display.openPoster = function(id) {
      shell.openItem(postersPath + '/' + id + '.jpg');
    };
    $scope.display.showItem = function(itemPath) {
      shell.showItemInFolder(itemPath);
    };
    $scope.display.openIMDB = function() {
      shell.openExternal('http://www.imdb.com/title/' + $scope.display.element.imdb_id + '/');
    };
    $scope.display.openTMBD = function() {
      if ($scope.display.element.type === 'Episode') {
        db.findOne({
          _id: $scope.display.element.serie_id
        }, function(err, doc) {
          shell.openExternal('https://www.themoviedb.org/tv/' + doc.tmdb_id + '/season/' + $scope.display.element.season + '/episode/' + $scope.display.element.episode);
        });
      } else if ($scope.display.element.type === 'Serie') {
        shell.openExternal('https://www.themoviedb.org/tv/' + $scope.display.element.tmdb_id);
      } else {
        shell.openExternal('https://www.themoviedb.org/movie/' + $scope.display.element.tmdb_id);
      }
    };

    $scope.find.results = [];
    $scope.find.resultsHighlight = [];
    $scope.find.resetHeight = function() {
      document.querySelector('.choose').style.height = '';
    };
    $scope.find.updateHeight = function() {
      document.querySelector('.choose').style.height = document.querySelector('.choose #results').offsetHeight + 125 + 'px';
    };
    $scope.find.updateScrollbar = function() {
      if ($scope.find.scrollElement) {
        Ps.update($scope.find.scrollElement);
      }
    };
    win.on('resize', $scope.find.updateScrollbar);
    $scope.find.searchKD = function(e, force) {
      if (force || e.keyCode === 13) {
        if (e) {
          e.target.blur();
        }
        var value = $scope.find.searchValue;

        $scope.find.searchInfo = 'Searching “' + value + '”...';
        $scope.find.spinner = 'spinner';

        $scope.find.getSuggestion(value, function() {
          $scope.find.resetHeight();
          $scope.find.searchInfo = 'Result for “' + value + '”';
          $scope.find.listOk = true;
          $scope.find.spinner = '';
          $scope.$apply();

          $scope.find.updateHeight();
          $scope.find.updateScrollbar();
        }, function() {
          $scope.find.searchInfo = 'Error when searching for “' + value + '”... Maybe the internet connection';
          $scope.find.spinner = '';
          $scope.$apply();
        });
      }
    };
    $scope.find.range = function(num) {
      return new Array(num);
    };
    $scope.find.updateMovie = function(data) {
      if (!data.updated) {
        $scope.main.setMessage({
          text: 'Item not completely loaded.'
        });
        return;
      }

      var referenceId = $scope.find.referenceId;

      db.update({
        _id: referenceId
      }, {
        $set: {
          imdb_id: data.imdb_id,
          tmdb_id: data.tmdb_id,
          actors: data.actors,
          director: data.director,
          genre: data.genre,
          abstract_en: data.abstract_en,
          abstract_fr: data.abstract_fr,
          poster_url: data.poster,
          runtime: data.runtime,
          title: data.title,
          title_fr: data.title_fr,
          title_en: data.title_en,
          type: data.type,
          date: data.date,
          metascore: data.metascore,
          updated: true
        }
      }, {}, function() {
        $scope.browser.checkType();
        $scope.main.updateSideBar();
        if (data.poster) {
          var idMsgSmall = $scope.main.setMessage({
            spinner: true,
            text: 'Downloading small poster for “' + data.title_fr + '”...'
          });
          tools.downloadPoster(data.poster.replace('_SIZE_', 'SY' + Math.ceil(195 * window.devicePixelRatio)), postersPath + '/_' + referenceId + '.jpg', function() {
            db.update({
              _id: referenceId
            }, {
              $set: {
                update_small: Date.now()
              }
            }, {}, function() {
              $scope.browser.updateList();
            });

            var idMsgOrig = $scope.main.setMessage({
              removeId: idMsgSmall,
              spinner: true,
              text: 'Downloading original poster for “' + data.title_fr + '”...'
            });
            tools.downloadPoster(data.poster.replace('_SIZE_', 'SY1500').replace('w154', 'original'), postersPath + '/' + referenceId + '.jpg', function() {
              db.update({
                _id: referenceId
              }, {
                $set: {
                  update_orig: Date.now()
                }
              }, {}, function() {
                $scope.browser.updateList();
              });

              $scope.main.setMessage({
                removeId: idMsgOrig,
                text: 'Original poster downloaded for “' + data.title_fr + '”'
              });
            });
          });
        } else {
          $scope.main.setMessage({
            text: 'Updated'
          });
        }
        $scope.browser.updateList();
        $scope.find.close();
      });
    };
    $scope.find.updateSerie = function(data, callback) {
      var serie = {
        tmdb_id: data.tmdb_id,
        imdb_id: data.imdb_id,
        title: data.title,
        title_en: data.title_en,
        title_fr: data.title_fr,
        date_first: data.date_first,
        date_last: data.date_last,
        actors: data.actors,
        genre: data.genre,
        type: 'Serie',
        abstract_fr: data.abstract_fr,
        abstract_en: data.abstract_en,
        poster_url: data.poster,
        seasons: [],
        updated: true
      };
      for (var s = 0, sl = data.seasons.length; s < sl; s++) {
        serie.seasons.push({
          tmdb_id: data.seasons[s].id,
          date: new Date(data.seasons[s].air_date),
          episode_count: data.seasons[s].episode_count,
          season_number: data.seasons[s].season_number
        });
      }

      db.update({
        tmdb_id: serie.tmdb_id
      }, {
        $set: serie
      }, {
        upsert: true
      }, function() {
        db.findOne({
          tmdb_id: serie.tmdb_id
        }, function(err, doc) {
          callback(doc._id);
          $scope.main.updateSideBar();

          if (doc.poster_url) {
            var idMsgSmall = $scope.main.setMessage({
              spinner: true,
              text: 'Downloading small poster for “' + doc.title_fr + '”...'
            });
            tools.downloadPoster(doc.poster_url.replace('_SIZE_', 'SY' + Math.ceil(195 * window.devicePixelRatio)), postersPath + '/_' + doc._id + '.jpg', function() {
              db.update({
                _id: doc._id
              }, {
                $set: {
                  update_small: Date.now()
                }
              });

              var idMsgOrig = $scope.main.setMessage({
                removeId: idMsgSmall,
                spinner: true,
                text: 'Downloading original poster for “' + doc.title_fr + '”...'
              });
              tools.downloadPoster(doc.poster_url.replace('_SIZE_', 'SY1500'), postersPath + '/' + doc._id + '.jpg', function() {
                db.update({
                  _id: doc._id
                }, {
                  $set: {
                    update_orig: Date.now()
                  }
                });

                $scope.main.setMessage({
                  removeId: idMsgOrig,
                  text: 'Original poster downloaded for “' + doc.title_fr + '”'
                });
              });
            });
            $scope.browser.updateList();
          }
        });
      });
    };
    $scope.find.updateEpisode = function(data, season_num, episode_num) {
      var referenceId = $scope.find.referenceId;
      $scope.find.updateSerie(data, function(serie_id) {

        var episode = {
          serie_id: serie_id
        };

        // Remove serie if it's the last episode of it
        db.findOne({
          _id: referenceId
        }, function(err, doc) {
          if (doc.serie_id === serie_id) {
            return;
          }
          db.count({
            serie_id: doc.serie_id,
            _id: {
              $ne: referenceId
            }
          }, function(err, count) {
            if (count === 0) {
              tools.removeEntry(doc.serie_id, function() {
                $scope.main.updateSideBar();
              });
            }
          });
        });

        data.req = requestAsync('http://api.themoviedb.org/3/tv/' + data.tmdb_id + '/season/' + season_num + '/episode/' + episode_num + '?api_key=021644aa1434cc7ca6839a63a3877d70&language=fr', function(status, tmdbInfo) {
          if (status === 200) {
            tmdbInfo = JSON.parse(tmdbInfo);

            episode.tmdb_id = tmdbInfo.id;
            episode.title_fr = tmdbInfo.name;
            episode.abstract_fr = tmdbInfo.overview;
            episode.date = new Date(tmdbInfo.air_date);

            episode.guests = [];
            for (var g = 0, gl = tmdbInfo.guest_stars.length; g < gl; g++) {
              episode.guests.push(tmdbInfo.guest_stars[g].name);
            }

            data.req = requestAsync('http://api.themoviedb.org/3/tv/' + data.tmdb_id + '/season/' + season_num + '/episode/' + episode_num + '/external_ids?api_key=021644aa1434cc7ca6839a63a3877d70', function(status, tmdbInfo) {
              if (status === 200) {
                tmdbInfo = JSON.parse(tmdbInfo);
                episode.imdb_id = tmdbInfo.imdb_id;

                data.req = requestAsync('http://www.omdbapi.com/?i=' + data.imdb_id + '&Season=' + season_num + '&Episode=' + episode_num + '&plot=short&r=json', function(status, omdbInfo) {
                  if (status === 200) {
                    omdbInfo = JSON.parse(omdbInfo);
                    if (omdbInfo.Response !== "False") {
                      var poster = omdbInfo.Poster;
                      if (poster !== 'N/A') {
                        var replace = poster.split('.');
                        replace = replace[replace.length - 2];
                        poster = poster.replace(replace, '_SIZE_');
                      } else {
                        poster = '';
                      }

                      episode.title_en = omdbInfo.Title;
                      episode.actors = omdbInfo.Actors.split(', ');
                      episode.director = omdbInfo.Director;
                      episode.genre = omdbInfo.Genre.split(', ');
                      episode.abstract_en = omdbInfo.Plot;
                      episode.poster_url = poster;
                      episode.runtime = omdbInfo.Runtime;
                      episode.writer = omdbInfo.Writer.split(', ');
                      episode.metascore = parseInt(omdbInfo.Metascore);
                      episode.type = 'Episode';
                      episode.updated = true;

                      episode.season = season_num;
                      episode.episode = episode_num;

                      db.update({
                        _id: referenceId
                      }, {
                        $set: episode
                      }, {}, function() {
                        $scope.browser.checkType();
                        $scope.main.updateSideBar();
                        if (episode.poster_url) {
                          var idMsgSmall = $scope.main.setMessage({
                            spinner: true,
                            text: 'Downloading small poster for “' + (episode.title_fr || episode.title_en) + '”...'
                          });
                          tools.downloadPoster(episode.poster_url.replace('_SIZE_', 'SY' + Math.ceil(195 * window.devicePixelRatio)), postersPath + '/_' + referenceId + '.jpg', function() {
                            db.update({
                              _id: referenceId
                            }, {
                              $set: {
                                update_small: Date.now()
                              }
                            }, {}, function() {
                              $scope.browser.updateList();
                            });

                            var idMsgOrig = $scope.main.setMessage({
                              removeId: idMsgSmall,
                              spinner: true,
                              text: 'Downloading original poster for “' + (episode.title_fr || episode.title_en) + '”...'
                            });
                            tools.downloadPoster(episode.poster_url.replace('_SIZE_', 'SY1500'), postersPath + '/' + referenceId + '.jpg', function() {
                              db.update({
                                _id: referenceId
                              }, {
                                $set: {
                                  update_orig: Date.now()
                                }
                              }, {}, function() {
                                $scope.browser.updateList();
                              });

                              $scope.main.setMessage({
                                removeId: idMsgOrig,
                                text: 'Original poster downloaded for “' + (episode.title_fr || episode.title_en) + '”'
                              });
                            });
                          });
                        } else {
                          $scope.main.setMessage({
                            text: 'Updated'
                          });
                        }
                        $scope.browser.updateList();
                        $scope.find.close();
                      });
                    }
                  }
                });
              }
            });
          }
        });
      });
    };

    $scope.find.getSuggestion = function(name, succescb, errorCB) {
      var highlight = {};

      var SXXEXX = name.match(SXXEXXRegexpPattern);
      if (SXXEXX) {
        name = name.replace(SXXEXX[0], '');
        highlight.season = parseInt(SXXEXX[1]);
        highlight.episode = parseInt(SXXEXX[2]);
      }

      highlight.name = name.toLowerCase();
      var dateMatch = $scope.find.searchPlaceholder.match(/\d{4}/);
      if (dateMatch && dateMatch[0] !== 1080) {
        highlight.date = parseInt(dateMatch[0]);
      }


      name = encodeURIComponent(name);

      var type = !SXXEXX ? 'multi' : 'tv';

      $scope.find.abort();
      $scope.find.tmdbReq = requestAsync('http://api.themoviedb.org/3/search/' + type + '?query=' + name + '&api_key=021644aa1434cc7ca6839a63a3877d70&&language=fr', function(status, response) {
        if (status === 200) {
          var results = JSON.parse(response).results;

          $scope.find.results.length = 0;
          $scope.find.resultsHighlight.length = 0;

          for (var r = 0, l = results.length; r < l; r++) {
            var date = results[r].release_date || results[r].first_air_date;
            results[r].media_type = results[r].media_type || type;
            type = results[r].media_type === 'tv' ? 'serie' : results[r].media_type;


            if (date) {
              var data = {
                tmdb_id: results[r].id,
                type: type.capitalize(),
                title: results[r].original_title || results[r].original_name,
                title_fr: results[r].title || results[r].name,
                date: new Date(date),
                abstract_fr: results[r].overview,
                _poster: 'http://image.tmdb.org/t/p/w154' + results[r].poster_path,
                runtime: 'N/A'
              };
              var index = $scope.find.results.push(data) - 1;
              $scope.find.improveResult(index, highlight);
            }
          }

          succescb();
        } else {
          errorCB();
        }
      });
    };
    $scope.find.improveResult = function(index, highlight) {
      if ($scope.find.results[index].type === 'Movie') {
        $scope.find.results[index].enTmdbReq = requestAsync('http://api.themoviedb.org/3/movie/' + $scope.find.results[index].tmdb_id + '?api_key=021644aa1434cc7ca6839a63a3877d70&language=en', function(status, tmdbInfo) {
          if (status === 200) {
            tmdbInfo = JSON.parse(tmdbInfo);
            $scope.find.results[index].title_en = tmdbInfo.title;
            $scope.find.results[index].imdb_id = tmdbInfo.imdb_id;

            $scope.find.results[index].omdbReq = requestAsync('http://www.omdbapi.com/?i=' + tmdbInfo.imdb_id + '&plot=short&r=json', function(status, omdbInfo) {
              if (status === 200) {
                omdbInfo = JSON.parse(omdbInfo);
                if (omdbInfo.Response !== "False") {
                  var poster = omdbInfo.Poster;
                  if (poster !== 'N/A') {
                    var replace = poster.split('.');
                    replace = replace[replace.length - 2];
                    $scope.find.results[index].poster = poster.replace(replace, '_SIZE_');
                  } else {
                    $scope.find.results[index].poster = $scope.find.results[index]._poster;
                  }

                  $scope.find.results[index].type = 'Movie';
                  $scope.find.results[index].abstract_en = omdbInfo.Plot;
                  $scope.find.results[index].runtime = omdbInfo.Runtime;
                  $scope.find.results[index].metascore = parseInt(omdbInfo.Metascore);
                  $scope.find.results[index].director = omdbInfo.Director;
                  $scope.find.results[index].genre = omdbInfo.Genre.split(', ');
                  $scope.find.results[index].actors = omdbInfo.Actors.split(', ');
                }
                $scope.find.results[index].updated = true;

                // Highlight
                var titles = [
                  $scope.find.results[index].title.toLowerCase(),
                  $scope.find.results[index].title_en.toLowerCase(),
                  $scope.find.results[index].title_fr.toLowerCase(),
                ];
                if (titles.indexOf(highlight.name) !== -1 && highlight.date === $scope.find.results[index].date.getFullYear()) {
                  $scope.find.resetHeight();
                  $scope.find.resultsHighlight.push($scope.find.results[index]);
                }

                $scope.$apply();
                $scope.find.updateHeight();
                $scope.find.updateScrollbar();
              }
            });
          }
        });
      } else {
        $scope.find.results[index].enTmdbReq = requestAsync('http://api.themoviedb.org/3/tv/' + $scope.find.results[index].tmdb_id + '?api_key=021644aa1434cc7ca6839a63a3877d70&language=en', function(status, tmdbInfo) {
          if (status === 200) {
            tmdbInfo = JSON.parse(tmdbInfo);
            $scope.find.results[index].title_en = tmdbInfo.name;
            $scope.find.results[index].seasons = tmdbInfo.seasons;
            $scope.find.results[index].date_first = new Date(tmdbInfo.first_air_date);
            $scope.find.results[index].date_last = new Date(tmdbInfo.last_air_date);
            for (var s = $scope.find.results[index].seasons.length - 1; s >= 0; s--) {
              $scope.find.results[index].seasons[s].air_date = new Date($scope.find.results[index].seasons[s].air_date);
            }


            $scope.find.results[index].tmdbReq = requestAsync('http://api.themoviedb.org/3/tv/' + $scope.find.results[index].tmdb_id + '/external_ids?api_key=021644aa1434cc7ca6839a63a3877d70&language=en', function(status, tmdbInfo) {
              if (status === 200) {
                tmdbInfo = JSON.parse(tmdbInfo);
                $scope.find.results[index].imdb_id = tmdbInfo.imdb_id;

                $scope.find.results[index].omdbReq = requestAsync('http://www.omdbapi.com/?i=' + tmdbInfo.imdb_id + '&plot=short&r=json', function(status, omdbInfo) {
                  if (status === 200) {
                    omdbInfo = JSON.parse(omdbInfo);
                    if (omdbInfo.Response !== "False") {
                      $scope.find.resetHeight();
                      var poster = omdbInfo.Poster;
                      if (poster !== 'N/A') {
                        var replace = poster.split('.');
                        replace = replace[replace.length - 2];
                        $scope.find.results[index].poster = poster.replace(replace, '_SIZE_');
                      } else {
                        $scope.find.results[index].poster = $scope.find.results[index]._poster;
                      }

                      $scope.find.results[index].abstract_en = omdbInfo.Plot;
                      $scope.find.results[index].genre = omdbInfo.Genre.split(', ');
                      $scope.find.results[index].actors = omdbInfo.Actors.split(', ');
                      $scope.find.results[index].runtime = '';
                    }
                    $scope.find.results[index].updated = true;

                    // Highlight
                    if ($scope.find.results[index].seasons.length >= highlight.season && $scope.find.results[index].seasons[highlight.season - 1].episode_count >= highlight.episode) {
                      $scope.find.resetHeight();
                      $scope.find.results[index].episodeInfo = {
                        season: highlight.season,
                        displaySeason: highlight.season.twoDigits(),
                        episode: highlight.episode,
                        displayEpisode: highlight.episode.twoDigits()
                      };
                      $scope.find.resultsHighlight.push($scope.find.results[index]);
                    }

                    $scope.$apply();
                    $scope.find.updateHeight();
                  }
                });
              }
            });
          }
        });
      }
    };
    $scope.find.abort = function() {
      if ($scope.find.tmdbReq) {
        $scope.find.tmdbReq.abort();
        for (var idx = $scope.find.results.length - 1; idx >= 0; idx--) {
          if ($scope.find.results[idx].tmdbReq) {
            $scope.find.results[idx].tmdbReq.abort();
          }
          if ($scope.find.results[idx].enTmdbReq) {
            $scope.find.results[idx].enTmdbReq.abort();
          }
          if ($scope.find.results[idx].omdbReq) {
            $scope.find.results[idx].omdbReq.abort();
          }
        }
      }
    };

    $scope.find.show = function(e, elem) {
      if (elem.type === 'Serie' || elem.missing) {
        return;
      }

      e.stopPropagation();

      var value = elem.clean_filename;

      var matchSxEx = value.match(SXXEXXRegexp);
      if (matchSxEx) {
        var season = parseInt(matchSxEx[1]);
        var episode = parseInt(matchSxEx[2]);
        value = value.match(episodeRegexp)[0];
        value += ' [S' + season.twoDigits() + 'E' + episode.twoDigits() + ']';
      }
      var matchMovie = value.match(movieRegexp);
      if (matchMovie) {
        value = matchMovie[0];
      }

      value = value.replace(/extended/i, '');

      $scope.find.searchValue = value;
      $scope.find.searchPlaceholder = elem.clean_filename;

      $scope.find.spinner = '';
      $scope.find.searchInfo = 'Entrer the title and type enter';

      $scope.find.referenceId = elem._id;
      $scope.find.results.length = 0;
      $scope.find.resultsHighlight.length = 0;
      $scope.find.listOk = false;

      $scope.find.resetHeight();
      $scope.browser.status = 'searching';

      if ($scope.find.initialized !== undefined) {
        $scope.find.updateScrollbar();
      } else {
        $scope.find.scrollElement = document.querySelector('.popup-wrapper.search #results');
        Ps.initialize($scope.find.scrollElement, psConfig);
        $scope.find.initialized = true;
      }

      $scope.find.searchKD(null, true);
    };
    $scope.find.close = function() {
      $scope.find.abort();
      $scope.browser.status = '';
    };


    $scope.browser.checkType = function() {
      var query = {
        type: $scope.browser.type
      };

      if ($scope.browser.type === 'Unknow') {
        query.type = {
          $exists: false
        };
      }

      db.findOne(query, function(err, doc) {
        if (doc === null) {
          $scope.main.displayType('All');
        }
      });
    };

    $scope.browser.sortElements = function(sorting) {
      $scope.browser.elements = $filter('orderBrowser')($scope.browser.elements, sorting || $scope.browser.sorting);
    };
    $scope.browser.updateList = function(options) {
      console.time('List updated');

      if (options === undefined) {
        options = {};
      }

      var searchText = $scope.browser.searchValue.removeDiacritics();
      if (searchText !== '') {
        var reg = new RegExp(searchText, 'i');

        $scope.browser.query.$where = function() {
          if (!this.title_fr && !this.title_en && !this.title) {
            return reg.test(this.clean_filename.removeDiacritics());
          }
          return reg.test(this.title_fr.removeDiacritics()) || reg.test(this.title_en.removeDiacritics()) || reg.test(this.title.removeDiacritics());
        };
      } else {
        delete $scope.browser.query.$where;
      }

      console.time('query');
      db.find($scope.browser.query, function(err, docs) {
        console.timeEnd('query');

        var sorting;
        if ($scope.browser.type !== 'Duplicate') {
          for (var d = docs.length - 1; d >= 0; d--) {
            if (docs[d].update_small) {
              docs[d].poster = (docs[d].poster_url ? 'background-image:url(\'' + filePosterPath + '/_' + docs[d]._id + '.jpg?' + docs[d].update_small + '\')' : 'background-image:linear-gradient(#545B6C, #484D57)');
            } else {
              docs[d].poster = '';
            }
            docs[d].name = (docs[d].episode ? 'E' + docs[d].episode.twoDigits() + ' - ' : '') + ((docs[d].title_fr || docs[d].title_en) || docs[d].clean_filename);
          }
        } else {
          if (docs.length === 0) {
            $location.url(localStorage.display + '/' + localStorage.type);
          }
          sorting = 'filename';
        }
        $scope.browser.elements = docs;
        $scope.browser.sortElements(sorting);
        $scope.main.nbElements = docs.length;

        if (options.limit) {
          $scope.browser.limitElements = $scope.browser.elementsPerPages;
        }

        $scope.$apply();

        $scope.browser.updateScrollbar();
        console.timeEnd('List updated');

        if (options.callback) {
          options.callback();
        }
      });
    };

    $scope.$on('updateList', function() {
      $scope.browser.updateList();
    });

    $scope.browser.updateList();
    $scope.main.unsetHome();
  }]);
