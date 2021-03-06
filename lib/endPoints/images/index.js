//
// # Images Collection API Endpoint
//
var ObjectID = mongo.ObjectID;

(exports = module.exports = function(house, options){
    
    // This endpoint requires a data source
    var ds = options.ds;
    var col = options.collection;
    var filesRoot = ds.options.filesCol || 'files';
    var colFiles = filesRoot+'.files';
    var usersCol = 'users';
    
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
        var updateDoc = {"$inc":{field: b}};
        updateUserIdWithDoc(userId, updateDoc);
    }
    var incUserImages = function(userId, field, b) {
        incUserField(userId, 'imagesCount', b);
    }
    
    var handleReq = function(req, res, next) {
        var path = req.hasOwnProperty('urlRouted') ? req.urlRouted : req.url;
        var feedEndPoint = house.api.getEndPointByName("feed");
        var checkinsEndPoint = house.api.getEndPointByName("checkins");
        var emitToRoomIn = function(col, verb, doc) {
            if(_.isArray(doc)) {
                _.each(doc, function(doc) {
                    emitToRoomIn(col, verb, doc);
                });
                return;
            }
            if(verb == 'deleted') {
                house.io.rooms.in(col).emit(verb+'Images', doc);
                return;
            }
            var groups = doc.groups || [];
            if(groups.indexOf('public') !== -1) {
                house.io.rooms.in(col).emit(verb+'Images', doc);
            } else {
                var ioRoomManager = house.io.rooms.in(col).manager;
                for(var id in ioRoomManager.handshaken) {
                    var handshake = ioRoomManager.handshaken[id];
                    var idSocket = house.io.rooms.socket(id);
                    if(handshake.session.groups && handshake.session.groups.length > 0) {
                        if(handshake.session.groups.indexOf('admin') !== -1) {
                            idSocket.emit(verb+'Images', doc);
                        } else {
                           for(var g in groups) {
                               if(handshake.session.groups.indexOf(groups[g]) !== -1) {
                                   idSocket.emit(verb+'Images', doc);
                                   break;
                               }
                           }
                        }
                    }
                }
            }
        }
        
        var countQuery = function(query) {
            if(!query.hasOwnProperty('$or')) {
                query["$or"] = [];
            }
            if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
            } else if(req.session.data.user) {
                query["$or"].push({"owner.id": req.session.data.user});
                if(req.session.data.groups) {
                    query["$or"].push({"groups": {$in: req.session.data.groups}});
                }
            } else {
                //query["groups"] = 'public';
                query["$or"].push({"groups": 'public'});
            }
            if(query["$or"].length == 0) {
                delete query["$or"];
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
            
            if(!query.hasOwnProperty('$or')) {
                query["$or"] = [];
            }
            if(req.session.data.groups && req.session.data.groups.indexOf('admin') !== -1) {
            } else if(req.session.data.user) {
                query["$or"].push({"owner.id": req.session.data.user});
                if(req.session.data.groups) {
                    query["$or"].push({"groups": {$in: req.session.data.groups}});
                }
            } else {
                //query["groups"] = 'public';
                query["$or"].push({"groups": 'public'});
            }
            if(query["$or"].length == 0) {
                delete query["$or"];
            }
            ds.find(col, query, function(err, data){
                if(err) {
                    house.log.err(err);
                } else if(data) {
                    res.data(data);
                } else {
                    house.log.err(new Error('no data from mongo'));
                }
            });
        }
        
        var insertDocToFeed = function(doc, callback) {
            var newFeedItem = {
                "ref": {"col": "images", "id": doc.id},
                "image": doc,
                "groups": doc.groups,
                "owner": doc.owner,
                "at": doc.at,
            }
            feedEndPoint({session: req.session, method: 'POST', url: '', fields: newFeedItem}, {end:function(){}, data:function(newFeedData){
                if(_.isArray(newFeedData)) {
                    newFeedData = _.first(newFeedData);
                }
                ds.update(col, {"_id": doc.id}, {"$set": {"feed": {id:newFeedData.id,at:newFeedData.at}}}, function(err, data) {
                    if(callback) {
                        callback(newFeedData);
                    }
                });
            },writeHead:function(){}});
        }
        
        var updateDocInFeed = function(doc) {
            var updateDoc = {
                "$set": {
                    "image": doc,
                    "groups": doc.groups,
                    "owner": doc.owner,
                    "at": doc.at,
                }
            }
            feedEndPoint({session: req.session, method: 'PUT', url: '/'+doc.feed.id, fields: updateDoc}, {end:function(){}, data:function(newFeedData){
                if(_.isArray(newFeedData)) {
                    newFeedData = _.first(newFeedData);
                }
            },writeHead:function(){}});
        }
        
        var removeDocFromFeed = function(doc) {
            if(doc.feed && doc.feed.id) {
                feedEndPoint({session: req.session, method: 'DELETE', url: '/'+doc.feed.id, fields: {delete: true}}, {end:function(){}, data:function(newFeedData){
                },writeHead:function(){}});
            } else if(doc.id) {
                var feedQuery = {"ref": {"col": "images", "id": doc.id}};
                ds.find('feed', feedQuery, function(err, data) {
                    _.each(data, function(e) {
                        console.log(arguments);
                        
                        var docId = e.id;
                        //emitToRoomIn('feed', 'deleted', docId);
                        house.io.rooms.in('feed').emit('deletedFeed', docId);
                    });
                    ds.remove('feed', feedQuery, function(err, data) {
                        
                    });
                });
            }
        }
        var removeDocRefs = function(doc) {
            if(doc.hasOwnProperty('checkin')) {
                console.log('remove checkin from image');
                console.log(checkinsEndPoint);
                checkinsEndPoint({session: req.session, method: 'DELETE', url: '/'+doc.checkin.id, fields: {delete: true}}, {end:function(){}, data:function(data){
                    console.log('removed checkin from image');
                },writeHead:function(){}});
            }
        }
        
        var docId;
        var subPath = false;
        var sizesStr = 'sizes';
        var sizePrefix = '/'+sizesStr;
        
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
            console.log('subPath')
            console.log(subPath)
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
            if(subPath && subPath === sizePrefix) {
                var newSize = req.fields;
                console.log(newSize);
                
                ds.update(col, {_id: docId}, {$push: {sizes: newSize}}, function(err, data){
                    res.data(newSize);
                });
                return;
            }
            
            if(path == '') {
                var newDoc = req.fields;
                newDoc.owner = {
                    id: req.session.data.user,
                    name: req.session.data.name
                }
                newDoc.at = new Date();
                var imageTime = false;
                if(newDoc.hasOwnProperty('exif')) {
                    imageTime = house.utils.media.exif.getImageTime(newDoc.exif);
                    if(imageTime) {
                        newDoc.at = imageTime;
                    }
                }
                
                ds.insert(col, newDoc, function(err, newImageDoc){
                    house.log.debug('inserted');
                    incUserImages(req.session.data.user, 1);
                    if(err) {
                        house.log.err(err);
                        res.end('error');
                    } else {
                        var doImageUpdate = false;
                        var updateImageDoc = {};
                        var respondWithFind = function() {
                            var query = {_id: newImageDoc.id};
                            ds.find(col, query, function(err, docs) {
                                if (err) {
                                    house.log.err(err);
                                } else {
                                    // insert to feed
                                    insertDocToFeed(_.first(docs), function(feedDocs){
                                        house.log.debug("respond with updated image");
                                        var resWithDoc = _.first(docs);
                                        resWithDoc.feed = {id: feedDocs.id, at: feedDocs.at};
                                        console.log(resWithDoc);
                                        res.data(resWithDoc);
                                        emitToRoomIn(col, 'inserted', resWithDoc);
                                    });
                                }
                            });
                        }
                        var updateImageWithDoc = function(doc, callback) {
                            if(!doImageUpdate) {
                                if(callback) {
                                    callback();
                                }
                            }
                            var query = {_id: newImageDoc.id};
                            ds.update(col, query, doc, function(err, updatedDocs) {
                                if (err) {
                                    house.log.err(err);
                                } else {
                                    house.log.debug("update new image success!");
                                    if(callback) {
                                        callback(updatedDocs);
                                    }
                                }
                            });
                        }
                        
                        var processThumbnailsFromExifAndPath = function(exifObject, fullPath, callback) {
                            house.log.debug('proc thumbnails for '+fullPath);
                            
                            var mimeType = exifObject["MIME Type"];
                            var newFileMeta = {
                                owner: newDoc.owner,
                                groups: newDoc.groups,
                                src: "images",
                                proc: 1,
                                refs: [ {
                                    col: "images",
                                    id: newDoc.id
                                } ]
                            };
                            var encodedFilename = encodeURIComponent(newDoc.filename);
                            var tmpSquarePath = "/tmp/im-sq-" + encodedFilename;
                            var tmpThumbPath = "/tmp/im-t-" + encodedFilename;
                            var tmpFullPath = "/tmp/im-f-" + encodedFilename;
                            
                            var thumbSize = 320;
                            var fullSize = 1024;
                            var squareDimension = 640, origW = 640, origH = 640;
                            if (exifObject.hasOwnProperty("Image Width")) {
                                origW = parseInt(exifObject["Image Width"]);
                            }
                            if (exifObject.hasOwnProperty("Image Height")) {
                                origH = parseInt(exifObject["Image Height"]);
                            }
                            if (origH < origW) {
                                squareDimension = origH;
                            } else {
                                squareDimension = origW;
                            }
                            
                            var newFileNameBase = newDoc.filename;
                            if (newFileNameBase.indexOf("/") == 0) {
                                newFileNameBase = newFileNameBase.substr(1);
                            }
                            house.log.debug("newFileNameBase: " + newFileNameBase);
                            
                            
                            
                            var addSizeToPush = function(size, val) {
                                doImageUpdate = true;
                                if(!updateImageDoc.hasOwnProperty("$set")) {
                                    updateImageDoc["$set"] = {};
                                }
                                if(!updateImageDoc["$set"].hasOwnProperty("sizes")) {
                                    updateImageDoc["$set"]['sizes'] = {};
                                }
                                updateImageDoc["$set"]['sizes'][size] = val;
                            }
                            
                            
                            var procSizeFull = function(fullPath, callback) {
                                if(fullSize < origW) {
                                    var convertFullToFull = [ fullPath, "-auto-orient", "-strip", "-resize", fullSize, tmpFullPath ];
                                    house.utils.media.imagemagick.convertToGrid(convertFullToFull, tmpFullPath, ds.db, filesRoot, "images/full/" + newFileNameBase, mimeType, newFileMeta, function(err, data, tmpFullPath) {
                                        if (data._id) {
                                            addSizeToPush('full', {
                                                id: data._id,
                                                filename: data.filename
                                            });
                                        }
                                        callback(null, tmpFullPath);
                                    });
                                } else {
                                    callback(null, fullPath);
                                }
                            }
                            var procSizeSquare = function(fullPath, callback) {
                                var squareDim;
                                var gravityDir = "Center";
                                if(origH > origW) {
                                    gravityDir = "North";
                                }
                                if(fullSize < origW) {
                                    squareDim = fullSize;
                                } else {
                                    squareDim = origW;
                                }
                                var convertFullToSquare = [ fullPath, "-auto-orient", "-gravity", gravityDir, "-strip", "-extent", squareDim + "x" + squareDim, tmpSquarePath ];
                                house.utils.media.imagemagick.convertToGrid(convertFullToSquare, tmpSquarePath, ds.db, filesRoot, "images/square/" + newFileNameBase, mimeType, newFileMeta, function(err, dataSquare, tmpSquarePath) {
                                    if (dataSquare._id) {
                                        addSizeToPush('square', {
                                            id: dataSquare._id,
                                            filename: dataSquare.filename
                                        });
                                    }
                                    callback(null, tmpSquarePath);
                                });
                            }
                            var procSizeThumb = function(tmpSquarePath, callback) {
                                var convertSquareToThumb = [ tmpSquarePath, "-auto-orient", "-strip", "-resize", thumbSize, "-crop", thumbSize + "x" + thumbSize, tmpThumbPath ];
                                house.utils.media.imagemagick.convertToGrid(convertSquareToThumb, tmpThumbPath, ds.db, filesRoot, "images/thumb/" + newFileNameBase, mimeType, newFileMeta, function(err, data, tmpThumbPath) {
                                    if (data._id) {
                                        addSizeToPush('thumb', {
                                            id: data._id,
                                            filename: data.filename
                                        });
                                    }
                                    callback(null, tmpThumbPath);
                                });
                            }
                            
                            procSizeFull(fullPath, function(err, fullSizePath) {
                                if(err) {
                                    house.log.err(err);
                                } else {
                                    procSizeSquare(fullSizePath, function(err, squareSizePath) {
                                        if(err) {
                                            house.log.err(err);
                                        } else {
                                            procSizeThumb(squareSizePath, function(err, thumbSizePath) {
                                                if(err) {
                                                    house.log.err(err);
                                                } else {
                                                    callback(updateImageDoc);
                                                }
                                            });
                                        }
                                    });
                                }
                            });
                        }
                        var fullTmpPath = "/tmp/im-" + encodeURIComponent(newDoc.filename);
                        house.utils.media.gridfs.writeFileToPath(ds.db, filesRoot, newDoc.filename, fullTmpPath, function() {
                            house.utils.media.exif.getFromPath(fullTmpPath, function(exif){
                                imageTime = house.utils.media.exif.getImageTime(exif);
                                if(imageTime) {
                                    if(!updateImageDoc.hasOwnProperty("$set")) {
                                        updateImageDoc["$set"] = {};
                                    }
                                    updateImageDoc["$set"]['at'] = imageTime;
                                    doImageUpdate = true;
                                }
                                processThumbnailsFromExifAndPath(exif, fullTmpPath, function(updateImageDoc) {
                                    console.log(updateImageDoc);
                                    
                                    var loc = house.utils.media.exif.getLatLng(exif);
                                    if(loc) {
                                        var newCheckin = {
                                            loc: loc,
                                            owner: newDoc.owner,
                                            src: "image"
                                        };
                                        if (imageTime) {
                                            newCheckin["at"] = imageTime;
                                        }
                                        newCheckin["image"] = newImageDoc;
                                        if(doImageUpdate && updateImageDoc.hasOwnProperty("$set")) {
                                            for(var i in updateImageDoc["$set"]) {
                                                newCheckin["image"][i] = updateImageDoc["$set"][i];
                                            }
                                        }
                                        checkinsEndPoint({session: req.session, method: 'POST', url: '', fields: newCheckin}, {end:function(){}, data:function(newCheckinData){
                                            if(_.isArray(newCheckinData)) {
                                                newCheckinData = _.first(newCheckinData);
                                            }
                                            
                                            if(!updateImageDoc.hasOwnProperty("$set")) {
                                                updateImageDoc["$set"] = {};
                                            }
                                            //updateImageDoc["$set"]['checkin'] = {id: newCheckinData["id"]};
                                            updateImageDoc["$set"]['checkin'] = newCheckinData;
                                            delete updateImageDoc["$set"]['checkin']['image'];
                                            
                                            doImageUpdate = true;
                                            updateImageWithDoc(updateImageDoc, function(){
                                                respondWithFind();
                                            });
                                        },writeHead:function(){}});
                                    } else {
                                        updateImageWithDoc(updateImageDoc, function(){
                                            respondWithFind();
                                        });
                                    }
                                });
                            });
                        });
                    }
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
            if(docId) {
                query._id = docId;
                var putDoc = req.fields;
                var updateGroups = false;
                var insertToFeed = false;
                var removeFromFeed = false;
                for(var k in putDoc) {
                    if(putDoc.hasOwnProperty(k) && k.substr(0,1) == '$') {
                        for(var colName in putDoc[k]) {
                            if(colName == 'groups') {
                                updateGroups = true;
                            }
                            if(colName == 'owner') {
                                
                            }
                            if(k == "$set" && colName == 'feed') {
                                insertToFeed = true;
                            } else if(k == "$unset" && colName == 'feed') {
                                removeFromFeed = true;
                            }
                        }
                    }
                }
                ds.update(col, query, putDoc, function(err, data){
                    if(err) {
                        house.log.err(err);
                        res.end('error');
                    } else {
                        ds.find(col, query, function(err, data) {
                            var updatedDoc = _.first(data);
                            if(updateGroups) {
                                var updateFilesDoc = false;
                                var updateCheckinDoc = false;
                                if(updatedDoc.hasOwnProperty('groups')) {
                                    var updateFilesDoc = {
                                        "$set": {"metadata.groups": updatedDoc.groups}
                                    }
                                    var updateCheckinDoc = {
                                        "$set": {"groups": updatedDoc.groups}
                                    }
                                    ds.update(colFiles, {
                                        "metadata.refs": {
                                            col: "images",
                                            id: docId
                                        }
                                    }, updateFilesDoc, {
                                        multi: true,
                                        safe: true
                                    }, function(err, docs){
                                        console.log('updated files with new groups via image');
                                        console.log(docs);
                                    });
                                }
                            }
                            if(insertToFeed) {
                                insertDocToFeed(updatedDoc, function(feedDocs){
                                    var resWithDoc = updatedDoc;
                                    resWithDoc.feed = {id: feedDocs.id, at: feedDocs.at};
                                    res.data(resWithDoc);
                                    emitToRoomIn(col, 'updated', resWithDoc);
                                });
                            } else if (updatedDoc.hasOwnProperty('feed')) {
                                updateDocInFeed(updatedDoc);
                                res.data(updatedDoc);
                                emitToRoomIn(col, 'updated', updatedDoc);
                            } else if (removeFromFeed) {
                                removeDocFromFeed(updatedDoc);
                                res.data(updatedDoc);
                                emitToRoomIn(col, 'updated', updatedDoc);
                            } else {
                                res.data(data);
                                emitToRoomIn(col, 'updated', data);
                            }
                        });
                    }
                });
            }
        } else if(req.method == 'DELETE') {
            incUserImages(req.session.data.user, -1);
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
                query._id = docId;
                ds.find(col, query, function(err, data) {
                    var doc = _.first(data);
                    removeDocFromFeed(doc);
                    removeDocRefs(doc);
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
        } else if(req.method == 'OPTIONS') {
            
        }
    }
    return handleReq;
});
