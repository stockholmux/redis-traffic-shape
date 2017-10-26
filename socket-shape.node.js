const
  delayFns        = {
    noDelay               : function(){ return 0;},
    linear                : function(currentCount) { return currentCount * masterdelay; },
    batch3                : function(currentCount) { return Math.floor(currentCount / 3) * masterdelay; },
  }
  argv            = require('yargs')                                // "yargs" is a command line argument module
                    .demand('connection')                           // 'connection' is the path to the node_redis style connection object
                    .default('wssport',8855)  
                    .default('httpport',9000) 
                    .default('masterdelay',50)
                    .choices('delayFn', Object.keys(delayFns)) 
                    .default('delayFn','linear')                     
                    .argv,
  async           = require('async'),
  express         = require('express'),                             // HTTP server for node
  redis           = require('redis'),                               // node_redis to manage the redis connection
  WebSocketServer = require('ws').Server,                           // Web socket server module
  connection      = require(argv.connection),
  client          = redis.createClient(connection),
  wss             = new WebSocketServer({ 
                      port : argv.wssport 
                  }),
  rk              = require('rk'),
  server          = express(),
  masterdelay     = Number(argv.masterdelay),
  keys            = { delay : 'delay' };

function incDestKey(incValued) {                                    // Closure to increment / decrement values, pass in 1 or -1 respectively
  return function(destination,payload,cb) {                         // destination would be the request destination resource, payload keeps track of the request
    client.incrby(                                                  // send INCRBY to redis
      rk(keys.delay, destination),                                  // delay:[resource dest]
      incValued,                                                    // 1 or -1
      function(err,currentCount) {
        if (err) { cb(err); } else {                                // handle error
          cb(err,destination,payload,currentCount);                 // pass values back so the next fn in the sequence can handle
        }
      }
    );
  };
}

function delayedRequest(ws,delayFn) {                               // another closure, this time to manage stateful websockets
  return async.seq(                                                 // Run each argument as a function, passing it's outputs to the next input
    incDestKey(1),                                                  // Increase the correct counter
    function(destination,payload,currentCount,cb) {                 // the arguments come from the previous return values
      setTimeout(function() {                                       // simple timeout
        ws.send(payload, function(err) {                            // after timer is complete, send the result back via websocket. 
          cb(err,destination,payload);                              // in a 'real' example, you would do your real "work" here
        });
      }, delayFns[delayFn](currentCount));                          // timeout delay based on the delayFn (passed in from command line) and the counter from redis
    },
    incDestKey(-1)
  );
}

wss.on('connection', function(ws) {                                 // When a new web socket server connection occurs
  let
    socketDelayedRequest  = delayedRequest(ws,argv.delayFn);        // setup the delay fn for this websocket, it returns a function we use later

  ws.on('message', function(requestAndMessage) {                    // when messages come in
    let splitData = requestAndMessage.split(',');                   // the client sends messages like this "[message],[request id]" 
    socketDelayedRequest(splitData[0],splitData[1]);                // Effectively, this goes the the inner function of incDestKey (first function in the sequence)
  });
});

/*  This server is a functionally single user (for simplicity), if you were designing a real-world traffic shaper, you'd want to add an additional layer of users,
    isolating each user's counts */
server
  .use(express.static('static'))
  .listen(argv.httpport,function() {
    console.log('HTTP server up at',argv.httpport);
    console.log('Web socket server up at',argv.wssport);
  });
