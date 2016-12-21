const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const gulp = require('gulp');
const bump = require('gulp-bump');
const gutil = require('gulp-util');
const debug = require('gulp-debug');
const uglify = require('gulp-uglify');
const cache = require('gulp-cached');
const remember = require('gulp-remember');
const concat = require('gulp-concat');
const sass = require('gulp-sass');
const ngHtml2Js = require('gulp-ng-html2js');
const htmlmin = require('gulp-htmlmin');
const del = require('del');
const merge = require('merge-stream');
const notifier = require('node-notifier');
const gnotifier = require('gulp-notify');

const SRC_DIR = 'app/src';
const DIST_DIR = 'app/dist';

const htmlminConf = {
  collapseWhitespace: true,
  removeRedundantAttributes: true,
  ignoreCustomFragments: [/\s?\{\{.*?\}\}\s?/g]
};
const src = {
  pkg: path.join(SRC_DIR, '../package.json'),
  js: [SRC_DIR + '/app/tools.js', SRC_DIR + '/app/app.js', SRC_DIR + '/app/**/*.js'],
  scss: [SRC_DIR + '/**/*.scss', '!app/src/node_modules/**/*'],
  tpl: SRC_DIR + '/app/**/*.tpl.html'
};

const notify = (msg) =>
  notifier.notify({
    title: '(Re)Discover',
    message: msg,
    sound: true,
    icon: path.join(__dirname, 'build', 'icon.png')
  });
const gnotify = (msg) =>
  gnotifier({
    title: '(Re)Discover',
    message: msg,
    sound: true,
    icon: path.join(__dirname, 'build', 'icon.png')
  });


gulp.task('default', ['build', 'watch']);
gulp.task('build', ['clean', 'html2js', 'concat:angular', 'concat:js', 'scss', 'copy'], () => notify('Build done'));
gulp.task('build:min', ['clean', 'html2js', 'concat:angular', 'concat:js:min', 'scss', 'copy:min'], () => notify('Build done'));

gulp.task('clean', () => del.sync(DIST_DIR + '/*'));

gulp.task('html2js', () =>
  gulp.src(src.tpl)
    .pipe(cache('templates'))
    .pipe(htmlmin(htmlminConf))
    .pipe(ngHtml2Js({ moduleName: 'templates', declareModule: true }))
    .pipe(debug({ title: 'tpl:' }))
    .pipe(remember('templates'))
    .pipe(concat('templates.js'))
    .pipe(uglify())
    .pipe(gulp.dest(DIST_DIR))
    .pipe(gnotify('templates'))
);

gulp.task('concat:angular', () =>
  gulp.src([SRC_DIR + '/vendors/angular/angular.min.js', SRC_DIR + '/vendors/angular/angular-route.min.js'])
    .pipe(cache('angular'))
    .pipe(debug({ title: 'js:' }))
    .pipe(remember('angular'))
    .pipe(concat('angular.js'))
    .pipe(uglify())
    .pipe(gulp.dest(DIST_DIR))
);
gulp.task('concat:js', () =>
  gulp.src(src.js)
    .pipe(cache('js'))
    .pipe(debug({ title: 'js:' }))
    .pipe(remember('js'))
    .pipe(concat('app.js'))
    .pipe(gulp.dest(DIST_DIR))
    .pipe(gnotify('js'))
);
gulp.task('concat:js:min', () =>
  gulp.src(src.js)
    .pipe(cache('js'))
    .pipe(debug({ title: 'js:' }))
    .pipe(remember('js'))
    .pipe(concat('app.js'))
    .pipe(uglify())
    .pipe(gulp.dest(DIST_DIR))
    .pipe(gnotify('js'))
);

gulp.task('scss', () =>
  gulp.src(src.scss)
    .pipe(cache('scss'))
    .pipe(debug({ title: 'scss:' }))
    .pipe(sass({ outputStyle: 'compressed' }).on('error', sass.logError))
    .pipe(remember('scss'))
    .pipe(concat('app.css'))
    .pipe(gulp.dest(DIST_DIR))
    .pipe(gnotify('scss'))
);

gulp.task('bump', () =>
  gulp.src(src.pkg, { base: './' })
    .pipe(bump())
    .pipe(gulp.dest('./'))
);
gulp.task('bump:minor', () =>
  gulp.src(src.pkg, { base: './' })
    .pipe(bump({ type: 'minor' }))
    .pipe(gulp.dest('./'))
);
gulp.task('bump:major', () =>
  gulp.src(src.pkg, { base: './' })
    .pipe(bump({ type: 'major' }))
    .pipe(gulp.dest('./'))
);

gulp.task('copy', () =>
  merge(
    gulp.src(SRC_DIR + '/index.html').pipe(cache('index')).pipe(remember('index')).pipe(gulp.dest(DIST_DIR)),
    gulp.src(SRC_DIR + '/index.js').pipe(cache('index')).pipe(remember('index')).pipe(gulp.dest(DIST_DIR)),
    gulp.src('build/icons/1024x1024.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest(DIST_DIR + '/assets'))
  )
);
gulp.task('copy:min', () =>
  merge(
    gulp.src(SRC_DIR + '/index.html').pipe(cache('indexhtml')).pipe(remember('indexhtml')).pipe(htmlmin(htmlminConf)).pipe(gulp.dest(DIST_DIR)),
    gulp.src(SRC_DIR + '/index.js').pipe(cache('indexjs')).pipe(remember('indexjs')).pipe(uglify().on('error', errorHandler('Uglify'))).pipe(gulp.dest(DIST_DIR)),
    gulp.src('./build/icons/1024x1024.png').pipe(cache('icon')).pipe(remember('icon')).pipe(gulp.dest(DIST_DIR + '/assets'))
  )
);

gulp.task('watch', () => {
  gulp.watch(src.tpl, ['html2js']);
  gulp.watch(src.scss, ['scss']);
  gulp.watch(src.js, ['concat:js']);
  gulp.watch([DIST_DIR + '/index.html', './build/icons/1024x1024.png'], ['copy']);
});

function errorHandler(title) {
  return (err) => {
    gutil.log(gutil.colors.red(`[${title}]`), err.toString());
    this.emit('end');
  };
};
