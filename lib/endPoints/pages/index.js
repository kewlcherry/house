//
// # Pages Collection API Endpoint
//
var spawn = require('child_process').spawn;
var ObjectID = mongo.ObjectID;
(exports = module.exports = function(house, options){
    
    // This endpoint requires a data source
    var ds = options.ds;
    var col = options.collection;
    var colFiles = options.collectionFiles || 'files.files';
    var filesRoot = 'files';
    var usersCol = 'users';
    var imagesCol = 'images';
    //var feedEndPoint = house.api.getEndPointByName("feed");
    var featurePrefix = '/features';
    var sectionPrefix = '/sections';
    
    var updateUserIdWithDoc = function(userId, doc, cb) {
        ds.update(usersCol, {_id: userId}, doc, function(err, data) {
            if(err) {
                console.log(err);
            } else {
                if(cb) cb();
            }
        });
    }
    var incUserField = function(userId, field, b) {
        b = b || 1;
        var updateDoc = {"$inc":{}};
        updateDoc["$inc"][field] = b;
        updateUserIdWithDoc(userId, updateDoc);
    }
    var incUserPages = function(userId, field, b) {
        incUserField(userId, 'pagesCount', b);
    }
    
    var handleReq = function(req, res, next) {
        var path = req.hasOwnProperty('urlRouted') ? req.urlRouted : req.url;
        var emitToRoomIn = function(col, verb, doc) {
            var colVerb = verb+col.charAt(0).toUpperCase() + col.substr(1);
            if(_.isArray(doc)) {
                _.each(doc, function(doc) {
                    emitToRoomIn(col, verb, doc);
                });
                return;
            }
            if(verb == 'deleted') {
                house.io.rooms.in(col).emit(colVerb, doc);
                return;
            }
            var groups = doc.groups || [];
            if(groups.indexOf('public') !== -1) {
                house.io.rooms.in(col).emit(colVerb, doc);
            } else {
                var ioRoomManager = house.io.rooms.in(col).manager;
                for(var id in ioRoomManager.handshaken) {
                    var handshake = ioRoomManager.handshaken[id];
                    var idSocket = house.io.rooms.socket(id);
                    if(handshake.session.groups && handshake.session.groups.length > 0) {
                        if(handshake.session.groups.indexOf('admin') !== -1) {
                            idSocket.in(col).emit(colVerb, doc);
                        } else {
                           for(var g in groups) {
                               if(handshake.session.groups.indexOf(groups[g]) !== -1) {
                                   idSocket.in(col).emit(colVerb, doc);
                                   break;
                               }
                           }
                        }
                    }
                }
            }
        }
        
        var countQuery = function(query) {
            if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
            } else if(req.session.data.user) {
            } else {
            }
            ds.count(col, query, function(err, data){
                if(err) {
                    house.log.err(err);
                } else {
                    res.setHeader('X-Count', data);
                    res.data({});
                }
            });
        }
        var filterData = function(data) {
            /*if(!_.isArray(data)) {
                if(data.hasOwnProperty('updates')) {
                    _.each(data.updates, function(doc,ii){
                        delete data.updates[ii].src;
                    });
                }
            } else {
                _.each(data, function(doc, i){
                    if(doc.hasOwnProperty('updates')) {
                        _.each(doc.updates, function(doc,ii){
                            delete data[i].updates[ii].src;
                        });
                    }
                });
            }*/
            return data;
        }
        var findQuery = function(query) {
            if(query.id) {
                query._id = query.id;
                delete query.id;
            }
            if(query.hasOwnProperty('_id') && typeof query._id == 'string') {
                try {
                    query._id = new ObjectID(query._id);
                } catch(e) {
                    console.log('bad object id');
                }
            }
            
            ds.find(col, query, function(err, data){
                if(err) {
                    house.log.err(err);
                } else if(data) {
                    data = filterData(data);
                    res.data(data);
                } else {
                    house.log.err(new Error('no data from mongo'));
                }
            });
        }
        
        var docId;
        var subPath = false;
        
        if(path.length > 1 && path.indexOf('/') === 0) {
            var docId = path.substr(1);
            var subSlashI = docId.indexOf('/');
            if(subSlashI !== -1) {
                docId = docId.substr(0, subSlashI);
                docId = new ObjectID(docId);
                subPath = path.substr(subSlashI+1);
            } else {
                docId = new ObjectID(docId);
            }
        }
        
        if(req.method == 'GET') {
            var query = {};
            
            if(docId) {
                query._id = docId;
                findQuery(query);
            } else {
                if(req.query) {
                    query = req.query;
                    
                    // query mongo id's
                    if(query.hasOwnProperty('id')) {
                        query._id = new ObjectID(query.id);
                        delete query.id;
                    }
                }
                findQuery(query);
            }
        } else if(req.method == 'HEAD') {
            var query = {};
            
            if(docId) {
                query._id = docId;
                findQuery(query);
            } else {
                if(req.query) {
                    query = req.query;
                }
                countQuery(query);
            }
        } else if(req.method == 'POST') {
            if(!req.session.data.user) {
                res.writeHead(403);
                res.end('{}');
                return;
            }
            house.log.debug('post');
            
            if(subPath && subPath === featurePrefix) {
                var newObj = req.fields;
                ds.find(col, {_id: docId}, function(err, docs) {
                    if(err) {
                        house.log.err(err);
                    } else {
                        if(_.isArray(docs)) {
                            var doc = _.first(docs);
                            var features = doc.features;
                            if(!newObj.hasOwnProperty('id')) {
                               var d = new Date();
                               newObj.id = d.getTime().toString();
                            }
                            if(!newObj.hasOwnProperty('rank')) {
                               newObj.rank = features.length;
                            }
                            
                            ds.update(col, {_id: docId}, {$push: {features: newObj}}, function(err, data){
                                res.data(newObj);
                            });
                        }
                    }
                });
            } else if(subPath && subPath === sectionPrefix) {
               var newObj = req.fields;
                ds.find(col, {_id: docId}, function(err, docs) {
                    if(err) {
                        house.log.err(err);
                    } else {
                        if(_.isArray(docs)) {
                            var doc = _.first(docs);
                            var sections = doc.sections;
                            if(!newObj.hasOwnProperty('id')) {
                               //var d = new Date();
                               //newObj.id = d.getTime().toString();
                               newObj.id = newObj.name.toLowerCase().replace(/ /gi, '-');
                            }
                            if(!newObj.hasOwnProperty('rank')) {
                               newObj.rank = sections.length;
                            }
                            
                            ds.update(col, {_id: docId}, {$push: {sections: newObj}}, function(err, data){
                                res.data(newObj);
                            });
                        }
                    }
                });
            } else if(path == '') {
                var newDoc = req.fields;
                newDoc.at = new Date();
                newDoc.owner = {
                    id: req.session.data.user,
                    name: req.session.data.name
                }
                ds.insert(col, newDoc, function(err, data){
                    var respondWithFind = function(docId) {
                        var query = {_id: docId};
                        ds.find(col, query, function(err, docs) {
                            if (err) {
                                house.log.err(err);
                            } else {
                                var resWithDoc = _.first(docs);
                                resWithDoc = filterData(resWithDoc);
                                res.data(resWithDoc);
                                emitToRoomIn(col, 'inserted', resWithDoc);
                            }
                        });
                    }
                    incUserPages(req.session.data.user, 1);
                    respondWithFind(data.id);
                });
            }
        } else if(req.method == 'PUT') {
            if(!req.session.data.user) {
                res.writeHead(403);
                res.end('{}');
                return;
            }
            var query = {};
            if(req.session.data.hasOwnProperty('groups') && req.session.data.groups.indexOf('admin') !== -1) {
                
            } else {
                query['owner.id'] = req.session.data.user;
            }
            
            if(subPath && subPath.indexOf(featurePrefix) === 0) {
                console.log('subPath of featurePrefix');
                // pull out the given group
                var featuresPathId = subPath.substr(featurePrefix.length+1);
                console.log(featuresPathId);
                
                query['features.id'] = featuresPathId;
                var updateDoc = {};
                
                if(req.fields.hasOwnProperty('$set')) {
                    updateDoc = {"$set": {}};
                    for(var i in req.fields['$set']) {
                        if(i !== 'id') {
                            updateDoc['$set']['features.$.'+i] = req.fields['$set'][i];
                        }
                    }
                }
                if(updateDoc == {}) return;
                ds.update(col, query, updateDoc, function(err, data){
                    if(err) {
                        house.log.err(err);
                        res.end('error');
                    } else {
                        house.log.debug(data);
                        res.data(data);
                    }
                });
            } else if(subPath && subPath.indexOf(sectionPrefix) === 0) {
                console.log('subPath of sectionPrefix');
                // pull out the given group
                var sectionPathId = subPath.substr(sectionPrefix.length+1);
                console.log(sectionPathId);
                
                query['sections.id'] = sectionPathId;
                var updateDoc = {};
                
                if(req.fields.hasOwnProperty('$set')) {
                    updateDoc = {"$set": {}};
                    for(var i in req.fields['$set']) {
                        if(i !== 'id') {
                            updateDoc['$set']['sections.$.'+i] = req.fields['$set'][i];
                        }
                    }
                }
                if(updateDoc == {}) return;
                ds.update(col, query, updateDoc, function(err, data){
                    if(err) {
                        house.log.err(err);
                        res.end('error');
                    } else {
                        house.log.debug(data);
                        res.data(data);
                    }
                });
            } else {
                if(docId) {
                    query._id = docId;
                    var putDoc = req.fields;
                    var updateGroups = false;
                    for(var k in putDoc) {
                        if(putDoc.hasOwnProperty(k) && k.substr(0,1) == '$') {
                            for(var colName in putDoc[k]) {
                                if(colName == 'groups') {
                                    updateGroups = true;
                                }
                                if(colName == 'owner') {
                                    
                                }
                            }
                        }
                    }
                    var doProc = false;
                    if(putDoc.hasOwnProperty('$set') && putDoc["$set"].hasOwnProperty('proc')) {
                        doProc = true;
                    }
                    
                    if(putDoc.hasOwnProperty('$set') && putDoc["$set"].hasOwnProperty('publish')) {
                        house.log.debug('publish site');
                        // phantom the page and write the html to index.html
                        var phantomUrl = function(url, callback) {
                            console.log('pantom url '+url)
                            var html = ''
                            , title = ''
                            , desc = '';
                            var fullPath = '/tmp/'+encodeURIComponent(url)+'.png';
                            var screenRes = '1024x768x24'; // 640x480x24
                            var phantomjs = spawn('xvfb-run', ['-as', '-screen 0 '+screenRes, 'phantomjs', __dirname+'/phantom.js', url, fullPath]);
                            phantomjs.stdout.on('data', function (data) {
                              //console.log('phantomjs.stdout: ' + data);
                              html += data.toString();
                            });
                              
                            phantomjs.stderr.on('data', function (data) {
                              console.log('!phantomjs stderr: ' + data);
                            });
                              
                            phantomjs.on('exit', function (code) {
                              console.log('phantomjs process exited with code ' + code);
                              if(html){ // good
                              
                                if(title != '') {
                                    console.log('url phantom got title: '+title);
                                    html = html.substr(html.indexOf(title)+title.length);
                                }
                                  
                              }
                                callback(null, fullPath, html, title);
                            });
                        }
                        house.log.debug(putDoc["$set"].publish);
                        phantomUrl(putDoc["$set"].publish, function(err, phantomImagePath, html, title) {
                            console.log(html);
                            // to root web for now
                            
                            var publishPath = 'web/index.html';
                            for(var f in house.config.filters) {
                                for(var filterName in house.config.filters[f]) {
                                    if(filterName == 'static') {
                                        if(house.config.filters[f][filterName].paper.publicFolder) {
                                            var p = process.cwd()+'/'+house.config.filters[f][filterName].paper.publicFolder;
                                            publishPath = p+'/index.html';
                                        }
                                    }
                                }
                            }
                            
                            console.log(publishPath);
                            fs.writeFile(publishPath, html, function(err){
                                if(err) {
                                    house.log.err(err);
                                    res.data({});
                                } else{
                                    res.data({publish: putDoc["$set"].publish});
                                }
                            });
                        });
                        
                        
                        return;
                    }
                    
                    ds.update(col, query, putDoc, function(err, data){
                        if(err) {
                            house.log.err(err);
                            res.end('error');
                        } else {
                            house.log.debug(data);
                            ds.find(col, query, function(err, data) {
                                var updatedDoc = _.first(data);
                                house.log.debug(data);
                                if(updateGroups) {
                                }
                                var putRespond = function(data) {
                                    data = filterData(data);
                                    res.data(data);
                                    emitToRoomIn(col, 'updated', data);
                                }
                                if(doProc) {
                                    //processPages(data, function(err, data){
                                        putRespond(data);
                                    //});
                                } else {
                                    putRespond(data);
                                }
                            });
                        }
                    });
                }
            }
        } else if(req.method == 'DELETE') {
            if(!req.session.data.user) {
                res.writeHead(403);
                res.end('{}');
                return;
            }
            var query = {};
            if(req.session.data.hasOwnProperty('groups') && req.session.data.groups.indexOf('admin') !== -1) {
                
            } else {
                query['owner.id'] = req.session.data.user;
            }
            if(docId) {
                if(subPath && subPath.indexOf(featurePrefix) === 0) {
                    // pull out the given group
                    var featureId = subPath.substr(featurePrefix.length+1);
                    console.log(featureId);
                    ds.update(col, {"_id": docId}, {"$pull": {"features": {"id": featureId}}}, function(err, data){
                        if(err) {
                            house.log.err(err);
                        } else {
                            house.log.debug(data);
                        }
                        res.data(featureId);
                    });
                } else if(subPath && subPath.indexOf(sectionPrefix) === 0) {
                    // pull out the given group
                    var sectionId = subPath.substr(sectionPrefix.length+1);
                    console.log(sectionId);
                    ds.update(col, {"_id": docId}, {"$pull": {"sections": {"id": sectionId}}}, function(err, data){
                        if(err) {
                            house.log.err(err);
                        } else {
                            house.log.debug(data);
                        }
                        res.data(sectionId);
                    });
                } else {
                    query._id = docId;
                    ds.find(col, query, function(err, data) {
                        var doc = _.first(data);
                        incUserPages(req.session.data.user, -1);
                        ds.remove(col, query, function(err, data){
                            if(err) {
                                house.log.err(err);
                                res.end('error');
                            } else {
                                res.data(data);
                                emitToRoomIn(col, 'deleted', docId);
                            }
                        });
                    });
                }
            }
        } else if(req.method == 'OPTIONS') {
            
        }
    }
    
    return handleReq;
});
