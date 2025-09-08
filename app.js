var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var fs = require('fs');
var { fileWatcherInitialize } = require('./file_watcher');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const { file } = require('googleapis/build/src/apis/file');

// var google_api = require('google_api_index');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// fs.watch('Z:/RishabhTest', {recursive: true}, function (eventType, filePath) {
//   console.log("Watching file: ", eventType, filePath);
//   if (filePath.includes('EXPORT - Internal')) {
    
//   }
// })

console.log("hello world");
// fileWatcherInitialize();

module.exports = app;
