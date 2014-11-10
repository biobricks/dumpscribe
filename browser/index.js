#!/usr/bin/env nodejs

var fs = require('fs');
var util = require('util');
var async = require('async');
var express     = require('express');
var path        = require('path');
var bodyParser  = require('body-parser');
var argv = require('minimist')(process.argv.slice(2));

function usage() {
  console.error("Usage: index.js output_from_convert_and_organize.py")
}

function error(res, msg) {
  res.status(500).send(JSON.stringify({
      status: 'error',
      msg: msg
  }));
}

if(argv._.length < 1) {
  usage();
  process.exit(1);
}

var dataDir = argv._[0];

var app = express();

app.use(express.static(path.join(__dirname, 'static')));

var pendataMount = 'pendata';

app.use('/' + pendataMount, express.static(dataDir));


function getNotebookPages(id, callback) {
    var pages = {};
     
    var m;
    var nbDirname = 'notebook-'+id;
    var nbDir = path.join(dataDir, nbDirname);
    fs.readdir(nbDir, function(err, nbfiles) {
        if(err) return callback(err);


        // for each file in the notebook directory
        async.eachSeries(nbfiles, function(nbfile, fcallback) {
            // for pdf files
            if(nbfile.match(/\.pdf$/)) {
                m = nbfile.match(/page-(\d+)/);
                if(!m) return fcallback();
                var number = parseInt(m[1]);
//                console.log("parseInt: " + m[1]);
                fs.stat(path.join(nbDir, nbfile), function(err, stats) {
                    if(err) return fcallback(err);

//                    console.log("for page " + nbfile + ' - ' + number);

                    if(!pages[number]) {
                        pages[number] = {
                            recordings: []
                        };
                    }
                    pages[number].pdf = pendataMount + '/' + nbDirname + '/' + nbfile;
                    pages[number].thumbnail = pendataMount + '/' + nbDirname + '/thumbnails/' + nbfile + '.png';
                    pages[number].number = number;
                    pages[number].date = stats.ctime;
                    pages[number].size = stats.size;
                    fcallback();
//                    console.log(pages);
                });
                
            // for audio files
            } else if(nbfile.match(/\.ogg$/) || nbfile.match(/\.aac$/)) {
                m = nbfile.match(/page-(\d+)/);
                if(!m) return fcallback();
                number = parseInt(m[1]);
                
                fs.stat(path.join(nbDir, nbfile), function(err, stats) {
                    if(err) return fcallback(err);

                    // TODO add length in seconds
                    var recording = {
                        date: stats.ctime,
                        size: stats.size
                    };

                    if(!pages[number]) {
                        pages[number] = {
                            number: number,
                            recordings: [recording]
                        }
                    } else {
                        pages[number].recordings.push(recording);
                    }
                    
                    fcallback();
                });
            } else {
                fcallback();
            }
        }, function(err) {
            if(err) return callback(err);
            callback(null, pages);
        });
    });
}

function getNotebookSummary(basePath, nbdirs, callback) {

    data = {};

    async.eachSeries(nbdirs, function(nbdir, nbcallback) {
        nbpath = path.join(basePath, nbdir);
        var id = nbdir.replace(/^notebook-/, '');
        data[nbdir] = {
            id: id,
            dirname: nbdir,
            name: id,
            date: null,
            pages: [],
            audio: []
        };

        fs.readdir(nbpath, function(err, nbfiles) {
            if(err) return nbcallback(err);
            
            fs.readFile(path.join(nbpath, "notebook_name"), function(err, nbname) {
                if(!err) {
                    data[nbdir].name = nbname.toString('utf8').replace(/[\n\r\t]+/, '');
                }

                async.eachSeries(nbfiles, function(nbfile, fcallback) {
                    if(nbfile.match(/\.pdf$/)) {
                        data[nbdir].pages.push(nbfile);

                        fs.stat(path.join(nbpath,  nbfile), function(err, stats) {
                            if(err) return fcallback(err);

                            if(!data[nbdir].date || (stats.ctime > data[nbdir].date)) {
                                data[nbdir].date = stats.ctime;
                            }
                            fcallback();
                        });
                    } else if(nbfile.match(/\.ogg$/) || nbfile.match(/\.aac$/)) {
                        data[nbdir].audio.push(nbfile);
                        fcallback();
                    } else {
                        fcallback();
                    }
                }, function(err) {
                    if(err) return nbcallback(err);
                    nbcallback();
                });
            });
        });

    }, function(err) {
        if(err) return callback(err);
        callback(null, data);
    });
    
}

// Return list of notebooks in JSON
app.get('/notebooks', function(req, res){
    fs.readdir(dataDir, function(err, files) {
        if(err) return error(res, "failed to list files in data dir: " + err);
        files = files.filter(function(el) {
            if(el.match(/^notebook-/)) {
                return true;
            } else {
                return false;
            }
        });
        
        getNotebookSummary(dataDir, files, function(err, data) {
            if(err) return error(res, "Failed to get notebook list: " + err);

            res.send(JSON.stringify({
                status: 'success',
                data: data
            }));
        });
    });
});


function orderPages(pages, order_by) {
    var arr = [];
    var key;
    for(key in pages) {
        arr.push(pages[key]);
    }
    arr.sort(function(a, b) {
        return a[order_by] - b[order_by];
    });
    return arr;
}

// TODO implement ordering by page number or last modified time
app.use('/notebook/:id', function(req, res, next){
    var id = req.params.id;
    var order = req.query.order || 'pagenumber'; // can also be 'date'

    getNotebookPages(id, function(err, pages) {
        if(err) return error(res, "Failed to get notebook page info: " + err);

        if(order == 'date') {
            pages = orderPages(pages, 'date');
        } else {
            pages = orderPages(pages, 'pagenumber');
        }

        res.send(JSON.stringify({status: 'success', data: pages}));
        next();
    });
});

// TODO request for a specific notebook and order by page or by datetime
app.get('/audio', function(req, res){
    res.send("not implemented");
});


app.post('/name_notebook', function(req, res){
    res.send("not implemented");
});


app.listen(4000);
