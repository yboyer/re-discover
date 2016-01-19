var fs = require('fs');
var spawn = require('child_process').spawn;

var gulp = require('gulp');
var bump = require('gulp-bump');
var gutil = require('gulp-util');
var debug = require('gulp-debug');
var NwBuilder = require('nw-builder');
var zip = require('gulp-zip');
var uglify = require('gulp-uglify');
var cache = require('gulp-cached');
var remember = require('gulp-remember');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var ngHtml2Js = require('gulp-ng-html2js');
var minifyHtml = require('gulp-minify-html');
var del = require('del');
var merge = require('merge-stream');
var notifier = require('node-notifier');
var gnotifier = require('gulp-notify');


var appName = require('./src/package.json').name;
var appVersion = require('./package.json').version;
var appUrl = require('./package.json').repository.url;


var outputName = function(platform) {
  var arch = /64/.test(platform) ? 'x64' : 'ia32';
  platform = platform.slice(0, -2);
  return appName + '_v' + appVersion + '_' + platform + '-' + arch;
};
var nwConf = {
  files: ['core/**/*'],
  version: '0.12.3',
  platforms: ['osx64', 'win64'],
  zip: false,
  releaseDir: 'nw-release',
  buildDir: 'nw-builds',
  cacheDir: 'nw-cache',
  winIco: 'media/icon.ico',
  macIcns: 'media/icon.icns'
};
var src = {
  packages: ['package.json', 'src/package.json'],
  js: ['src/app/tools.js', 'src/app/**/*.js'],
  scss: ['src/**/*.scss', '!src/node_modules/**/*'],
  tpl: {
    html: ['src/app/**/*.tpl.html'],
    js: ['src/app/**/*.tpl.html']
  }
};

var notify = function(msg) {
  return notifier.notify({
    title: '(Re)Discover',
    message: msg,
    sound: true
  });
};
var gnotify = function(msg) {
  return gnotifier({
    title: '(Re)Discover',
    message: msg,
    sound: true
  });
};



gulp.task('default', ['build', 'watch']);
gulp.task('build', ['clean', 'html2js', 'concat:angular', 'concat:js', 'scss', 'copy'], function() {
  notify('Build done');
});
gulp.task('build:min', ['clean', 'html2js', 'concat:angular', 'concat:js:min', 'scss', 'copy:min'], function() {
  notify('Build done');
});
gulp.task('package', ['build:min'], function(cb) {
  del.sync('nw-builds/**/*');
  var nw = new NwBuilder(nwConf);

  nw.on('log', function(msg) {
    gutil.log(msg);
  });

  nw.build().then(function() {
    del.sync([nwConf.buildDir + '/**/ffmpegsumo.dll', nwConf.buildDir + '/**/pdf.dll']);
    nwConf.platforms.map(function(platform) {
      return fs.writeFileSync(nwConf.buildDir + '/' + appName + '/' + platform + '/Release v' + appVersion);
    });
    cb();
  }).catch(function(err) {
    gutil.log(err);
  });
});
gulp.task('releaseWin', ['package'], function(cb) {
  del.sync('nw-release/**/*win-*');
  var nbSetup = 0;
  nwConf.platforms.map(function(platform) {
    if (!/win/.test(platform)) {
      return;
    }
    nbSetup++;
    var child = spawn('C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe', [
      'setup.iss',
      '/dAppName=' + appName,
      '/dAppVersion=' + appVersion,
      '/dAppURL=' + appUrl,
      '/dPlatform=' + platform,
      '/dBuildDir=' + nwConf.buildDir,
      '/F' + outputName(platform)
    ]);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.on('close', function() {
      if (--nbSetup === 0) {
        cb();
      }
    });
  });
});
gulp.task('releaseOsx', ['package'], function() {
  del.sync('nw-release/**/*osx-*');
  var m = merge();
  nwConf.platforms.map(function(platform) {
    if (!/osx/.test(platform)) {
      return;
    }
    fs.writeFileSync(nwConf.buildDir + '/' + appName + '/' + platform + '/Release v' + appVersion);
    m.add(gulp.src(nwConf.buildDir + '/' + appName + '/' + platform + '/**')
      .pipe(zip(outputName(platform) + '.zip'))
      .pipe(debug({
        title: 'zip:'
      }))
      .pipe(gulp.dest(nwConf.releaseDir)));
  });
  return m;
});
gulp.task('release', ['releaseWin', 'releaseOsx']);

