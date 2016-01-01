var fs = require('fs');
var path = require('path');
var gui = require('nw.gui');
var http = require('http');
var win = gui.Window.get();
var exec = require('child_process').exec;
var storageFolder = gui.App.dataPath;
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
        http.get(url, function(response) {
          if (callback) {
            response.pipe(fs.createWriteStream(filename)).on('close', callback);
          } else {
            response.pipe(fs.createWriteStream(filename));
          }
        });
      },
      _removeEmptyElem: function(doc, callback) {
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
            if (--tools.totalMissing === 0) {
              callback();
            }
          });
        });
      },
      _updateMissings: function(paths, callback) {
        var tools = this;

        db.find({
          missing: {
            $ne: true
          },
          type: {
            $ne: 'Serie'
          },
          $where: function() {
            return paths.indexOf(this.path) == -1;
          }
        }, function(err, docs) {
          console.log('File missing:', docs.length, ':', docs);

          if (docs.length !== 0) {
            tools.totalMissing = docs.length;
            for (var d = docs.length - 1; d >= 0; d--) {
              tools._removeEmptyElem(docs[d], callback);
            }
          } else {
            callback();
          }
        });
      },
      updateDatabase: function(callback) {
        var path2browse = JSON.parse(localStorage.path2browse || '[]');
        var tools = this;

        browseDirectories(path2browse, function(files) {
          var total = files.length;

          if (files.length === 0) {
            tools._updateMissings(files, callback);
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
              } else if (/2160/.test(filename) || /4K/.test(filename)) {
                quality = '4K';
              } else if (/4320/.test(filename) || /8K/.test(filename)) {
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
              if (fileNames.indexOf(filename) == -1) {
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

              if (angular.equals(update.$set, dbFilenames[filename])) {
                if (--total === 0) {
                  tools._updateMissings(paths, callback);
                }
              } else {
                db.update({
                  filename: filename,
                  clean_filename: filename.replace(/\.|\_/g, ' '),
                  path: {
                    $exists: true
                  }
                }, update, {
                  upsert: true
                }, function() {
                  // Find missing files
                  if (--total === 0) {
                    tools._updateMissings(paths, callback);
                  }
                });
              }
            }
          });
        });
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
      var filtered = [];
      angular.forEach(items, function(item) {
        filtered.push(item);
      });

      switch (param) {
        case 'name':
          filtered.sort(function(a, b) {
            a.sortValue = removeDiacritics(a.name.charAt(0)).toUpperCase();
            b.sortValue = removeDiacritics(b.name.charAt(0)).toUpperCase();

            return a.name.localeCompare(b.name);
          });
          break;

        case 'release':
          filtered.sort(function(a, b) {
            var asortDate = a.date || a.date_first || 0;
            var bsortDate = b.date || b.date_first || 0;
            a.sortValue = asortDate.getFullYear();
            b.sortValue = asortDate.getFullYear();

            return bsortDate - asortDate;
          });
          break;

        case 'birthtime':
          filtered.sort(function(a, b) {
            asortDate = (a.birthtime || 0);
            bsortDate = (b.birthtime || 0);
            a.sortValue = a.birthtime ? (asortDate.getMonth() + 1).twoDigits() + '/' + asortDate.getFullYear() : '--/----';
            b.sortValue = b.birthtime ? (bsortDate.getMonth() + 1).twoDigits() + '/' + bsortDate.getFullYear() : '--/----';

            return bsortDate - asortDate;
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

      return filtered;
    };
  })
  .controller('MainCtrl', ['$scope', '$location', '$timeout', 'tools', function($scope, $location, $timeout, tools) {
    console.log('MainCtrl');
    $scope.main = this;
    $scope.main.home = true;
    $scope.main.typeSections = [
      [],
      []
    ];
    $scope.main.genres = [];


    // Set default values
    if (!localStorage.type) {
      localStorage.type = 'All';
    }
    if (!localStorage.display) {
      localStorage.display = 'list';
    }
    if (!localStorage.sorting) {
      localStorage.sorting = 'name';
    }


    // Sidebar scollbar
    $scope.main.sideBarScrollBar = new GeminiScrollbar({
      forceGemini: true,
      element: document.querySelector('.sidebar #sections'),
      createElements: false
    }).create();


    // Status message
    $scope.main.messageNumber = 0;
    $scope.main.queueStatus = [];
    $scope.main.status = {
      spinner: '',
      text: ''
    };
    $scope.main.setMessage = function(data) {
      data.id = $scope.main.messageNumber++;

      var newStatus;

      console.info(data.text);

      if ($scope.main.status.show && $scope.main.status.spinner && !$scope.main.status.force) {
        if (data.removeId == $scope.main.status.id) {
          if (!data.spinner)
            newStatus = $scope.main.queueStatus.pop();

          if (!newStatus)
            newStatus = data;

        } else {
          if (data.removeId !== undefined) {
            for (var i = $scope.main.queueStatus.length - 1; i >= 0; i--) {
              if ($scope.main.queueStatus[i].id === data.removeId) {
                $scope.main.queueStatus.splice(i, 1);
                break;
              }
            }
          }

          if (data.spinner) {
            $scope.main.queueStatus.push($scope.main.status.clone());

            newStatus = data;
          } else {
            return;
          }

        }
      } else {
        newStatus = data;
      }

      $timeout.cancel($scope.main.timeoutStatus);
      $scope.main.status.id = newStatus.id;
      $scope.main.status.show = 'show';
      $scope.main.status.spinner = newStatus.spinner ? 'spinner' : '';
      $scope.main.status.text = newStatus.text;
      $scope.main.status.force = newStatus.force;
      if (!newStatus.spinner || newStatus.force) {
        $scope.main.timeoutStatus = $timeout(function() {
          $scope.main.status.show = '';
        }, 3000);
      }

      $timeout();

      return data.id;
    };


    $scope.main.updateDatabase = function() {
      if ($scope.main.databaseBusy || localStorage.path2browse === undefined)
        return;

      $scope.main.databaseBusy = true;
      var idMsg = $scope.main.setMessage({
        spinner: true,
        text: 'Updating the database...'
      });
      tools.updateDatabase(function() {
        $scope.main.databaseBusy = false;
        $scope.main.setMessage({
          removeId: idMsg,
          text: 'Database updated'
        });
        $scope.main.updateSideBar();
        $scope.$broadcast('updateList');
      });
    };

    $scope.main.setHome = function() {
      $scope.main.home = true;
      $location.path('home');
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
            $location.url(localStorage.display + '/All');
          }
        } else {
          if ('All' === localStorage.type) {
            $location.url(localStorage.display + '/' + localStorage.type);
          } else {
            for (var d = docs.length - 1; d >= 0; d--) {
              if ('All' === localStorage.type || docs[d].type === localStorage.type) {
                $location.url(localStorage.display + '/' + localStorage.type);
                return;
              }
            }
            $location.url(localStorage.display + '/Unknow');
          }
        }
      });
    };

    $scope.main.updateSideBar = function() {
      $scope.main.updateGenres();
      $scope.main.updateCategories();
    };
    $scope.main.updateCategories = function() {
      console.log('updateCategories');

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

          if ($scope.main.typeSections[0].indexOf(type) == -1) {
            $scope.main.typeSections[0].push(type);
          }

          if ($scope.main.typeSections[1].indexOf('Duplicate') == -1 && haveDuplicate) {
            $scope.main.typeSections[1].push('Duplicate');
          }

          if ($scope.main.typeSections[1].indexOf('Missing') == -1 && isMissing) {
            $scope.main.typeSections[1].push('Missing');
          }

          if (!docs[d].type && !haveDuplicate)
            break;
        }

        $scope.$apply();
        $scope.main.sideBarScrollBar.update();
      });
    };
    $scope.main.updateGenres = function(query) {
      console.log('updateGenres');

      if (query)
        $scope.main.genreQuery = query;

      if (['Unknow', 'Duplicate'].indexOf($scope.main.type) != -1) {
        $scope.main.genres.length = 0;
        $timeout(function() {
          $scope.main.sideBarScrollBar.update();
        });
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
            if ($scope.main.genres.indexOf(genres[g]) == -1) {
              $scope.main.genres.push(genres[g]);
            }
          }
        }
        $scope.$apply();
        $scope.main.sideBarScrollBar.update();
      });
    };

    $scope.main.displayGenre = function(genre) {
      $location.search('genre', genre);
    };
    $scope.main.displayType = function(type) {
      if (type == 'Duplicate') {
        $location.url('duplicates/' + type);
        return;
      }

      localStorage.type = type;
      $location.url(localStorage.display + '/' + type);
    };


    // Preload posters and clean the 'posters' folder
    db.find({}, function(err, docs) {
      var ids = [];
      for (var d = docs.length - 1; d >= 0; d--)
        ids.push(docs[d]._id);

      fs.readdir(postersPath, function(err, files) {
        if (err) {
          fs.mkdirSync(postersPath);
        } else {
          for (var f = files.length - 1; f >= 0; f--) {
            if (ids.indexOf(path.parse(files[f]).name.replace('_', '')) == -1) {
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
    win.on('close', function() {
      if ($scope.main.status.show && $scope.main.status.spinner) {
        if (confirm('The application is currentely on process.\n\nDo you want to exit the app anyway ?..'))
          gui.App.quit();
      } else
        gui.App.quit();
    });

    document.body.shortcut({
      key: "F5",
      active: function() {
        $scope.main.updateDatabase();
      }
    });
    document.body.shortcut({
      key: "CtrlCmd+D",
      active: function() {
        win.showDevTools();
      }
    });
    document.body.shortcut({
      key: "CtrlCmd+Shift+Delete",
      active: function() {
        if (confirm('Do you really want to clean the app ?')) {
          db.remove({}, {
            multi: true
          }, function() {
            db.loadDatabase(function() {
              localStorage.clear();
              fs.readdir(postersPath, function(err, files) {
                for (var f = files.length - 1; f >= 0; f--) {
                  fs.unlinkSync(postersPath + '/' + files[f]);
                }
                gui.App.quit();
              });
            });
          });
        }
      }
    });

    if (process.platform === 'darwin') {
      var menu = new gui.Menu({
        type: 'menubar'
      });
      if (menu.createMacBuiltin !== undefined) {
        menu.createMacBuiltin(gui.App.manifest.name);
      }

      document.body.shortcut({
        key: "Cmd+F",
        active: function() {
          win.toggleFullscreen();
        }
      });
    }

    if (/^win/.test(process.platform)) {
      document.body.shortcut({
        key: "F11",
        active: function() {
          win.toggleFullscreen();
        }
      });
    }


    $scope.main.setView();
    $scope.main.updateCategories();
    $scope.main.updateDatabase();
  }])
  .controller('BrowserCtrl', ['$scope', '$routeParams', '$location', '$timeout', 'tools', function($scope, $routeParams, $location, $timeout, tools) {
    console.log('BrowserCtrl');
    $scope.browser = this;
    $scope.find = {};
    $scope.display = {};

    // Set scroll event for dividers
    var elementsEcontainer = document.querySelector('.wrapElems #elements');
    var divider = elementsEcontainer.querySelector('.divider.static');
    if (document.querySelector('.browser').classList.contains('list')) {
      elementsEcontainer.addEventListener('scroll', function() {
        var dividers = elementsEcontainer.querySelectorAll('.divider:not(.static)');
        if (dividers.length === 0)
          return;

        var scrollTop = this.scrollTop;
        for (var d = dividers.length - 1; d >= 0; d--) {
          var offsetTop = dividers[d].offsetTop;
          var offsetHeight = dividers[d].offsetHeight;

          if (scrollTop > offsetTop - offsetHeight) {
            if (divider.part != d) {
              divider.status = '';
              divider.part = d;
            }
            if (scrollTop >= offsetTop) {
              if (divider.status == 'static')
                return;
              divider.status = 'static';
              divider.textContent = dividers[d].textContent;
              divider.style.top = '';
              divider.classList.remove('bottom');
            } else if (divider.status != 'bottom') {
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
      if (!divider)
        return;
      divider.textContent = '';
      divider.status = '';
    };


    $scope.browser.scrollBar = new GeminiScrollbar({
      forceGemini: true,
      element: document.querySelector('.browser .wrapElems'),
      createElements: false
    }).create();


    $scope.browser.disableFull = JSON.parse(localStorage.disableFull || 'false');
    $scope.browser.toggleFull = function() {
      $scope.browser.disableFull = localStorage.disableFull = !$scope.browser.disableFull;
      $timeout(function() {
        $scope.browser.scrollBar.update();
      });
    };
    $scope.browser.display = localStorage.display;
    $scope.browser.toggleDisplay = function() {
      if (localStorage.display == 'list') {
        $location.url($location.url().replace('list', 'grid'));
        localStorage.display = 'grid';
      } else {
        $location.url($location.url().replace('grid', 'list'));
        localStorage.display = 'list';
      }
    };

    $scope.browser.sorts = {
      season: 'Season',
      name: 'Alphabetical',
      release: 'Release date',
      birthtime: 'File date'
    };
    $scope.browser.setSorting = function(value) {
      $scope.browser.sorting = localStorage.sorting = value;
      elementsEcontainer.scrollTop = 0;
      $scope.browser.sortingName = $scope.browser.sorts[$scope.browser.sorting];
      $timeout(function() {
        $scope.browser.scrollBar.update();
      });
    };


    $scope.browser.searchKD = function(e) {
      if (e.keyCode == 27) {
        e.target.blur();
        $scope.browser.searchValue = '';
        $scope.browser.updateList();
      }
    };


    $scope.browser.searchValue = '';
    $scope.browser.sorting = $location.search().sorting || localStorage.sorting;
    $scope.browser.sortingName = $scope.browser.sorts[$scope.browser.sorting];
    $scope.browser.type = $routeParams.type;
    $scope.browser.genre = $location.search().genre || 'All';
    $scope.browser.serie_id = $location.search().serie_id;
    $scope.main.type = $scope.browser.type;
    $scope.main.genre = $scope.browser.genre;



    $scope.browser.query = {};
    if ($scope.browser.serie_id) $scope.browser.query.serie_id = $scope.browser.serie_id;
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
        if ($scope.browser.type != 'Episode')
          $scope.browser.query.missing = {
            $ne: true
          };
    }
    $scope.main.updateGenres($scope.browser.query.clone());
    if ($scope.browser.genre != 'All') {
      if ($scope.browser.genre == 'Unknow') {
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
    } else if ($scope.browser.type != 'All') {
      $scope.browser.searchIn = $scope.browser.type + 's';
    } else {
      $scope.browser.searchIn = '';
    }



    $scope.browser.startPlayer = function(filePath) {
      if (localStorage.playerPath) {
        exec('"' + localStorage.playerPath + '" "' + filePath + '"');
      } else {
        gui.Shell.openItem(filePath);
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
        fs.stat(doc.path, function(err, file) {
          if (err) {
            var idMsg = $scope.main.setMessage({
              spinner: true,
              text: 'File missing... Updating database...'
            });

            tools.updateDatabase(function() {
              $scope.main.setMessage({
                removeId: idMsg,
                text: 'Database updated'
              });

              $scope.main.updateSideBar();

              // Update the display the missing or not element
              $scope.browser.updateList(function() {
                db.findOne({
                  _id: _id
                }, function(err, doc) {
                  if (doc.missing) {
                    if (confirm('"' + doc.path + '" is missing. Do you want to remove it from the list ?')) {
                      if (doc.serie_id !== undefined) {
                        db.count({
                          serie_id: doc.serie_id,
                          _id: {
                            $ne: _id
                          }
                        }, function(err, count) {
                          if (count === 0) {
                            tools.removeEntry(doc.serie_id, function(err, count) {
                              $scope.main.updateSideBar();
                              $location.url(localStorage.display + '/All');
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
                  }
                });
              });
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
        });
      });
    };
    $scope.browser.goToEpisodes = function(e, id) {
      e.stopPropagation();
      $location.url(localStorage.display + '/Episode?serie_id=' + id + '&sorting=season');
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
        if (d.size)
          d.size = readableBytes(d.size);
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
      gui.Shell.openItem(postersPath + '/' + id + '.jpg');
    };
    $scope.display.showItem = function(itemPath) {
      gui.Shell.showItemInFolder(itemPath);
    };


    $scope.find.results = [];
    $scope.find.searchKD = function(e) {
      if (e.keyCode == 13) {
        e.target.blur();
        var value = $scope.find.searchValue;

        $scope.find.searchInfo = 'Searching “' + value + '”...';
        $scope.find.spinner = 'spinner';

        $scope.find.getSuggestion(value, function() {
          document.querySelector('.choose').style.height = '';
          $scope.find.searchInfo = 'Result for “' + value + '”';
          $scope.find.listOk = true;
          $scope.find.spinner = '';
          $scope.$apply();

          document.querySelector('.choose').style.height = document.querySelector('.choose #results').offsetHeight + 105 + 'px';
          $scope.find.scrollBar.update();
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
          tmbd_id: data.tmbd_id,
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
          tools.downloadPoster(data.poster.replace('_SIZE_', 'SY' + Math.ceil(195 * devicePixelRatio)), postersPath + '/_' + referenceId + '.jpg', function() {
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
        tmbd_id: data.tmbd_id,
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
      }
      for (var s = 0, sl = data.seasons.length; s < sl; s++) {
        serie.seasons.push({
          tmbd_id: data.seasons[s].id,
          date: new Date(data.seasons[s].air_date),
          episode_count: data.seasons[s].episode_count,
          season_number: data.seasons[s].season_number
        });
      };

      db.update({
        tmbd_id: serie.tmbd_id
      }, {
        $set: serie
      }, {
        upsert: true
      }, function() {
        db.findOne({
          tmbd_id: serie.tmbd_id
        }, function(err, doc) {
          callback(doc._id);
          $scope.main.updateSideBar();

          if (doc.poster_url) {
            var idMsgSmall = $scope.main.setMessage({
              spinner: true,
              text: 'Downloading small poster for “' + doc.title_fr + '”...'
            });
            tools.downloadPoster(doc.poster_url.replace('_SIZE_', 'SY' + Math.ceil(195 * devicePixelRatio)), postersPath + '/_' + doc._id + '.jpg', function() {
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

        db.findOne({
          _id: referenceId
        }, function(err, doc) {
          if (doc.serie_id == serie_id) {
            return;
          }
          db.count({
            serie_id: doc.serie_id,
            _id: {
              $ne: referenceId
            }
          }, function(err, count) {
            if (count == 0) {
              tools.removeEntry(doc.serie_id, function(err, count) {
                $scope.main.updateSideBar();
              });
            }
          })
        });

        data.req = requestAsync('http://api.themoviedb.org/3/tv/' + data.tmbd_id + '/season/' + season_num + '/episode/' + episode_num + '?api_key=7b5e30851a9285340e78c201c4e4ab99&language=fr', function(status, tmdbInfo) {
          if (status == 200) {
            tmdbInfo = JSON.parse(tmdbInfo);

            episode.tmbd_id = tmdbInfo.id;
            episode.title_fr = tmdbInfo.name;
            episode.abstract_fr = tmdbInfo.overview;
            episode.date = new Date(tmdbInfo.air_date);

            episode.guests = [];
            for (var g = 0, gl = tmdbInfo.guest_stars.length; g < gl; g++)
              episode.guests.push(tmdbInfo.guest_stars[g].name);

            data.req = requestAsync('http://api.themoviedb.org/3/tv/' + data.tmbd_id + '/season/' + season_num + '/episode/' + episode_num + '/external_ids?api_key=7b5e30851a9285340e78c201c4e4ab99', function(status, tmdbInfo) {
              if (status == 200) {
                tmdbInfo = JSON.parse(tmdbInfo);
                episode.imdb_id = tmdbInfo.imdb_id;

                data.req = requestAsync('http://www.omdbapi.com/?i=' + data.imdb_id + '&Season=' + season_num + '&Episode=' + episode_num + '&plot=short&r=json', function(status, omdbInfo) {
                  if (status == 200) {
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
                            text: 'Downloading small poster for “' + episode.title_fr + '”...'
                          });
                          tools.downloadPoster(episode.poster_url.replace('_SIZE_', 'SY' + Math.ceil(195 * devicePixelRatio)), postersPath + '/_' + referenceId + '.jpg', function() {
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
                              text: 'Downloading original poster for “' + episode.title_fr + '”...'
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
                                text: 'Original poster downloaded for “' + episode.title_fr + '”'
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
      name = encodeURIComponent(name);

      $scope.find.abort();

      $scope.find.tmdbReq = requestAsync('https://www.themoviedb.org/search/remote/multi?query=' + name, function(status, results) {
        if (status == 200) {
          results = JSON.parse(results);

          $scope.find.results.length = 0;

          for (var r = 0, l = results.length; r < l; r++) {
            var date = results[r].release_date || results[r].first_air_date;
            var type = results[r].media_type == 'tv' ? 'serie' : results[r].media_type;


            if (date) {
              $scope.find.improveResult($scope.find.results.push({
                tmbd_id: results[r].id,
                type: type.capitalize(),
                title: results[r].original_title || results[r].original_name,
                title_fr: results[r].title || results[r].name,
                date: new Date(date),
                abstract_fr: results[r].overview,
                _poster: 'http://image.tmdb.org/t/p/w154' + results[r].poster_path,
                runtime: 'N/A'
              }) - 1);
            }
          };

          succescb();
        } else
          errorCB();
      });
    };
    $scope.find.improveResult = function(index) {
      if ($scope.find.results[index].type == 'Movie') {
        $scope.find.results[index].enTmdbReq = requestAsync('http://api.themoviedb.org/3/movie/' + $scope.find.results[index].tmbd_id + '?api_key=7b5e30851a9285340e78c201c4e4ab99&language=en', function(status, tmdbInfo) {
          if (status == 200) {
            tmdbInfo = JSON.parse(tmdbInfo);
            $scope.find.results[index].title_en = tmdbInfo.title;
            $scope.find.results[index].imdb_id = tmdbInfo.imdb_id;

            $scope.find.results[index].omdbReq = requestAsync('http://www.omdbapi.com/?i=' + tmdbInfo.imdb_id + '&plot=short&r=json', function(status, omdbInfo) {
              if (status == 200) {
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

                  // $scope.find.results[index].type = omdbInfo.Type.capitalize();
                  $scope.find.results[index].type = 'Movie';
                  $scope.find.results[index].abstract_en = omdbInfo.Plot;
                  $scope.find.results[index].runtime = omdbInfo.Runtime;
                  $scope.find.results[index].director = omdbInfo.Director;
                  $scope.find.results[index].genre = omdbInfo.Genre.split(', ');
                  $scope.find.results[index].actors = omdbInfo.Actors.split(', ');
                }
                $scope.find.results[index].updated = true;
                $scope.$apply();
                $scope.find.scrollBar.update();
              }
            });
          }
        });
      } else {
        $scope.find.results[index].enTmdbReq = requestAsync('http://api.themoviedb.org/3/tv/' + $scope.find.results[index].tmbd_id + '?api_key=7b5e30851a9285340e78c201c4e4ab99&language=en', function(status, tmdbInfo) {
          if (status == 200) {
            tmdbInfo = JSON.parse(tmdbInfo);
            $scope.find.results[index].title_en = tmdbInfo.name;
            $scope.find.results[index].seasons = tmdbInfo.seasons;
            $scope.find.results[index].date_first = new Date(tmdbInfo.first_air_date);
            $scope.find.results[index].date_last = new Date(tmdbInfo.last_air_date);
            for (var s = $scope.find.results[index].seasons.length - 1; s >= 0; s--)
              $scope.find.results[index].seasons[s].air_date = new Date($scope.find.results[index].seasons[s].air_date)


            $scope.find.results[index].tmdbReq = requestAsync('http://api.themoviedb.org/3/tv/' + $scope.find.results[index].tmbd_id + '/external_ids?api_key=7b5e30851a9285340e78c201c4e4ab99&language=en', function(status, tmdbInfo) {
              if (status == 200) {
                tmdbInfo = JSON.parse(tmdbInfo);
                $scope.find.results[index].imdb_id = tmdbInfo.imdb_id;

                $scope.find.results[index].omdbReq = requestAsync('http://www.omdbapi.com/?i=' + tmdbInfo.imdb_id + '&plot=short&r=json', function(status, omdbInfo) {
                  if (status == 200) {
                    omdbInfo = JSON.parse(omdbInfo);
                    if (omdbInfo.Response !== "False") {
                      document.querySelector('.choose').style.height = '';
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
                    $scope.$apply();
                    document.querySelector('.choose').style.height = document.querySelector('.choose #results').offsetHeight + 105 + 'px';
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
          if ($scope.find.results[idx].tmdbReq)
            $scope.find.results[idx].tmdbReq.abort();
          if ($scope.find.results[idx].enTmdbReq)
            $scope.find.results[idx].enTmdbReq.abort();
          if ($scope.find.results[idx].omdbReq)
            $scope.find.results[idx].omdbReq.abort();
        }
      };
    };

    $scope.find.show = function(e, elem) {
      if (elem.type == 'Serie' || elem.missing)
        return;

      e.stopPropagation();

      var value = elem.clean_filename;

      $scope.find.searchValue = value;
      $scope.find.searchPlaceholder = value;

      $scope.find.spinner = '';
      $scope.find.searchInfo = value;

      $scope.find.referenceId = elem._id;
      $scope.find.results.length = 0;
      $scope.find.listOk = false;

      document.querySelector('.choose').style.height = '';
      $scope.browser.status = 'searching';

      if (!$scope.find.scrollBar)
        $scope.find.scrollBar = new GeminiScrollbar({
          forceGemini: true,
          element: document.querySelector('.popup-wrapper.search #results')
        }).create();
      else
        $scope.find.scrollBar.update();

      // TODO: improve focus
      setTimeout(function() {
        document.querySelector('.popup-wrapper.search input').focus();
      }, 100);
    };
    $scope.find.close = function() {
      $scope.find.abort();
      $scope.browser.status = '';
    };


    $scope.browser.checkType = function() {
      var query = {
        type: $scope.browser.type
      };

      if ($scope.browser.type == 'Unknow') {
        query.type = {
          $exists: false
        };
      }

      db.findOne(query, function(err, doc) {
        if (doc == null) {
          $location.url(localStorage.display + '/All');
        }
      })
    };

    $scope.browser.updateList = function(callback) {
      var searchText = removeDiacritics($scope.browser.searchValue);
      if (searchText != '') {
        // var reg = '.*';
        // for (var t = 0, lt = searchText.length; t < lt; t++)
        // 	reg += searchText[t].toLowerCase() + '.*';
        var reg = searchText;
        reg = new RegExp(reg, 'i');

        $scope.browser.query.$where = function() {
          if (!this.title_fr && !this.title_en && !this.title)
            return reg.test(removeDiacritics(this.clean_filename));
          return reg.test(removeDiacritics(this.title_fr)) || reg.test(removeDiacritics(this.title_en)) || reg.test(removeDiacritics(this.title));
        }
      } else {
        delete $scope.browser.query.$where;
      }

      db.find($scope.browser.query, function(err, docs) {
        if ($scope.browser.type != 'Duplicate') {
          for (var d = docs.length - 1; d >= 0; d--) {
            if (docs[d].update_small)
              docs[d].poster = (docs[d].poster_url ? 'background-image:url(\'' + filePosterPath + '/_' + docs[d]._id + '.jpg?' + docs[d].update_small + '\')' : 'background-image:linear-gradient(#545B6C, #484D57)');
            else
              docs[d].poster = '';
            docs[d].name = (docs[d].episode ? 'E' + docs[d].episode.twoDigits() + ' - ' : '') + ((docs[d].title_fr || docs[d].title_en) || docs[d].clean_filename);
          }
        } else {
          if (docs.length === 0)
            $location.url(localStorage.display + '/' + localStorage.type);
        }
        $scope.browser.elements = docs;

        $scope.main.nbElements = docs.length;

        $scope.$apply();
        console.log('List updated');

        $scope.browser.scrollBar.update();

        if (callback)
          callback();
      });
    };

    $scope.$on('updateList', function() {
      $scope.browser.updateList();
    });

    $scope.browser.updateList();
    $scope.main.unsetHome();
  }]);
