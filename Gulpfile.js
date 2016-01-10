var bump = require('gulp-bump');
var rename = require("gulp-rename");
var debug = require('gulp-debug');
var NwBuilder = require('nw-builder');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var gutil = require('gulp-util');
var cache = require('gulp-cached');
var remember = require('gulp-remember');
var concat = require('gulp-concat');
var sass = require('gulp-sass');
var ngHtml2Js = require("gulp-ng-html2js");
var html2js = require("gulp-html2js");
var minifyHtml = require('gulp-minify-html');
var del = require('del');
var merge = require('merge-stream');
var jshint = require('gulp-jshint');
var notifier = require("node-notifier");


var nwConf = {
  files: ['core/**/*'],
  version: '0.12.3',
  platforms: ['osx64', 'win64'],
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

var jshintrc = {
  browser: true,
  node: true,
  unused: true,
  undef: true,
  curly: true,
  latedef: 'nofunc',
  noarg: true,
  boss: true,
  eqnull: true
};

var notify = function(msg) {
  return notifier.notify({
    title: '(Re)Discover',
    message: msg,
    sound: true,
  });
};

gulp.task('build', ['clean', 'html2js', 'concat', 'scss', 'copy'], function() {
  notify('Build done');
});
gulp.task('package', ['build'], function() {
  var nw = new NwBuilder(nwConf);

  nw.on('log', function(msg) {
    gutil.log(msg);
  });

  return nw.build().catch(function(err) {
    gutil.log(err);
  });
});
gulp.task('default', ['build', 'watch']);

gulp.task('clean', function() {
  return del.sync('core');
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
    .pipe(gulp.dest("core"));
});

gulp.task('concat', function() {
  return merge(
    gulp.src(['vendor/angular/angular.min.js', 'vendor/angular/angular-route.min.js'])
    .pipe(cache('angular'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('angular'))
    .pipe(concat('angular.js'))
    .pipe(uglify())
    .pipe(gulp.dest('core/')),

    gulp.src(src.js)
    .pipe(cache('js'))
    .pipe(debug({
      title: 'js:'
    }))
    .pipe(remember('js'))
    .pipe(concat('app.js'))
    // .pipe(uglify())
    .pipe(gulp.dest('core/'))
  );
});

gulp.task('jshint', function() {
  gulp.src(src.js)
    .pipe(jshint(jshintrc))
    .pipe(jshint.reporter('jshint-stylish'));
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
    .pipe(bump({type: 'minor'}))
    .pipe(gulp.dest('./'));
});
gulp.task('bump:major', function() {
  gulp.src(src.packages, {
      base: './'
    })
    .pipe(bump({type: 'major'}))
    .pipe(gulp.dest('./'));
});

gulp.task('copy', function() {
  return merge(
    gulp.src('src/package.json').pipe(cache('package')).pipe(remember('package')).pipe(gulp.dest('core/')),
    gulp.src('src/index.html').pipe(cache('index')).pipe(remember('index')).pipe(gulp.dest('core/')),
    gulp.src('src/node_modules/**/*').pipe(cache('modules')).pipe(remember('modules')).pipe(gulp.dest('core/node_modules')),
    gulp.src('media/icon.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest('core/assets')),
    gulp.src('src/assets/**/*').pipe(cache('assets')).pipe(remember('assets')).pipe(gulp.dest('core/assets'))
  );
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
    .pipe(gulp.dest('core/'));
});

gulp.task('watch', function() {
  gulp.watch('src/**/*', ['build']);
});