gulp.task('clean', function() {
  return del.sync('core/*');
});

gulp.task('html2js', function() {
  return gulp.src(src.tpl.html)
    .pipe(cache('templates'))
    .pipe(minifyHtml({
      empty: true,
      spare: true,
      quotes: true
    }))
    .pipe(ngHtml2Js({
      moduleName: 'templates',
      declareModule: true
    }))
    .pipe(debug({
      title: 'tpl:'
    }))
    .pipe(remember('templates'))
    .pipe(concat('templates.js'))
    .pipe(uglify())
    .pipe(gulp.dest('core'))
    .pipe(gnotify('templates'));
});

gulp.task('concat:angular', function() {
  return gulp.src(['vendor/angular/angular.min.js', 'vendor/angular/angular-route.min.js'])
    .pipe(cache('angular'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('angular'))
    .pipe(concat('angular.js'))
    .pipe(uglify())
    .pipe(gulp.dest('core'));
});
gulp.task('concat:js', function() {
  return gulp.src(src.js)
    .pipe(cache('js'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('js'))
    .pipe(concat('app.js'))
    .pipe(gulp.dest('core'))
    .pipe(gnotify('js'));
});
gulp.task('concat:js:min', function() {
  return gulp.src(src.js)
    .pipe(cache('js'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('js'))
    .pipe(concat('app.js'))
    .pipe(uglify())
    .pipe(gulp.dest('core'))
    .pipe(gnotify('js'));
});

gulp.task('scss', function() {
  return gulp.src(src.scss)
    .pipe(cache('scss'))
    .pipe(debug({
      title: 'scss:'
    }))
    .pipe(sass({
      outputStyle: 'compressed'
    }).on('error', sass.logError))
    .pipe(remember('scss'))
    .pipe(concat('app.css'))
    .pipe(gulp.dest('core'))
    .pipe(gnotify('scss'));
});

gulp.task('bump', function() {
  gulp.src(src.packages, {
      base: './'
    })
    .pipe(bump())
    .pipe(gulp.dest('./'));
});
gulp.task('bump:minor', function() {
  gulp.src(src.packages, {
      base: './'
    })
    .pipe(bump({
      type: 'minor'
    }))
    .pipe(gulp.dest('./'));
});
gulp.task('bump:major', function() {
  gulp.src(src.packages, {
      base: './'
    })
    .pipe(bump({
      type: 'major'
    }))
    .pipe(gulp.dest('./'));
});

gulp.task('copy', function() {
  return merge(
    gulp.src('src/package.json').pipe(cache('package')).pipe(remember('package')).pipe(gulp.dest('core')),
    gulp.src('src/index.html').pipe(cache('index')).pipe(remember('index')).pipe(gulp.dest('core')),
    gulp.src('src/node_modules/**/*').pipe(cache('modules')).pipe(remember('modules')).pipe(gulp.dest('core/node_modules')),
    gulp.src('media/icon.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest('core/assets')),
    gulp.src('src/assets/**/*').pipe(cache('assets')).pipe(remember('assets')).pipe(gulp.dest('core/assets'))
  );
});
gulp.task('copy:min', function() {
  return merge(
    gulp.src('src/package.json').pipe(cache('package')).pipe(remember('package')).pipe(gulp.dest('core')),
    gulp.src('src/index.html').pipe(cache('index')).pipe(remember('index')).pipe(minifyHtml({
      empty: true,
      spare: true,
      quotes: true
    })).pipe(gulp.dest('core')),
    gulp.src('src/node_modules/**/*').pipe(cache('modules')).pipe(remember('modules')).pipe(gulp.dest('core/node_modules')),
    gulp.src('media/icon.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest('core/assets')),
    gulp.src('src/assets/**/*').pipe(cache('assets')).pipe(remember('assets')).pipe(gulp.dest('core/assets'))
  );
});

gulp.task('watch', function() {
  gulp.watch(src.tpl.html, ['html2js']);
  gulp.watch(src.scss, ['scss']);
  gulp.watch(src.js, ['concat:js']);
  gulp.watch(['src/package.json', 'src/index.html', 'src/node_modules/**/*', 'media/icon.png', 'src/assets/**/*'], ['copy']);
});
