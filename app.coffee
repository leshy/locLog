fs = require('fs')
jsdom = require('jsdom').jsdom;
_ = require 'underscore'
Backbone = require 'backbone4000'
mongodb = require 'mongodb'
collections = require 'collections/serverside'
async = require 'async'
request = require 'request'
helpers = require 'helpers'
env = {}

cookie = require('./cookie').cookie

initModels = (callback) -> 
    console.log 'initializing models...'
    env.settings = new collections.MongoCollection db: env.db, collection: 'settings'
    env.setting = env.settings.defineModel 'setting', {}
    
    env.points = new collections.MongoCollection db: env.db, collection: 'points'
    env.point = env.points.defineModel 'point',
        initialize: () ->
            #2014-09-27T15:33:46.745-07:00 -> date object
            time = @get('time').match('(.*)-(.*)-(.*)T(.*):(.*):(.*)\\.(.*)-(.*):(.*)')
            
            date = new Date()
            date.setUTCFullYear time[1]
            date.setUTCMonth (time[2] - 1)
            date.setUTCDate time[3]
            date.setUTCHours time[4]
            date.setUTCMinutes time[5]
            date.setUTCSeconds time[6]
            date.setUTCMilliseconds time[7]
            
            
            coords = @get('coords').split(' ')
            @unset 'coords'
#            console.log @get('time'), date, "diff is h:", Number(time[8]), "m:", Number(time[9])
            console.log @get('time'), new Date(date.getTime() + (helpers.hour * Number(time[8]) + helpers.minute * Number(time[9])))
            @set time: date.getTime() + (helpers.hour * Number(time[8]) + helpers.minute * Number(time[9])), lat: coords[1], lng: coords[0]
        show: ->
            'time: ' + @time + " coords: " + @coords
        
        save: (callback) ->
            env.points.findOne { time: @get 'time' }, (err,data) =>
                if data then return callback 'exists'
                @flush callback
                        
    callback()


initMemory = (callback) ->
    _createMemory = (callback) ->
        console.log 'memory not found, creating new one'
        env.memory = new env.setting name: 'memory', last: new Date().getTime() - (helpers.day * 30)
        env.memory.flush callback
        
        
    env.settings.findModel { name: 'memory' }, (err,memory) ->
        if not memory then _createMemory callback
        else
            console.log 'memory loaded', memory.attributes
            env.memory = memory; callback()


initDb = (callback) ->
    console.log 'connecting to database...'
    env.db = new mongodb.Db 'loclog', new mongodb.Server('localhost', 27017), safe: true
    env.db.open callback

closeDb = (callback) ->
    console.log 'closing connection to database...'
    env.db.close callback

getKml_ = (from,to,callback) ->
    console.log 'requesting kml...'
    env.kml = fs.readFileSync('data.kml')
    callback()
    
getKml = (callback) ->
    from = env.memory.get 'last'
    to = new Date().getTime()
        
    console.log "requesting kml from #{ new Date(from) } to #{ new Date(to) }"
    request {
        url: "https://maps.google.com/locationhistory/b/0/kml?startTime=#{from}&endTime=#{to}"
        headers: {
            'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            'Cache-Control':'max-age=0'
            'Cookie': cookie
            'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36'
            }
        }, (error,response,kml) ->
            if not error and response.statusCode is 200
                console.log 'got kml', kml
                env.kml = kml
                callback()
                #parseKml kml, (err,data) ->
                #    if err then return callback true 
                #    callback error, kml
            else
                console.log 'error with request to google', error, response?.statusCode or null
                callback true

parseKml = (callback) ->
    console.log 'parsing kml...'
    jsdom.env
        src: [ fs.readFileSync('zepto.min.js', 'utf8') ]
        html: env.kml
        done: (err,window) ->
            if err then return callback err
            global.w = window
            gxtrack = window.$('Placemark')
            if not gxtrack then return callback "NO GXTRACK, what is this?"
            gxtrack = gxtrack.children()
            pointData = gxtrack[3].children._toArray()

            if pointData.length < 4
                console.log "no data (#{pointData.length})"
                return callback()
            pointData.pop()
            pointData.shift()
            pointData.shift()
                
            pointArray = []
            popy = ->
                pointArray.push new env.point time: pointData.pop().innerHTML, coords: pointData.pop().innerHTML
                    
            popy() while pointData.length 

            queue = new helpers.queue size: 10
            pointArray.forEach (point,i) -> queue.push i, ((callback) ->
                env.memory.set last: point.get 'time'
                point.save callback)
            queue.done (err,data) ->
                console.log "imported #{_.keys(data or {}).length} new points (#{_.keys(err or {}).length} old points encountered)"
                env.memory.flush ->
                    console.log new Date(env.memory.get 'last')
                    callback()

getParseLoop = (callback) ->
    loopy = -> 
        getKml (err,data) ->
            #console.log err, data
            if err then return callback()
            loopy()
    loopy()
        
init = (callback) ->
    async.auto {
        db: initDb
        models: [ 'db', initModels ]
        memory: [ 'models', initMemory ]
#        getParseLoop: [ 'memory', getParseLoop ]
        getKml: [ 'memory', getKml ]
        parseKml: [ 'getKml','models', parseKml ]
        close: [ 'getParseLoop', closeDb ]
        }, callback



            

init (err,data) ->
    if not err
        console.log 'bye'
        process.exit 0
    else
        console.log 'error encountered', err
        console.log 'bye'
        process.exit 1
        


#swank = require("swank-js/client/node").setupNodeJSClient()
#global.i = require('sys').inspect


#https://www.google.com/maps/place/41.8872524,12.4035027
#http://maps.google.com/maps?q=(bla)+41.8872524,12.4035027

