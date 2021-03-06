(function() {
    
    var Model = Backbone.Model.extend({
        collectionName: "pages",
        initialize: function(attr, opts) {
            var colOpts = {
                page: this
            };
            attr.sections = attr.sections || [];
            this.sectionsCollection = new SectionsCollection(attr.sections, colOpts);
            attr.features = attr.features || [];
            this.featuresCollection = new FeaturesCollection(attr.features, colOpts);
            this.on("change", function(model, options){
                console.log(arguments);
            });
            this.views = {};
        },
        findSectionById: function(id) {
            return this.sectionsCollection.get(id);
        },
        getOwner: function(callback) {
            if(this.has('owner')) {
                var owner = this.get('owner');
                var user = window.usersCollection.getOrFetch(owner.id, callback);
            }
        },
        getFullView: function(options) {
            options = options || {};
            options.model = this;
            if (!this.fullView) {
                var view = this.fullView = new FullView(options);
                view.on('goToProfile', function(model){
                    options.list.trigger('goToProfile', model);
                });
                this.views.fullView = view;
            }
            return this.fullView;
        },
        getAvatar: function(options) {
            options = options || {};
            options.model = this;
            if (!this.avatar) {
                var view = this.avatar = new AvatarView(options);
                this.views.avatar = view;
            }
            return this.avatar;
        },
        getRow: function(options) {
            options = options || {};
            options.model = this;
            if (!this.row) {
                var row = this.row = new RowView(options);
                this.views.row = row;
            }
            return this.row;
        },
        getBrandView: function(options) {
            options = options || {};
            options.model = this;
            if (!this.brandview) {
                var brandview = this.brandview = new BrandView(options);
                this.views.brandview = brandview;
            }
            return this.brandview;
        },
        getSectionsView: function(opts) {
            return this.sectionsCollection.getView(opts);
        },
        getFeaturesView: function(opts) {
            return this.featuresCollection.getView(opts);
        },
        renderViews: function() {
            for(var i in this.views) {
                this.views[i].render();
            }
        },
        getNavigatePath: function() {
            if(this.has('path')) {
                return this.get('path');
            } else {
                return this.id;
            }
        }
    });
    
    var Section = Backbone.Model.extend({
        initialize: function() {},
        getView: function(options) {
            if (!this.hasOwnProperty("row")) {
                options.model = this;
                this.row = this.getNewView(options);
            }
            return this.row;
        },
        getNewView: function(options) {
            options.model = this;
            return new SectionView(options);
        }
    });
    var Feature = Backbone.Model.extend({
        initialize: function() {},
        getView: function(options) {
            if (!this.hasOwnProperty("row")) {
                options.model = this;
                this.row = this.getNewView(options);
            }
            return this.row;
        },
        getNewView: function(options) {
            options.model = this;
            return new FeatureView(options);
        }
    });
    
    var Collection = Backbone.Collection.extend({
        model: Model,
        collectionName: 'pages',
        url: '/api/pages',
        initialize: function() {
            var self = this;
            self.pageSize = 10;
            this.resetFilters();
            
            require(['//'+window.location.host+'/desktop/socket.io.min.js'], function() {
                var socketOpts = {};
                if(window.location.protocol.indexOf('https') !== -1) {
                    socketOpts.secure = true;
                } else {
                    socketOpts.secure = false;
                }
                var socket = self.io = io.connect('//'+window.location.host+'/socket.io/io', socketOpts);
                socket.on('connect', function(data) {
                    console.log('connected and now joining '+self.collectionName);
                    socket.emit('join', self.collectionName);
                });
                var insertOrUpdateDoc = function(doc) {
                        console.log(doc);
                    if(_.isArray(doc)) {
                        _.each(doc, insertOrUpdateDoc);
                        return;s
                    }
                    var model = self.get(doc.id);
                    if(!model) {
                        var model = new self.model(doc);
                        self.add(model);
                    } else {
                        console.log(model);
                        model.set(doc, {silent:true});
                        model.renderViews();
                    }
                }
                socket.on('insertedPosts', function(doc) {
                    console.log('inserted post');
                    insertOrUpdateDoc(doc);
                    self.count++;
                    self.trigger('count', self.count);
                });
                socket.on('updatedPosts', function(doc) {
                    insertOrUpdateDoc(doc);
                });
                socket.on('deletedPosts', function(id) {
                    self.remove(id);
                    self.count--;
                    self.trigger('count', self.count);
                });
                
                self.initialized = true;
                self.trigger('initialized');
            });
        },
        headCount: function(callback) {
            var self = this;
            var aj = $.ajax({type: "HEAD",url: self.url,data: {},
                success: function(json) {
                    callback(aj.getResponseHeader('X-Count'));
                },xhrFields: {withCredentials: true}
            });
        },
        refreshCount: function() {
            var self = this;
            self.headCount(function(count){
                self.count = count;
                self.trigger('count', count);
            });
        },
        load: function(options, success) {
            var self = this;
            if(!this.count) {
                this.refreshCount();
            }
            if(!options) {
                options = {};
            }
            if(!options.limit) {
                options.limit = self.pageSize;
            }
            if(!options.sort) {
                options.sort = "at-";
            }
            this.applyFilters(options);
            this.fetch({data: options, add: true, success: function(collection, response){
                    if(success) {
                        success();
                    }
                },
                error: function(collection, response){
                }
            });
        },
        getNextPage: function(callback) {
            if(this.length < this.count) {
                this.load({skip:this.length}, callback);
            }
        },
        applyFilters: function(options) {
            
        },
        updateFilter: function(filter) {
            this.reset();
            this.load();
        },
        comparator: function(doc) {
            var d;
            if(doc.get("at")) {
                d = new Date(doc.get("at")).getTime();
                return d * -1;
            } else {
                return 1;
            }
        },
        resetFilters: function() {
        },
        getOrFetch: function(id, callback) {
            var self = this;
            var doc;
            doc = this.get(id);
            if(doc) {
                callback(doc);
            } else {
                var options = { "_id": id };
                this.fetch({data: options, add: true, success: function(collection, response){
                        if(response) {
                            doc = self.get(id);
                            callback(doc);
                        } else {
                            callback(false);
                        }
                    },
                    error: function(collection, response){
                        callback(false);
                    }
                });
            }
        },
        getOrFetchPath: function(path, callback) {
            var self = this;
            var doc;
            doc = _.first(this.where({path:path}));
            if(doc) {
                callback(doc);
            } else {
                var options = { "path": path };
                this.fetch({data: options, add: true, success: function(collection, response){
                        if(response) {
                            doc = _.first(self.where({path:path}));
                            callback(doc);
                        } else {
                            callback(false);
                        }
                    },
                    error: function(collection, response){
                        callback(false);
                    }
                });
            }
        },
        getView: function(options) {
            var self = this;
            if (!options) options = {};
            if (!this.hasOwnProperty("view")) {
                options.collection = this;
                this.view = new ListView(options);
                this.view.on("selected", function(m) {
                    self.trigger("selected", m);
                });
            }
            return this.view;
        },
    });
    
    var SectionsCollection = Backbone.Collection.extend({
        model: Section,
        url: function() {
            return "/api/pages/" + this.options.page.id + "/sections";
        },
        getView: function(options) {
            var self = this;
            if (!options) options = {};
            if (!this.hasOwnProperty("row")) {
                options.collection = this;
                this.row = new SectionList(options);
                this.row.on("selected", function(m) {
                    self.trigger("selected", m);
                });
            }
            return this.row;
        },
        initialize: function(models, options) {
            var self = this;
            if (!options) {
                options = models;
            }
            this.options = options;
        },
        comparator: function(a) {
            return a.get("rank");
        }
    });
    
    var SectionList = Backbone.View.extend({
        tag: "span",
        className: "sections",
        render: function() {
            var self = this;
            this.$actions = $('<ul class="actions"></ul>');
            this.collection.each(function(m, i, c) {
                self.appendModel(m);
            });
            //this.$el.append(this.$actions);
            this.setElement(this.$el);
            return this;
        },
        events: {},
        appendModel: function(m) {
            console.log(m)
            var el = this.$el.find('#'+m.id)[0];
            var row = m.getView({
                list: this,
                el: el
            });
            var rowEl = row.render().$el;
            
            var rank = row.model.get('rank');
            rowEl.attr('data-sort-rank', rank);
            var d = false;
            var $lis = this.$el.children();
            var last = $lis.last();
            var lastRank = parseInt(last.attr('data-sort-rank'), 10);
            if(rank < lastRank) {
                $lis.each(function(i,e){
                    if(d) return;
                    var r = parseInt($(e).attr('data-sort-rank'), 10);
                    if(rank < r) {
                        $(e).before(rowEl);
                        d = true;
                    }
                });
            }
            if(!d) {
                this.$el.append(rowEl);
            }
        },
        initialize: function() {
            var self = this;
            this.collection.on("add", function(m) {
                self.appendModel(m);
            });
            this.collection.on("reset", function() {
                if (!self.$ul) {
                    self.$ul = $("<ul></ul>");
                } else {
                    self.$ul.html("");
                }
            });
        }
    });
    
    var FeaturesCollection = Backbone.Collection.extend({
        model: Feature,
        url: function() {
            return "/api/pages/" + this.options.page.id + "/features";
        },
        getView: function(options) {
            var self = this;
            if (!options) options = {};
            if (!this.hasOwnProperty("row")) {
                options.collection = this;
                this.row = new FeatureList(options);
                this.row.on("selected", function(m) {
                    self.trigger("selected", m);
                });
            }
            return this.row;
        },
        initialize: function(models, options) {
            var self = this;
            if (!options) {
                options = models;
            }
            this.options = options;
        },
        comparator: function(a) {
            return a.get("rank");
        }
    });
    
    var FeatureList = Backbone.View.extend({
        tag: "div",
        className: "carousel-inner",
        initialize: function() {
            var self = this;
            this.collection.on("add", function(m) {
                self.appendModel(m);
            });
            this.collection.on("reset", function() {
            });
            this.interval = 6400;
            this.isPlaying = false;
        },
        render: function() {
            var self = this;
            //this.$ul = $('<div class=""></div>');
            //this.$actions = $('<ul class="actions"></ul>');
            //this.$el.html("");
            //this.$el.hide();
            this.collection.each(function(m, i, c) {
                self.appendModel(m);
            });
            //this.$el.append(this.$actions);
            if(!this.hasOwnProperty('featureCarosel')) {
                self.featureCarosel = $('#home').carousel({
                    interval: false,
                    hover: "pause"
                });
                self.featureCarosel.carousel('next');
                self.play(); 
            }
            this.setElement(this.$el);
            return this;
        },
        next: function() {
            this.featureCarosel.carousel('next');
        },
        prev: function() {
            this.featureCarosel.carousel('prev');
        },
        goto: function(n) {
            console.log('go to slide '+n)
            this.featureCarosel.carousel(n);
        },
        pause: function() {
            console.log('pause')
            this.featureCarosel.carousel('pause');
            this.isPlaying = false;
            clearTimeout(this.featureCaroselTimeout);
            delete this.featureCaroselTimeout;
        },
        play: function() {
            var self = this;
            if(!this.isPlaying) {
                this.isPlaying = true;
                self.playNext();
            }
        },
        playNext: function() {
            var self = this;
            this.featureCaroselTimeout = setTimeout(function(){
                self.featureCarosel.carousel('next');
                self.playNext();
            },this.interval);
        },
        events: {},
        appendModel: function(m) {
            console.log(m)
            var el = this.$el.find('[data-id="'+m.id+'"]')[0];
            var row = m.getView({
                list: this,
                el: el
            });
            var rowEl = row.render().$el;
            
            var rank = row.model.get('rank');
            rowEl.attr('data-sort-rank', rank);
            var d = false;
            var $lis = this.$el.children();
            var last = $lis.last();
            var lastRank = parseInt(last.attr('data-sort-rank'), 10);
            if(rank < lastRank) {
                $lis.each(function(i,e){
                    if(d) return;
                    var r = parseInt($(e).attr('data-sort-rank'), 10);
                    if(rank < r) {
                        $(e).before(rowEl);
                        d = true;
                    }
                });
            }
            if(!d) {
                this.$el.append(rowEl);
            }
        }
    });
    
    var ListView = Backbone.View.extend({
        layout: 'row',
        initialize: function() {
            var self = this;
            self.loading = false;
            this.$pager = $('<div class="list-pager">showing <span class="list-length"></span> of <span class="list-count"></span> posts</div>');
            var $ul = this.$ul = $('<ul class="images"></ul>');
            this.collection.on('add', function(doc) {
                var view;
                if(self.layout === 'row') {
                    view = doc.getRow({list: self});
                } else if(self.layout === 'avatar') {
                    view = doc.getAvatar({list: self});
                }
                self.appendRow(view);
                self.renderPager();
                doc.on('remove', function(){
                    view.$el.remove();
                    return false;
                });
            });
            this.collection.on('remove', function(doc, col, options) {
                self.renderPager();
            });
            this.collection.on('count', function() {
                self.renderPager();
            });
            this.collection.on('reset', function(){
                self.render();
            });
            
            $(window).scroll(function(){
                if(self.$el.is(":visible")) {
                  if(!self.loading && $(window).scrollTop() + 250 >= $(document).height() - $(window).height()){
                    self.loading = true;
                    self.loadMore();
                  }
                }
            });
        },
        filter: function(f) {
            var self = this;
            if(f && typeof f == 'function') {
                this.currentFilter = f;
                this.collection.filter(function(model) {
                  if(f(model)) {
                      self.getDocLayoutView(model).$el.show();
                      return true;
                  }
                  self.getDocLayoutView(model).$el.hide();
                  return false;
                });
            } else {
                // show all
                self.$ul.children().show();
                self.currentFilter = false;
            }
        },
        events: {
          "click .list-pager": "loadMore",
        },
        loadMore: function() {
            var self = this;
            this.collection.getNextPage(function(){
                self.loading = false;
            });
        },
        getDocLayoutView: function(doc) {
            var view;
            if(this.layout === 'row') {
                view = doc.getRow({list: self});
            } else if(this.layout === 'avatar') {
                view = doc.getAvatar({list: self});
            }
            return view;
        },
        render: function() {
            var self = this;
            this.$el.html('');
            this.$el.append(this.$ul);
            this.$ul.html('');
            //this.collection.sort({silent:true});
            this.collection.each(function(doc){
                var view = self.getDocLayoutView(doc);
                self.appendRow(view);
            });
            this.$el.append(this.$pager);
            this.renderPager();
            this.trigger('resize');
            this.setElement(this.$el);
            return this;
        },
        renderPager: function() {
            var len = this.collection.length;
            var c = this.collection.count > len ? this.collection.count : len;
            this.$pager.find('.list-length').html(len);
            this.$pager.find('.list-count').html(c);
        },
        appendRow: function(row) {
            var rank = new Date(row.model.get('at'));
            rank = rank.getTime();
            var rowEl = row.render().$el;
            if(this.currentFilter && !this.currentFilter(row.model)) {
                rowEl.hide();
            }
            rowEl.attr('data-sort-rank', rank);
            var d = false;
            var $lis = this.$ul.children();
            var last = $lis.last();
            var lastRank = parseInt(last.attr('data-sort-rank'), 10);
            if(rank > lastRank) {
                $lis.each(function(i,e){
                    if(d) return;
                    var r = parseInt($(e).attr('data-sort-rank'), 10);
                    if(rank > r) {
                        $(e).before(rowEl);
                        d = true;
                    }
                });
            }
            if(!d) {
                this.$ul.append(rowEl);
            }
        }
    });
    
    var SectionView = Backbone.View.extend({
        tagName: "div",
        className: "featurette",
        render: function() {
            var desc = '';
            if(this.model.has('title')) {
                desc = '<span class="muted">'+this.model.get('title')+'</span>';
            }
            if(this.$el.find('h2').length == 0) {
                this.$el.prepend('<h2 class="featurette-heading">'+this.model.get('name')+desc+'</h2>');
            } else {
                this.$el.find('h2').html(this.model.get('name')+desc);
            }
            
            if(this.model.has('html')) {
                if(this.$el.find('.sectionHtml').length == 0) {
                    this.$el.append('<span class="sectionHtml">'+this.model.get('html')+'</span>');
                } else {
                    this.$el.find('.sectionHtml').html(this.model.get('html'));
                }
            }
            
            if(window.account && (account.isAdmin()) && this.$el.find('.action').length == 0) {
                this.$actions = $('<ul class="actions"></ul>');
                this.$actions.append('<li><button class="edit">Edit</button></li><li><button class="moveUp" title="rank ' + this.model.get("rank") + '">Move Up</button></li><li><button class="remove">Remove</button></li><li><button class="new">New</button></li>');
                this.$el.append(this.$actions);
            }
            
            this.$el.attr("data-name", this.model.get("name"));
            this.$el.attr("id", this.model.get("id"));
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            var self = this;
            if(window.hasOwnProperty('pages')) {
                pages.on("refreshUser", function(user) {
                    self.render();
                });
            }
            this.model.bind("change", this.render, this);
            this.model.bind("destroy", this.remove, this);
        },
        events: {
            //click: "select",
            "click .edit": "edit",
            "click .new": "new",
            "click .moveUp": "moveUp",
            "click .remove": "removeit",
        },
        new: function(e) {
            var m = new Section();
            this.model.collection.add(m);
            m.getView().edit();
            return false;
        },
        edit: function(e) {
            var self = this;
            this.$el.addClass('editing');
            this.form = new SectionForm({model: this.model, collection: this.model.collection});
            this.form.on('saved', function(){
                self.$el.removeClass('editing');
                self.form.$el.remove();
            });
            this.$el.append(this.form.render().$el);
            this.form.wysiEditor();
            this.form.focus();
            return false;
        },
        moveUp: function(e) {
            var self = this;
            self.model.collection.sort({
                silent: true
            });
            var r = self.model.get("rank");
            var sibId = this.$el.prev().attr("data-id");
            if (sibId) {
                var swapModel = self.model.collection.get(sibId);
                if (swapModel) {
                    var higherRank = swapModel.get("rank");
                    if (higherRank == r) {
                        r++;
                    }
                    var sm = swapModel.save({
                        rank: r
                    }, {
                        wait: true
                    }).done(function(s, typeStr, respStr) {
                        self.render();
                        self.model.collection.sort({
                            silent: true
                        });
                        self.options.list.render();
                    });
                    if (higherRank != self.model.get("rank")) {
                        var s = self.model.save({
                            rank: higherRank
                        }, {
                            wait: true
                        }).done(function(s, typeStr, respStr) {
                            self.render();
                            self.model.collection.sort({
                                silent: true
                            });
                            self.options.list.render();
                        });
                    }
                }
            }
            e.stopPropagation();
            e.preventDefault();
            return false;
        },
        removeit: function(e) {
            this.model.destroy();
            e.stopPropagation();
            e.preventDefault();
            return false;
        },
        select: function() {
            if (this.options.list) {
                this.options.list.trigger("selected", this);
            }
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    var FeatureView = Backbone.View.extend({
        tagName: "div",
        className: "item",
        initialize: function() {
            var self = this;
            if(window.hasOwnProperty('pages')) {
                pages.on("refreshUser", function(user) {
                    self.render();
                });
            }
            
            self.uploadFrame = new window.FilesBackbone.UploadFrame({collection: window.filesCollection, type:'image', metadata:{groups: ['public']}});
            self.uploadFrame.on('uploaded', function(data){
                if(_.isArray(data)) {
                    data = _.first(data);
                }
                if(data.image) {
                    var setDoc = {
                        image: data.image
                    }
                    self.model.set(setDoc, {silent: true});
                    var saveModel = self.model.save(null, {
                        silent: false,
                        wait: true
                    });
                    if(saveModel) {
                        saveModel.done(function() {
                            self.trigger("newFeatureImage", self.model);
                        });
                    }
                }
            });
            
            this.model.bind("change", this.render, this);
            this.model.bind("destroy", this.remove, this);
        },
        render: function() {
            var self = this;
            var $e = this.$el.find('.container');
            var src = 'img/slide-01.jpg';
            if(this.model && this.model.has('image') && this.model.get('image').filename) {
                src = this.model.get('image').filename;
            }
            if($e.length > 0) {
                
            } else {
                $e = $('<div class="container"><div class="carousel-caption"><h1></h1><p class="lead"></p><a class="btn btn-large btn-link" href="#">See more</a></div></div>');
                this.$el.append($e);
            }
            if(this.$el.find('img[src="/api/files/'+src+'"]').length == 0) {
                this.$el.find('img').remove();
                this.$el.prepend('<img src="/api/files/'+src+'" />'); ///api/files/' + this.model.get("filename") + '
            }
            var $cap = $e.find('.carousel-caption');
            if(this.model.has('title')) {
                $e.find('h1').html(this.model.get('title'));
            }
            if(this.model.has('desc')) {
                $e.find('.lead').html(nl2br(this.model.get('desc')));
            }
            if(this.model.has('href')) {
                var  a = this.model.get('a') || 'See more';
                $e.find('a').attr('href', this.model.get('href'));
                $e.find('a').html(a);
            }
            
            if(window.account && (account.isAdmin()) && $e.find('.action').length == 0) {
                this.$actions = $('<ul class="actions"></ul>');
                this.$actions.append('<li><button class="edit">Edit</button></li><li class="image"><button class="attach">Attach image</button></li><li><button class="moveUp" title="rank ' + this.model.get("rank") + '">Move Up</button></li><li><button class="remove">Remove</button></li><li><button class="new">New</button></li>');
                this.$el.append(self.uploadFrame.render().$el); //this.$actions.find('.image')
                this.$el.append(this.$actions);
            }
            
            this.$el.attr("data-id", this.model.get("id"));
            this.setElement(this.$el);
            return this;
        },
        events: {
            "click .carousel-caption": "select",
            "click .attach": "attachImage",
            "click .edit": "edit",
            "click .new": "new",
            "click .moveUp": "moveUp",
            "click .remove": "removeit",
        },
        attachImage: function(e) {
            this.uploadFrame.pickFiles();
            return false;
        },
        new: function(e) {
            var m = new Feature();
            this.model.collection.add(m);
            m.getView().edit();
            return false;
        },
        edit: function(e) {
            var self = this;
            this.$el.addClass('editing');
            this.form = new FeatureForm({model: this.model, collection: this.model.collection});
            this.form.on('saved', function(){
                self.$el.removeClass('editing');
                self.form.$el.remove();
            });
            this.$el.append(this.form.render().$el);
            this.form.focus();
            //e.stopPropagation();
            //e.preventDefault();
            this.options.list.pause();
            this.options.list.goto(this.options.list.$el.find('.item').length-1);
            return false;
        },
        moveUp: function(e) {
            var self = this;
            self.model.collection.sort({
                silent: true
            });
            var r = self.model.get("rank");
            var sibId = this.$el.prev().attr("data-id");
            if (sibId) {
                var swapModel = self.model.collection.get(sibId);
                if (swapModel) {
                    var higherRank = swapModel.get("rank");
                    if (higherRank == r) {
                        r++;
                    }
                    var sm = swapModel.save({
                        rank: r
                    }, {
                        wait: true
                    }).done(function(s, typeStr, respStr) {
                        self.render();
                        self.model.collection.sort({
                            silent: true
                        });
                        self.options.list.render();
                    });
                    if (higherRank != self.model.get("rank")) {
                        var s = self.model.save({
                            rank: higherRank
                        }, {
                            wait: true
                        }).done(function(s, typeStr, respStr) {
                            self.render();
                            self.model.collection.sort({
                                silent: true
                            });
                            self.options.list.render();
                        });
                    }
                }
            }
            e.stopPropagation();
            e.preventDefault();
            return false;
        },
        removeit: function(e) {
            this.model.destroy();
            e.stopPropagation();
            e.preventDefault();
            return false;
        },
        select: function() {
            if (!this.$el.hasClass('editing') && this.options.list) {
                this.options.list.trigger("selected", this);
            }
            return false;
        },
        remove: function() {
            this.$el.remove();
        }
    });
    
    var ActionsView = Backbone.View.extend({
        tagName: "span",
        className: "actions",
        render: function() {
            var self = this;
            this.$el.html('');
            //self.$el.append(this.tagsView.render().$el);
            //self.$el.append(this.groupsView.render().$el);
            self.$el.append(this.editView.render().$el);
            //self.$el.append(this.deleteView.render().$el);
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            this.actions = [];
            //this.groupsView = new GroupsView({id: this.id, model: this.model});
            //this.tagsView = new TagsView({id: this.id, model: this.model});
            //this.deleteView = new ActionDeleteView({id: this.id, model: this.model});
            this.editView = new ActionEditView({id: this.id, model: this.model});
        }
    });

    var ActionDeleteView = Backbone.View.extend({
        tagName: "span",
        className: "delete",
        render: function() {
            this.$el.html('<button>delete</button>');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click button": "select",
        },
        select: function() {
            var self = this;
            if(confirm("Are you sure that you want to delete this post?")) {
                this.model.destroy({success: function(model, response) {
                  window.history.back(-1);
                }, 
                errorr: function(model, response) {
                    console.log(arguments);
                },
                wait: true});
            }
            return false;
        }
    });
    
    var ActionEditView = Backbone.View.extend({
        tagName: "span",
        className: "edit",
        render: function() {
            this.$el.html('<button>edit</button>');
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
        },
        events: {
          "click button": "select",
        },
        select: function() {
            var self = this;
            
             this.model.collection.trigger('editModel', this.model);
            
            return false;
        }
    });
    
    
    var BrandView = Backbone.View.extend({
        tagName: "a",
        className: "brand",
        initialize: function(options) {
            var self = this;
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
            //this.actions = new ActionsView({id: this.id, model: this.model});
        },
        render: function() {
            if(this.model.has('title')) {
                this.$el.html(this.model.get('title'));
                
                $('.pageTitle').html(this.model.get('title')); // in our footer
            }
            if(this.model.has('desc')) {
                this.$el.attr('title', this.model.get('desc'));
            }
            if(this.model.has('logo')) {
                var logoImage = this.model.get('logo');
                this.$el.css('background-image', 'url("/api/files/'+logoImage.filename+'")');
            }
            
            if(window.account && (account.isAdmin()) && this.$el.find('.edit').length == 0) {
                this.$el.append('<button class="edit">edit</button>');
            }
            
            this.$el.attr('data-id', this.model.id);
            //this.$el.append(this.actions.render().$el);
            this.setElement(this.$el);
            return this;
        },
        events: {
          "click": "select",
          "click .edit": "edit"
        },
        edit: function(e) {
            var self = this;
            this.$el.addClass('editing');
            this.form = new FormView({model: this.model, collection: this.model.collection});
            this.form.on('saved', function(){
                self.$el.removeClass('editing');
                self.form.$el.remove();
            });
            this.$el.after(this.form.render().$el);
            this.form.focus();
            return false;
        },
        select: function(e) {
            this.trigger('select');
            return false;
        },
        remove: function() {
          this.$el.remove();
        }
    });


    var RowView = Backbone.View.extend({
        tagName: "li",
        className: "row",
        initialize: function(options) {
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
            //this.actions = new ActionsView({id: this.id, model: this.model});
        },
        render: function() {
            this.$el.html('');
            var $byline = $('<span class="byline"></span>');
            if(this.model.has('title')) {
                this.$el.append('<strong class="title">'+this.model.get('title')+'</strong>');
            }
            if(this.model.has('at')) {
                var $at = $('<span class="at"></span>');
                if(window.hasOwnProperty('clock')) {
                    $at.attr('title', clock.moment(this.model.get('at')).format('LLLL'));
                    $at.html(clock.moment(this.model.get('at')).calendar());
                } else {
                    $at.html(this.model.get('at'));
                }
                $byline.append($at);
            }
            if(this.model.has('owner')) {
                $byline.append(' by '+this.model.get('owner').name);
            }
            if(this.model.has('msg')) {
                var $msg = $('<span class="msg"></span>');
                $msg.html(this.model.get('msg'));
                this.$el.append($msg);
            }
            this.$el.append($byline);
            this.$el.attr('data-id', this.model.get("_id"));
            //this.$el.append(this.actions.render().$el);
            this.setElement(this.$el);
            return this;
        },
        events: {
          "click": "select"
        },
        select: function(e) {
            var deselectSiblings = function(el) {
                el.siblings().removeClass('selected');
                el.siblings().removeAttr('selected');
            }
            deselectSiblings(this.$el);
            this.$el.addClass("selected");
            this.$el.attr("selected", true);
            if(this.hasOwnProperty('list')) {
                this.list.trigger('select', this);
            }
            this.trigger('select');
            this.trigger('resize');
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    
    var FullView = Backbone.View.extend({
        tagName: "div",
        className: "fullView",
        initialize: function(options) {
            var self = this;
            if(options.list) {
                this.list = options.list;
            }
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
            this.actions = new ActionsView({id: this.id, model: this.model});
        },
        render: function() {
            var self = this;
            this.$el.html('');
            var $byline = $('<span></span>');
            if(this.model.has('title')) {
                this.$el.append('<h1 class="title">'+this.model.get('title')+'</h1>');
            }
            if(this.model.has('owner')) {
                $byline.append(' <i>by</i> <span class="owner">'+this.model.get('owner').name+'</span>');
                $byline.attr('data-owner-id', this.model.get('owner').id);
                var owner = this.model.getOwner(function(owner){
                    if(owner) {
                        $byline.find('.owner').html('');
                        var ownerAvatarName = owner.getAvatarNameView();
                        ownerAvatarName.on('goToProfile', function(user){
                            self.trigger('goToProfile', user);
                        });
                        $byline.find('.owner').append(ownerAvatarName.render().$el);
                    }
                });
            }
            if(this.model.has('at')) {
                var $at = $('<span class="at"></span>');
                if(window.hasOwnProperty('clock')) {
                    $at.attr('title', clock.moment(this.model.get('at')).format('LLLL'));
                    $at.html(clock.moment(this.model.get('at')).calendar());
                } else {
                    $at.html(this.model.get('at'));
                }
                $byline.append(' ');
                $byline.append($at);
            }
            if(this.model.has('msg')) {
                var $msg = $('<span class="msg"></span>');
                $msg.html(this.model.get('msg'));
                this.$el.append($msg);
            }
            this.$el.append($byline);
            
            if(window.account && (account.isAdmin() || account.isOwner(this.model.get('owner').id))) {
                this.$el.append(this.actions.render().$el);
            }
            this.trigger('resize');
            this.setElement(this.$el); // hmm - needed this to get click handlers //this.delegateEvents(); // why doesn't this run before
            return this;
        },
        renderActions: function() {
            this.actions.render();
        },
        show: function() {
            this.$el.show();
        },
        events: {
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    
    window.nl2br = function(str) {
        return (str + "").replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, "$1" + "<br />");
    };
    
    var AvatarView = Backbone.View.extend({
        tagName: "span",
        className: "avatar",
        render: function() {
            this.$el.html('');
            var $byline = $('<span class="byline"></span>');
            if(this.model.has('title')) {
                this.$el.append('<strong class="title">'+this.model.get('title')+'</strong>');
            }
            if(this.model.has('at')) {
                var $at = $('<span class="at"></span>');
                if(window.hasOwnProperty('clock')) {
                    $at.attr('title', clock.moment(this.model.get('at')).format('LLLL'));
                    $at.html(clock.moment(this.model.get('at')).calendar());
                } else {
                    $at.html(this.model.get('at'));
                }
                $byline.append($at);
            }
            if(this.model.has('owner')) {
                $byline.append(' by '+this.model.get('owner').name);
            }
            if(this.model.has('msg')) {
                var $msg = $('<span class="msg"></span>');
                $msg.html(this.model.get('msg'));
                this.$el.append($msg);
            }
            this.$el.append($byline);
            this.$el.attr('data-id', this.model.get("_id"));
            //this.$el.append(this.actions.render().$el);
            this.setElement(this.$el);
            return this;
        },
        initialize: function(options) {
            if(options.list) {
                this.list = options.list;
            }
            
            this.model.bind('change', this.render, this);
            this.model.bind('destroy', this.remove, this);
        },
        events: {
          "click": "select"
        },
        select: function(e) {
            var deselectSiblings = function(el) {
                el.siblings().removeClass('selected');
                el.siblings().removeAttr('selected');
            }
            
            deselectSiblings(this.$el);
            this.$el.addClass("selected");
            this.$el.attr("selected", true);
            
            if(this.hasOwnProperty('list')) {
                this.list.trigger('select', this);
            }
                
            this.trigger('select');
            this.trigger('resize');
        },
        remove: function() {
          $(this.el).remove();
        }
    });
    var FormView = Backbone.View.extend({
        tagName: "div",
        className: "form",
        initialize: function() {
            var self = this;
            if(this.model && this.model.id) {
                this.$el.attr('data-id', this.model.id);
            } else {
                if(!this.model) {
                    this.model = new Model({}, {
                        collection: this.collection
                    });
                } else {
                }
            }
            
            self.uploadFrame = new window.FilesBackbone.UploadFrame({collection: window.filesCollection, type:'image'});
            self.uploadFrame.on('uploaded', function(data){
                if(_.isArray(data)) {
                    data = _.first(data);
                }
                if(data.image) {
                    var setDoc = {
                        logo: data.image
                    }
                    self.model.set(setDoc, {silent: true});
                    var saveModel = self.model.save(null, {
                        silent: false,
                        wait: true
                    });
                    if(saveModel) {
                        saveModel.done(function() {
                            self.trigger("newFeatureImage", self.model);
                            self.render();
                        });
                    }
                }
            });
            
            this.$inputTitle = $('<input type="text" name="title" placeholder="Title of your page" autocomplete="off" />');
            this.$inputDesc = $('<input type="text" name="desc" placeholder="Description" autocomplete="off" />');
            this.$inputPath = $('<input type="text" name="path" placeholder="/ path" autocomplete="off" />');
            this.$form = $('<form class="page"><fieldset></fieldset><controls></controls></form>');
            this.$form.find('fieldset').append(this.$inputTitle);
            this.$form.find('fieldset').append(this.$inputDesc);
            this.$form.find('fieldset').append(this.$inputPath);
            this.$el.append('<button class="attach">Upload logo</button>');
            this.$el.append('<button class="publish">Publish site</button>');
            this.$form.find('controls').append('<input type="submit" value="Save" />');
        },
        render: function() {
            var self = this;
            if(this.$el.find('form').length === 0) {
                console.log('append form');
                this.$el.append(this.$form);
            }
            if(this.model) {
                if(this.model.has('title')) {
                    this.$inputTitle.val(this.model.get('title'));
                }
                if(this.model.has('path')) {
                    this.$inputPath.val(this.model.get('path'));
                }
                if(this.model.has('desc')) {
                    this.$inputDesc.val(this.model.get('desc'));
                }
                if(this.model.has('logo')) {
                    this.$inputTitle.css('background-image', 'url("/api/files/'+this.model.get('logo').filename+'")');
                }
            }
            this.$el.append(self.uploadFrame.render().$el);
            this.setElement(this.$el);
            return this;
        },
        events: {
            "submit form": "submit",
            "click .attach": "attachImage",
            "click .publish": "publish",
            'click input[type="submit"]': "submit",
            'keyup input[name="title"]': "throttleTitle",
            'blur input[name="title"]': "blurTitle"
        },
        attachImage: function() {
            this.uploadFrame.pickFiles();
            return false;
        },
        publish: function() {
            this.model.set({publish: window.location.href}, {silent: true});
            var saveModel = this.model.save(null, {
                silent: false ,
                wait: true
            });
            if(saveModel) {
                saveModel.done(function() {
                    window.location.reload();
                });
            }
            return false;
        },
        blurTitle: function() {
            console.log('blur title');
            var titleStr = this.$inputTitle.val().trim();
            if(titleStr != '') {
                // autosave
            }
        },
        throttleTitle: _.debounce(function(){
            this.refreshTitle.call(this, arguments);
        }, 300),
        refreshTitle: function(e) {
            var titleStr = this.$inputTitle.val().trim();
            this.trigger('title', titleStr);
        },
        submit: function() {
            var self = this;
            var setDoc = {};
            var title = this.$inputTitle.val();
            var desc = this.$inputDesc.val();
            var path = this.$inputPath.val();
            if(title !== '' && title !== this.model.get('title')) {
                setDoc.title = title;
            }
            if(desc !== '' && desc !== this.model.get('desc')) {
                setDoc.desc = desc;
            }
            if(path !== '' && path !== this.model.get('path')) {
                setDoc.path = path;
            }
            console.log('setDoc')
            console.log(setDoc)
            this.model.set(setDoc, {silent: true});
            var saveModel = this.model.save(null, {
                silent: false ,
                wait: true
            });
            if(saveModel) {
                saveModel.done(function() {
                    self.trigger("saved", self.model);
                    self.collection.add(self.model);
                });
            } else {
                self.trigger("saved", self.model);
            }
            return false;
        },
        focus: function() {
            this.$inputTitle.focus();
        },
        remove: function() {
            this.$el.remove();
        }
    });
    
    var FeatureForm = Backbone.View.extend({
        tagName: "div",
        className: "form",
        initialize: function() {
            var self = this;
            if(this.model && this.model.id) {
                this.$el.attr('data-id', this.model.id);
            } else {
                if(!this.model) {
                    this.model = new Feature({}, {
                        collection: this.collection
                    });
                } else {
                }
            }
            this.$inputTitle = $('<input type="text" name="title" placeholder="Title of your feature" autocomplete="off" />');
            this.$inputDesc = $('<textarea name="desc" placeholder="Your message..."></textarea>');
            this.$inputA = $('<input type="text" name="a" placeholder="Show more" autocomplete="off" />');
            this.$inputHref = $('<input type="text" name="href" placeholder="section name ex. about, contact or http://google.com" autocomplete="off" />');
            
            this.$form = $('<form class="feature"><fieldset></fieldset><controls></controls></form>');
            this.$form.find('fieldset').append(this.$inputTitle);
            this.$form.find('fieldset').append(this.$inputDesc);
            this.$form.find('fieldset').append(this.$inputA);
            this.$form.find('fieldset').append(this.$inputHref);
            this.$form.find('controls').append('<input type="submit" value="Save" />');
        },
        render: function() {
            var self = this;
            if(this.$el.find('form').length === 0) {
                console.log('append form');
                this.$el.append(this.$form);
            }
            if(this.model) {
                if(this.model.has('title')) {
                    this.$inputTitle.val(this.model.get('title'));
                }
                if(this.model.has('desc')) {
                    this.$inputDesc.val(this.model.get('desc'));
                }
                if(this.model.has('href')) {
                    this.$inputHref.val(this.model.get('href'));
                }
                if(this.model.has('a')) {
                    this.$inputA.val(this.model.get('a'));
                }
            }
            this.setElement(this.$el);
            return this;
        },
        events: {
            "submit form": "submit",
            'click [type="submit"]': "submit",
            'keyup input[name="title"]': "throttleTitle",
            'blur input[name="title"]': "blurTitle"
        },
        blurTitle: function() {
            console.log('blur title');
            var titleStr = this.$inputTitle.val().trim();
            if(titleStr != '') {
                // autosave
            }
        },
        throttleTitle: _.debounce(function(){
            this.refreshTitle.call(this, arguments);
        }, 300),
        refreshTitle: function(e) {
            var titleStr = this.$inputTitle.val().trim();
            this.trigger('title', titleStr);
        },
        submit: function() {
            var self = this;
            var setDoc = {};
            var title = this.$inputTitle.val();
            var desc = this.$inputDesc.val();
            var href = this.$inputHref.val();
            var a = this.$inputA.val();
            if(title !== '' && title !== this.model.get('title')) {
                setDoc.title = title;
            }
            if(desc !== '' && desc !== this.model.get('desc')) {
                setDoc.desc = desc;
            }
            if(a !== '' && a !== this.model.get('a')) {
                setDoc.a = a;
            }
            if(href !== '' && href !== this.model.get('href')) {
                setDoc.href = href;
            }
            console.log('setDoc')
            console.log(setDoc)
            this.model.set(setDoc, {silent: true});
            var saveModel = this.model.save(null, {
                silent: false ,
                wait: true
            });
            if(saveModel) {
                saveModel.done(function() {
                    self.trigger("saved", self.model);
                    self.collection.add(self.model);
                });
            } else {
                self.trigger("saved", self.model);
            }
            return false;
        },
        focus: function() {
            this.$inputTitle.focus();
        },
        remove: function() {
            this.$el.remove();
        }
    });
    
    var WysiImagePicker = Backbone.View.extend({
        initialize: function(options) {
            var editor = options.editor || false;
            var self = this;
            this.$html = $('<label>Image:<input data-wysihtml5-dialog-field="src" value="http://"></label><label>Caption:<input name="alt" placeholder="caption"></label><label class="justify"><input type="radio" name="klass" value="original"> Center </label><label class="justify"><input type="radio" name="klass" value="pull-left"> Left </label><label class="justify"><input type="radio" name="klass" value="pull-right"> Right </label><button class="save">OK</button>&nbsp;<a data-wysihtml5-dialog-action="cancel">Cancel</a>');
            self.$inputUrl = this.$html.find('input[data-wysihtml5-dialog-field="src"]');
            self.uploadFrame = new window.FilesBackbone.UploadFrame({collection: window.filesCollection, type:'image', metadata:{groups: ['public']}});
            self.uploadFrame.on('uploaded', function(data){
                if(_.isArray(data)) {
                    data = _.first(data);
                }
                if(data.image) {
                    var url = '/api/files/'+data.image.filename; //window.location.origin+
                    self.$inputUrl.val(url);
                }
            });
        },
        events: {
            'click button.save': "save"
        },
        save: function(){
            var klass = this.$html.find('input[name="klass"]:checked').val();
            var alt = this.$html.find('input[name="alt"]').val();
            var url = this.$inputUrl.val();
            if(url.indexOf(window.location.origin) == 0) {
                url = url.substr(window.location.origin.length);
            }
            if(this.options.editor) {
                //this.options.editor.composer.commands.exec("insertImage", { src: url, alt: alt, class: klass });
                this.options.editor.composer.commands.exec("insertHTML", '<img src="'+url+'" alt="'+alt+'" class="'+klass+'" />');
            }
            this.$el.hide();
            return false;
        },
        render: function() {
            this.$el.html(this.$html)
            this.$el.append(this.uploadFrame.render().$el);
            this.setElement(this.$el);
            return this;
        }
    });
    
    var SectionForm = Backbone.View.extend({
        tagName: "div",
        className: "form",
        initialize: function() {
            var self = this;
            if(this.model && this.model.id) {
                this.$el.attr('data-id', this.model.id);
            } else {
                if(!this.model) {
                    this.model = new Section({}, {
                        collection: this.collection
                    });
                } else {
                }
            }
            this.wsyi_id = 'wysihtml5-'+this.cid;
            this.$htmlToolbar = $('<div class="wysihtml5-toolbar" id="'+this.wsyi_id+'-toolbar"><header><ul class="commands">\
                  <li data-wysihtml5-command="bold" title="Make text bold (CTRL + B)" class="command"></li>\
                  <li data-wysihtml5-command="italic" title="Make text italic (CTRL + I)" class="command"></li>\
                  <li data-wysihtml5-command="insertUnorderedList" title="Insert an unordered list" class="command"></li>\
                  <li data-wysihtml5-command="insertOrderedList" title="Insert an ordered list" class="command"></li>\
                  <li data-wysihtml5-command="createLink" title="Insert a link" class="command"></li>\
                  <li data-wysihtml5-command="insertImage" title="Insert an image" class="command"></li>\
                  <li data-wysihtml5-command="formatBlock" data-wysihtml5-command-value="h2" title="Insert headline 2" class="command"></li>\
                  <li data-wysihtml5-command="formatBlock" data-wysihtml5-command-value="h3" title="Insert headline 3" class="command"></li>\
                  <li data-wysihtml5-command="insertSpeech" title="Insert speech" class="command"></li>\
                  <li data-wysihtml5-action="change_view" title="Show HTML" class="action"></li></ul></header>\
              <div data-wysihtml5-dialog="createLink" style="display: none;"><label>Link:<input data-wysihtml5-dialog-field="href" value="http://"></label><a data-wysihtml5-dialog-action="save">OK</a>&nbsp;<a data-wysihtml5-dialog-action="cancel">Cancel</a></div>\
              <div data-wysihtml5-dialog="insertImage" style="display: none;">\
                </div></div>');
             
            this.$inputName = $('<input type="text" name="name" placeholder="Name of your section" autocomplete="off" />');
            this.$inputTitle = $('<input type="text" name="title" placeholder="Sub title of the section" autocomplete="off" />');
            this.$inputHtml = $('<textarea id="'+this.wsyi_id+'-textarea" name="html" placeholder="Your section html..."></textarea>');
            
            this.$form = $('<form class="section"><fieldset></fieldset><controls></controls></form>');
            this.$form.find('fieldset').append(this.$inputName);
            this.$form.find('fieldset').append(this.$inputTitle);
            this.$el.append(this.$htmlToolbar);
            this.$form.find('fieldset').append(this.$inputHtml);
            this.$form.find('controls').append('<input type="submit" value="Save" />');
        },
        render: function() {
            var self = this;
            if(this.$el.find('form').length === 0) {
                console.log('append form');
                this.$el.append(this.$form);
            }
            if(this.model) {
                if(this.model.has('name')) {
                    this.$inputName.val(this.model.get('name'));
                }
                if(this.model.has('title')) {
                    this.$inputTitle.val(this.model.get('title'));
                }
                if(this.model.has('html')) {
                    this.$inputHtml.val(this.model.get('html'));
                }
            }
            this.setElement(this.$el);
            return this;
        },
        wysiEditor: function() {
            // set h/w of textarea
            $('#'+this.wsyi_id+'-textarea').css('height', $('#'+this.wsyi_id+'-textarea').outerHeight());
            $('#'+this.wsyi_id+'-textarea').css('width', $('#'+this.wsyi_id+'-textarea').outerWidth());
            this.editor = new wysihtml5.Editor(this.wsyi_id+"-textarea", { // id of textarea element
              toolbar:      this.wsyi_id+"-toolbar", // id of toolbar element
              parserRules:  wysihtml5ParserRules // defined in parser rules set 
            });
            this.wysiImagePicker = new WysiImagePicker({el: this.$htmlToolbar.find('[data-wysihtml5-dialog="insertImage"]')[0], editor: this.editor});
            this.wysiImagePicker.render();
            $(this.editor.composer.iframe.contentDocument).find('head').append($('head style').clone());
        },
        events: {
            "submit form": "submit",
            'click [type="submit"]': "submit",
            'click [data-wysihtml5-command="insertImage"]': "attachImage"
        },
        attachImage: function() {
            this.wysiImagePicker.uploadFrame.pickFiles();
        },
        submit: function() {
            var self = this;
            var setDoc = {};
            var name = this.$inputName.val();
            var title = this.$inputTitle.val();
            var html = this.$inputHtml.val();
            if(name !== '' && name !== this.model.get('name')) {
                setDoc.name = name;
            }
            if(title !== this.model.get('title')) {
                setDoc.title = title;
            }
            if(html !== '' && html !== this.model.get('html')) {
                setDoc.html = html;
            }
            console.log('setDoc')
            console.log(setDoc)
            this.model.set(setDoc, {silent: true});
            var saveModel = this.model.save(null, {
                silent: false ,
                wait: true
            });
            if(saveModel) {
                saveModel.done(function() {
                    self.trigger("saved", self.model);
                    self.collection.add(self.model);
                });
            } else {
                self.trigger("saved", self.model);
            }
            return false;
        },
        focus: function() {
            this.$inputName.focus();
        },
        remove: function() {
            this.$el.remove();
        }
    });
    
    if(define) {
        define(function () {
            return {
                Collection: Collection,
                Model: Model,
                List: ListView,
                Row: RowView,
                Avatar: AvatarView,
                Full: FullView,
                Form: FormView
            }
        });
    }
})();