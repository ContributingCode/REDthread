if(process.env.VCAP_SERVICES) {
    var env = JSON.parse(process.env.VCAP_SERVICES);
    var mongo = env['mongodb-1.8'][0]['credentials'];
}
else {
    var mongo = {
        "hostname":"localhost",
        "port":27017,
        "username":"",
        "password":"",
        "name":"",
        "db":"db"
    }
}

var generate_mongo_url = function(obj) {
    obj.hostname = (obj.hostname || 'localhost');
    obj.port = (obj.port || 27017);
    obj.db = (obj.db || 'test');

    if(obj.username && obj.password) {
        return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
    }
    else {
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
app.use(express.bodyParser( {uploadDir:process.env.PWD || '/tmp'}));
app.use(app.router);
var db;
Db.connect(mongourl, function(err, dbobj) {
    db = dbobj
});

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
    var bounds = req.param("bounds").split(",");
    var slat = Number(bounds[0]);
    var wlng = Number(bounds[1]);
    var nlat = Number(bounds[2]);
    var elng = Number(bounds[3]);

    if(db!=null) {
        db.collection('documentlocation',function(err,collection) {
            collection.find( {"lat":{$gte:slat, $lte:nlat}, "lng":{$gte:wlng, $lte:elng}},
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
    } else {
        Db.connect(mongourl, function(err, dbobj) {
            db = dbobj
        });

    }
});
app.get('/file/:fileid',function(req,res) {
    var ObjectID = require('mongodb').ObjectID;
    if(db!=null) {
        var gs = new GridStore(db,ObjectID.createFromHexString(req.params.fileid),'r');
        gs.open(function(err,gs) {
            if (gs.length) {
                gs.read(gs.length,function(err,dat) {
                    res.writeHead('200', {'Content-Type': '', 'Cache-Control':'public'});
                    res.write(dat,'binary');
                    res.end();
                });
            }
        });
    }
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
    fs.readFile(filename, function(error, content) {
        if (error) {
            res.writeHead(500);
            res.end();
        }
        else {
            res.writeHead(200, { 'Content-Type': ''});
            res.end(content, 'binary');
        }
    });
});
app.get('/images/*',function(req,res) {
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
    if(db!=null) {
        var response = "Uploading...";
        var happymeter;
        var fileId = new ObjectID();
        var gridStore = new GridStore(db, fileId, 'w');
        var location = req.body.location;
        var lat = Number(req.body.lat);
        var lng = Number(req.body.lng);
        if (req.body.hm) {
            happymeter = req.body.hm.slice(0, req.body.hm.length-1);
        }
        else {
            happymeter = 49;
        }
        if (lat == 0) {
            location = "VMware";
            lat = 37.400563;
            lng = -122.142138;
            if (happymeter == 0)
                happymeter = 51;
        }
	if(location==null){
	    location= "Default";
	}
        if (req.files.upload) {
            gridStore.open(function(err, gridStore) {
                gridStore.writeFile(req.files.upload.path, function(err, doc) {
                    fs.unlink(req.files.upload.path);
                    db.collection('documentlocation',function(err,collection) {
                        collection.insert( {fileid:fileId.toHexString(), lat:lat,
                                            lng:lng, hm:Number(happymeter),
                                            time:Date.now(), location:location
                                           })
                    }, {safe:true},function(err) { });
                });
            });
            response="Thanks for the upload!";
            res.send(response);
            res.end()
        }
    } else {

        Db.connect(mongourl, function(err, dbobj) {
            db = dbobj
        });
    }
});
app.get('/display',function(req,res) {
    if(db!=null) {
        db.collection('documentlocation',function(err,collection) {
            collection.find( {}, {}, function(err,cursor) {
                cursor.toArray(function(err,items) {
                    res.writeHead(200, {"Content-Type":"text/html"});
                    for(i=0; i<items.length; i++) {
                        res.write(JSON.stringify(items[i])+"\n");
                    }
                    res.end();
                });
            });

        });
    } else {
        Db.connect(mongourl, function(err, dbobj) {
            db = dbobj
        });
    }


});
app.get('/displaypic',function(req,res) {
    if(db!=null) {
        var ObjectID = require('mongodb').ObjectID;
        var bounds = req.param("bounds").split(",");
        var slat = Number(bounds[0]);
        var wlng = Number(bounds[1]);
        var nlat = Number(bounds[2]);
        var elng = Number(bounds[3]);

        db.collection('documentlocation',function(err,collection) {
            collection.find( {"lat":{$gte:slat, $lte:nlat}, "lng":{$gte:wlng, $lte:elng}},
            {limit:5, sort:[['time','desc']]}, function(err,cursor) {
                cursor.toArray(function(err,items) {
                    res.writeHead(200, {'Content-Type':'text/html','Cache-Control':'public'});
                    for(i=0; i<items.length; i++) {
                        var unit = "secs";
                        var timeNow = (Number(Date.now()) - Number(items[i].time))/1000;
                        if (timeNow > 60) {
                            timeNow /= 60;
                            if (timeNow > 60) {
                                timeNow /= 60;
                                unit = "hrs";
                            }
                            else {
                                unit = "mins";
                            }
                        }
                        res.write('<p><div style="height: 80px; background-color:#dfeffc">');
                        res.write('<img src="file/' + items[i].fileid + '" style="float:left" height="80" width="80">');
                        res.write('<font size="3">');
                        res.write(items[i].location + '</font><br>');
                        res.write('<font size="2"><i>' + Math.ceil(timeNow) + " "  + unit + ' ago </i></font><br>');
                        if (items[i].hm > 50)
                            res.write('<font size="2" color=green><i>' + items[i].hm +' %</i></font><br>');
                        else
                            res.write('<font size="2" color=red><i>' + items[i].hm +' %</i></font><br>');
                        res.write('</div></p>');
                    }
                    res.end();
                });
            });
        });
    } else {
        Db.connect(mongourl, function(err, dbobj) {
            db = dbobj
        });
    }

});
app.listen(port, host);
