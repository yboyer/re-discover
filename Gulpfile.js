var fs = require('fs');
var spawn = require('child_process').spawn;

var gulp = require('gulp');
var bump = require('gulp-bump');
var gutil = require('gulp-util');
var debug = require('gulp-debug');
var zip = require('gulp-zip');
var uglify = require('gulp-uglify');
var cache = require('gulp-cached');
var remember = require('gulp-remember');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var ngHtml2Js = require('gulp-ng-html2js');
var htmlmin = require('gulp-htmlmin');
var del = require('del');
var merge = require('merge-stream');
var notifier = require('node-notifier');
var gnotifier = require('gulp-notify');

var SRC_DIR = 'app/src';
var DIST_DIR = 'app/dist';

var manifest = require('./app/package.json');
var appName = manifest.name;
var appVersion = manifest.version;
var appUrl = manifest.repository.url;


var outputName = function(platform) {
  var arch = /64/.test(platform) ? 'x64' : 'ia32';
  platform = platform.slice(0, -2);
  return appName + '_v' + appVersion + '_' + platform + '-' + arch;
};
var htmlminConf = {
  collapseWhitespace: true,
  removeRedundantAttributes: true,
  ignoreCustomFragments: [/\s?\{\{.*?\}\}\s?/g]
};
var src = {
  js: [SRC_DIR + '/app/tools.js', SRC_DIR + '/app/app.js', SRC_DIR + '/app/**/*.js'],
  scss: [SRC_DIR + '/**/*.scss', '!app/src/node_modules/**/*'],
  tpl: {
    html: [SRC_DIR + '/app/**/*.tpl.html']
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

gulp.task('clean', function() {
  return del.sync(DIST_DIR + '/*');
});

gulp.task('html2js', function() {
  return gulp.src(src.tpl.html)
    .pipe(cache('templates'))
    .pipe(htmlmin(htmlminConf))
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
    .pipe(gulp.dest(DIST_DIR))
    .pipe(gnotify('templates'));
});

gulp.task('concat:angular', function() {
  return gulp.src([SRC_DIR + '/vendors/angular/angular.min.js', SRC_DIR + '/vendors/angular/angular-route.min.js'])
    .pipe(cache('angular'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('angular'))
    .pipe(concat('angular.js'))
    .pipe(uglify())
    .pipe(gulp.dest(DIST_DIR));
});
gulp.task('concat:js', function() {
  return gulp.src(src.js)
    .pipe(cache('js'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('js'))
    .pipe(concat('app.js'))
    .pipe(gulp.dest(DIST_DIR))
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
    .pipe(gulp.dest(DIST_DIR))
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
    .pipe(gulp.dest(DIST_DIR))
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
    gulp.src(SRC_DIR + '/index.html').pipe(cache('index')).pipe(remember('index')).pipe(gulp.dest(DIST_DIR)),
    gulp.src(SRC_DIR + '/index.js').pipe(cache('index')).pipe(remember('index')).pipe(gulp.dest(DIST_DIR)),
    gulp.src('build/icons/1024x1024.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest(DIST_DIR + '/assets'))
  );
});
gulp.task('copy:min', function() {
  return merge(
    gulp.src(SRC_DIR + '/index.html').pipe(cache('indexhtml')).pipe(remember('indexhtml')).pipe(htmlmin(htmlminConf)).pipe(gulp.dest(DIST_DIR)),
    gulp.src(SRC_DIR + '/index.js').pipe(cache('indexjs')).pipe(remember('indexjs')).pipe(uglify().on('error', errorHandler('Uglify'))).pipe(gulp.dest(DIST_DIR)),
    gulp.src('./build/icons/1024x1024.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest(DIST_DIR + '/assets'))
  );
});

gulp.task('watch', function() {
  gulp.watch(src.tpl.html, ['html2js']);
  gulp.watch(src.scss, ['scss']);
  gulp.watch(src.js, ['concat:js']);
  gulp.watch([DIST_DIR + '/index.html', './build/icons/1024x1024.png'], ['copy']);
});

function errorHandler(title) {
  return function (err) {
    gutil.log(gutil.colors.red(`[${title}]`), err.toString());
    this.emit('end');
  };
};
