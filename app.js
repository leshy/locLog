// Generated by CoffeeScript 1.7.1
(function() {
  var Backbone, async, closeDb, collections, cookie, env, fs, getKml, getKml_, getParseLoop, helpers, init, initDb, initMemory, initModels, jsdom, mongodb, parseKml, request, _;

  fs = require('fs');

  jsdom = require('jsdom').jsdom;

  _ = require('underscore');

  Backbone = require('backbone4000');

  mongodb = require('mongodb');

  collections = require('collections/serverside');

  async = require('async');

  request = require('request');

  helpers = require('helpers');

  env = {};

  cookie = require('./cookie').cookie;

  initModels = function(callback) {
    console.log('initializing models...');
    env.settings = new collections.MongoCollection({
      db: env.db,
      collection: 'settings'
    });
    env.setting = env.settings.defineModel('setting', {});
    env.points = new collections.MongoCollection({
      db: env.db,
      collection: 'points'
    });
    env.point = env.points.defineModel('point', {
      initialize: function() {
        var coords, date, time;
        time = this.get('time').match('(.*)-(.*)-(.*)T(.*):(.*):(.*)\\.(.*)-(.*):(.*)');
        date = new Date();
        date.setUTCFullYear(time[1]);
        date.setUTCMonth(time[2]);
        date.setUTCDate(time[3]);
        date.setUTCHours(time[4]);
        date.setUTCMinutes(time[5]);
        date.setUTCSeconds(time[6]);
        date.setUTCMilliseconds(time[7]);
        coords = this.get('coords').split(' ');
        this.unset('coords');
        console.log(this.get('time'), new Date(date.getTime() + (helpers.hour * Number(time[8]) + helpers.minute * Number(time[9]))));
        return this.set({
          time: date.getTime() + (helpers.hour * Number(time[8]) + helpers.minute * Number(time[9])),
          lat: coords[1],
          lng: coords[0]
        });
      },
      show: function() {
        return 'time: ' + this.time + " coords: " + this.coords;
      },
      save: function(callback) {
        return env.points.findOne({
          time: this.get('time')
        }, (function(_this) {
          return function(err, data) {
            if (data) {
              return callback('exists');
            }
            return _this.flush(callback);
          };
        })(this));
      }
    });
    return callback();
  };

  initMemory = function(callback) {
    var _createMemory;
    _createMemory = function(callback) {
      console.log('memory not found, creating new one');
      env.memory = new env.setting({
        name: 'memory',
        last: new Date().getTime() - (helpers.day * 30)
      });
      return env.memory.flush(callback);
    };
    return env.settings.findModel({
      name: 'memory'
    }, function(err, memory) {
      if (!memory) {
        return _createMemory(callback);
      } else {
        console.log('memory loaded', memory.attributes);
        env.memory = memory;
        return callback();
      }
    });
  };

  initDb = function(callback) {
    console.log('connecting to database...');
    env.db = new mongodb.Db('loclog', new mongodb.Server('localhost', 27017), {
      safe: true
    });
    return env.db.open(callback);
  };

  closeDb = function(callback) {
    console.log('closing connection to database...');
    return env.db.close(callback);
  };

  getKml_ = function(from, to, callback) {
    console.log('requesting kml...');
    env.kml = fs.readFileSync('data.kml');
    return callback();
  };

  getKml = function(callback) {
    var from, to;
    from = env.memory.get('last');
    to = from + (helpers.hour * 3);
    if (new Date().getTime() - from < helpers.minute * 10) {
      return callback(true);
    }
    console.log("requesting kml from " + (new Date(from)) + " to " + (new Date(to)));
    return request({
      url: "https://maps.google.com/locationhistory/b/0/kml?startTime=" + from + "&endTime=" + to,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'max-age=0',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36'
      }
    }, function(error, response, kml) {
      if (!error && response.statusCode === 200) {
        console.log('got kml', kml);
        return parseKml(kml, function(err, data) {
          if (err) {
            return callback(true);
          }
          env.memory.set({
            last: to
          });
          return env.memory.flush(function() {
            return callback(error, kml);
          });
        });
      } else {
        console.log('error with request to google', error, (response != null ? response.statusCode : void 0) || null);
        return callback(true);
      }
    });
  };

  parseKml = function(kml, callback) {
    console.log('parsing kml...');
    return jsdom.env({
      src: [fs.readFileSync('zepto.min.js', 'utf8')],
      html: kml,
      done: function(err, window) {
        var gxtrack, pointArray, pointData, popy, queue;
        if (err) {
          return callback(err);
        }
        global.w = window;
        gxtrack = window.$('Placemark');
        if (!gxtrack) {
          return callback("NO GXTRACK, what is this?");
        }
        if (gxtrack.children.length < 3) {
          console.log("empty kml");
          return callback();
        }
        pointData = gxtrack.children()[3].children._toArray();
        pointData.pop();
        pointData.shift();
        pointData.shift();
        pointArray = [];
        popy = function() {
          return pointArray.push(new env.point({
            time: pointData.pop().innerHTML,
            coords: pointData.pop().innerHTML
          }));
        };
        while (pointData.length) {
          popy();
        }
        queue = new helpers.queue({
          size: 10
        });
        pointArray.forEach(function(point, i) {
          return queue.push(i, (function(callback) {
            return point.save(callback);
          }));
        });
        return queue.done(function(err, data) {
          console.log("imported " + (_.keys(data || {}).length) + " new points (" + (_.keys(err || {}).length) + " old points encountered)");
          return callback();
        });
      }
    });
  };

  getParseLoop = function(callback) {
    var loopy;
    loopy = function() {
      return getKml(function(err, data) {
        if (err) {
          return callback();
        }
        return loopy();
      });
    };
    return loopy();
  };

  init = function(callback) {
    return async.auto({
      db: initDb,
      models: ['db', initModels],
      memory: ['models', initMemory],
      getParseLoop: ['memory', getParseLoop],
      close: ['getParseLoop', closeDb]
    }, callback);
  };

  init(function(err, data) {
    if (!err) {
      console.log('bye');
      return process.exit(0);
    } else {
      console.log('error encountered', err);
      console.log('bye');
      return process.exit(1);
    }
  });

}).call(this);
