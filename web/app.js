if(process.env.VCAP_SERVICES){
  var env = JSON.parse(process.env.VCAP_SERVICES);
  var mongo = env['mongodb-1.8'][0]['credentials'];
}
else{
  var mongo = {
    "hostname":"localhost",
    "port":27017,
    "username":"",
    "password":"",
    "name":"",
    "db":"db"
  }
}

var generate_mongo_url = function(obj){
  obj.hostname = (obj.hostname || 'localhost');
  obj.port = (obj.port || 27017);
  obj.db = (obj.db || 'test');

  if(obj.username && obj.password){
    return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
  }
  else{
    return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
  }
}

var mongourl = generate_mongo_url(mongo);
var port = (process.env.VMC_APP_PORT || 3000);
var host = (process.env.VCAP_APP_HOST || 'localhost');

var Db = require('mongodb').Db,
    Server = require('mongodb').Server,
    ObjectID = require('mongodb').ObjectID,
    GridStore = require('mongodb').GridStore;

var express = require('express');
var url = require('url');
var path = require('path');
var fs = require('fs');
var app = express.createServer();
app.use(express.bodyParser());
app.use(app.router);

fs.readFile('./markers.html', function (err, html) {
     if (err) {
        throw err;
     }
     app.get('/', function(req, res) {
         res.writeHead(200, {"Content-Type":"text/html"});
         res.write(html);
         res.end();
     });
});
app.get('/markers.xml', function(req, res) {
    require('mongodb').connect(mongourl, function(err, db) {
       var bounds = req.param("bounds").split(",");
       var slat = Number(bounds[0]);
       var wlng = Number(bounds[1]);
       var nlat = Number(bounds[2]);
       var elng = Number(bounds[3]);

       db.collection('documentlocation',function(err,collection) {
          collection.find({$and:[{lat:{$gte:slat}},{lat:{$lte:nlat}},
             {lng:{$gte:wlng}},{lng:{$lte:elng}}]},
             {}, function(err,cursor) {
                      cursor.toArray(function(err,items) {
                          res.writeHead(200, {"Content-Type": "text/xml"});
                          res.write('<?xml version="1.0"?>\n' + '<markers>\n');
                          for(i=0; i<items.length; i++) {
                             res.write('<marker>');
                             res.write('<lat>' + JSON.stringify(items[i].lat) +' </lat>');
                             res.write('<lng>'+ JSON.stringify(items[i].lng) +'</lng>');
                             res.write('<hm>'+ JSON.stringify(items[i].hm) + '</hm>');
                             res.write('</marker>');
                          }
                          res.write('</markers>');
                          res.end();
                      });
          });
       });
    });
});
app.get('/file/:fileid',function(req,res) {
    var ObjectID = require('mongodb').ObjectID;
    require('mongodb').connect(mongourl, function(err, db) {
        var gs = new GridStore(db,ObjectID.createFromHexString(req.params.fileid),'r');
        gs.open(function(err,gs) {
            gs.read(gs.length,function(err,dat){
               res.writeHead('200', {'Content-Type': ''});
               res.write(dat,'binary');
               res.end();
            });
        });
    });
});
app.get('/js/*',function(req,res) {
    var uri, filename;
    uri = url.parse(req.url).pathname;
    filename = path.join(process.cwd(), uri);
    contentType = 'text/javascript';
    fs.readFile(filename, function(error, content) {
       if (error) {
          res.writeHead(500);
          res.end();
       }
       else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
       }
    });
});
app.get('/css/*',function(req,res) {
    var uri, filename;
    uri = url.parse(req.url).pathname;
    filename = path.join(process.cwd(), uri);
    contentType = 'text/css';
    fs.readFile(filename, function(error, content) {
       if (error) {
          res.writeHead(500);
          res.end();
       }
       else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
       }
    });
});
app.get('/themes/*',function(req,res) {
    var uri, filename;
    uri = url.parse(req.url).pathname;
    filename = path.join(process.cwd(), uri);
    contentType = 'text/css';
    fs.readFile(filename, function(error, content) {
       if (error) {
          res.writeHead(500);
          res.end();
       }
       else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
       }
    });
});
app.post('/formupload',function(req,res) {
    require('mongodb').connect(mongourl, function(err, db) {
        var fileId = new ObjectID();
        var gridStore = new GridStore(db, fileId, 'w');
        var fileSize = fs.statSync(req.files.upload.path).size;
        var happymeter = req.body.hm.slice(0, req.body.hm.length-1);
        gridStore.open(function(err, gridStore) {
            gridStore.writeFile(req.files.upload.path, function(err, doc) {
                GridStore.read(db, fileId, function(err, fileData) {
                    db.collection('documentlocation',function(err,collection) {
                        collection.insert( {fileid:fileId.toHexString(), lat:Number(req.body.lat),
                                            lng:Number(req.body.lng), hm:Number(happymeter)})
                    }, {safe:true},function(err) {
                        res.send("Inserted record");
                        if(err) {
                            res.send("Error")
                        }
                   });
                });
            });
        });
    });
    res.end()
});
app.get('/display',function(req,res) {
    require('mongodb').connect(mongourl, function(err, db) {
        db.collection('documentlocation',function(err,collection) {
            collection.find( {}, {}, function(err,cursor) {
                cursor.toArray(function(err,items) {
                    res.writeHead(200, {"Content-Type": "text/html"});
                    for(i=0; i<items.length; i++) {
                        res.write(JSON.stringify(items[i])+"\n");
                    }
                    res.end();
                });
            });

        });
    });

});
app.get('/displaypic',function(req,res) {
    var ObjectID = require('mongodb').ObjectID;
    require('mongodb').connect(mongourl, function(err, db) {
        var latlng = req.param("latlng").split(",");
        var clat = Number(latlng[0]);
        var clng = Number(latlng[1]);
        db.collection('documentlocation',function(err,collection) { 
             collection.find( {$and: [{lat:{$gte:clat-0.001}},{lat:{$lte:clat+0.001}},
               {lng:{$gte:clng-0.001}},{lng:{$lte:clng+0.001}}]  },
               {}, function(err,cursor) {
                 cursor.toArray(function(err,items) {
                   res.writeHead(200, {"Content-Type": "text/html"});
                   for(i=0; i<items.length; i++) {
                     res.write('<img src="file/' + items[i].fileid + '" hspace="5" height="100" width="100">');
                   }
                   res.end();
                });
            });
        });
    });
});
app.listen(port, host);
