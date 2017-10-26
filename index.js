const
  argv          = require('yargs')
                  .demand('connection')
                  .argv,
  async         = require('async'),
  redis         = require('redis'),
  connection    = require(argv.connection),
  _progress     = require('cli-progress'),
  express       = require('express'),
  server        = express(),
  rk            = require('rk'),
  cuid          = require('cuid'),
  EventEmitter  = require('events').EventEmitter, 
  localEvents   = new EventEmitter(),
  dummyServer   = require('./dummy-server.node.js'),
  request       = require('request');
var
  client,
  blockingClient;

client = redis.createClient(connection);
blockingClient = redis.createClient(connection);
var bar1 = new _progress.Bar({}, _progress.Presets.shades_classic);

dummyServer(3001,500);

/*
  1. Initial requests are responded to immediately
  2. If a threshold is met, request are queued up
  3. Queue is released, in order, at a regular rate
  4. Once queue is at 0, requests are, once again, responded immediately
*/

/*function process() {
  blockingClient.brpoplpush('active','active-processing',0,function(err,activeQueue) {
    if (err) { throw err; } 
    //console.log(activeQueue,'brpoplpush');
    process();
  });
}
process();*/


function process(user,cb) {
  var
    processingKey = rk('processing-active',user);
  
  client.rpoplpush(
    rk('active',user), 
    processingKey,
    function(err,jobId) {
      var 
        payload       = rk('p',user,jobId);
      
      client.get(payload,function(err,payload) {
        console.log('send')
        request('http://localhost:3001/'+payload,function(err,resp,body) {
          client.lrem(processingKey,0,jobId);
          client.del(rk('p',user,jobId));
          console.log('emit');
          localEvents.emit(jobId,body);
          if (cb) {
            cb();
          }
        });
      });
    }
  );
}

let slowQueue = async.queue(function(user,callback) {
  setTimeout(function() {
    process(user,callback);
  },1000);
});

slowQueue.drain = function() {
  console.log('empty slow queue');
};

function when(jobId,cb) {
  var 
    handler = function(payload) {
      console.log('handle');
      cb(payload);
      localEvents.removeListener(jobId,handler);
    };
  localEvents.on(jobId,handler);
}

server.get('/:user/:payload',function(req,res,next) {
  var
    jobId = cuid();
  
  client
    .multi()
    .lpush(rk('active',req.params.user),jobId)
    .llen(rk('processing-active',req.params.user))
    .set(rk('p',req.params.user,jobId), req.params.payload)
    .exec(function(err,results) {
      if (err) { next(err); } else {
        let userQueueLength = Number(results[1]);
        console.log('queue length',userQueueLength);
        if (userQueueLength < 5) {
          console.log('immediately', jobId);
          process(req.params.user);
        } else {
          slowQueue.push(req.params.user);
          console.log('trigger delay',jobId,slowQueue.length());
        }
        //bar1.update(results[1]);
        console.log(jobId, results);
      }
    });
  
  when(jobId,function(payload) {
    console.log('when', slowQueue.length());
    res.send('OK '+req.params.user+' '+payload);
  })
});


server.listen(3000,function() {
  console.log('up.');
})