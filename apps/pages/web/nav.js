(function() {
    var nav = {};
    nav.Router = Backbone.Router.extend({
        initialize: function(options) {},
        routes: {
            "_=_": "gohome",
            "_-_": "gohome",
            "": "root"
        },
        gohome: function() {
            this.navigate("", {
                trigger: true,
                replace: true
            });
        },
        reset: function() {
            this.setTitle("");
            this.trigger("reset");
            //nav.list.hideMenu();
        },
        root: function() {
            this.reset();
            this.trigger("root");
        },
        setTitle: function(title) {
            document.title = title;
            this.trigger("title", title);
        }
    });
    nav.router = new nav.Router;
    nav.startRouter = function(root) {
        var historyOptions = {
            pushState: true,
            root: root
        };
        if (window.navigator.standalone) {
            historyOptions.silent = true;
        }
        if (!Backbone.history.start(historyOptions)) {
            if (window.navigator.standalone) {
                var history = nav.router.localStorageNavigationHistory();
                if (history) {
                    nav.router.navigate(history.pop(), true);
                } else {
                    nav.router.navigate("", true);
                }
            } else {
                nav.router.navigate("", true);
            }
        } else {}
    };
    var NavItem = Backbone.Model.extend({
        initialize: function() {
            if(this.has('navigate')) {
                this.id = this.get('navigate');
            }
        },
        getRow: function(options) {
            if (!this.hasOwnProperty("row")) {
                options.el = $('[data-id="'+this.id+'"]')[0];
                console.log(options.el)
                options.model = this;
                this.row = new NavRow(options);
            }
            return this.row;
        }
    });
    var NavCollection = Backbone.Collection.extend({
        model: NavItem,
        initialize: function() {
            var self = this;
        }
    });
    var NavList = Backbone.View.extend({
        tagName: "navigation",
        className: "navList",
        initialize: function() {
            var self = this;
            
            if(this.$el.find('.nav').length > 0) {
                this.$ul = this.$el.find('.nav');
            } else {
                this.$ul = $('<ul class="nav"></ul>');
            }
            
            this.collection.bind("add", function(doc) {
                var view;
                view = doc.getRow({
                    list: self
                });
                self.appendRow(view);
            });
            this.collection.on("reset", function() {
                self.render();
            });
        },
        render: function() {
            var self = this;
            //this.$ul.html("");
            this.collection.each(function(doc) {
                var view;
                view = doc.getRow({
                    list: self
                });
                self.appendRow(view);
            });
            //this.$el.html("");
            this.$el.append(this.$ul);
            this.setElement(this.$el);
            return this;
        },
        events: {
            //"click .opener": "toggleMenu"
        },
        toggleMenu: function() {
            var v = this.$ul.css("visibility");
            if (v == "visible") {
                this.hideMenu();
            } else {
                this.$ul.css("visibility", "visible");
            }
        },
        hideMenu: function() {
            this.$ul.css("visibility", "hidden");
        },
        appendRow: function(row) {
            this.$ul.append(row.render().$el);
        },
        deselectAll: function() {
            this.$ul.children().removeAttr("selected");
            this.$ul.children().removeClass("active");
        }
    });
    var NavRow = Backbone.View.extend({
        tagName: "li",
        className: "navRow",
        render: function() {
            this.$el.attr('data-id', this.model.id);
            var href = this.model.get('navigate') || 'home';
            var $e = this.$el.find('a');
            if($e.length > 0) {
            } else {
                $e = $('<a href="#'+href+'"></a>'); // hash for scrollspy
                this.$el.html($e);
            }
            if (this.model.has("title")) {
                $e.html(this.model.get("title"));
            }
            if (this.model.has("el")) {
                $e.html(this.model.get("el"));
            }
            if (this.model.has("class")) {
                this.$el.addClass(this.model.get("class"));
            }
            this.setElement(this.$el);
            return this;
        },
        initialize: function() {
            this.model.bind("change", this.render, this);
            this.model.bind("destroy", this.remove, this);
        },
        events: {
            click: "userSelect",
            "touchstart input": "touchstartstopprop"
        },
        touchstartstopprop: function(e) {
            e.stopPropagation();
        },
        userSelect: function() {
            //this.options.list.hideMenu();
            this.select();
            if (this.model.has("navigate")) {
                nav.router.navigate(this.model.get("navigate"), true);
            } else if (this.model.has("href")) {
                nav.router.navigate(this.model.get("href"), true); //window.location = this.model.get("href");
            } else {
                this.options.list.trigger("selected", this);
            }
            return false;
        },
        select: function() {
            this.$el.siblings().removeAttr("selected");
            this.$el.siblings().removeClass("active");
            this.$el.attr("selected", "selected");
            this.$el.addClass("active");
        },
        remove: function() {
            $(this.el).remove();
        }
    });
    var NavBackButton = Backbone.View.extend({
        tagName: "div",
        className: "navBackButton",
        initialize: function() {},
        render: function() {
            this.$el.html("◀");
            return this;
        },
        events: {
            click: "select",
            "touchstart input": "touchstartstopprop"
        },
        touchstartstopprop: function(e) {
            e.stopPropagation();
        },
        select: function() {
            window.history.back();
        }
    });
    nav.init = function(elSel) {
        if (!nav.hasOwnProperty("list")) {
            nav.col = new NavCollection;
            var listOpts = {
                collection: nav.col
            };
            if(elSel) {
                listOpts.el = $(elSel)[0];
            }
            console.log(listOpts)
            nav.list = new NavList(listOpts);
        }
        if (window.navigator.standalone) {
            if (!nav.hasOwnProperty("backButton")) {
                nav.backButton = new NavBackButton;
            }
            $("body").append(nav.backButton.render().$el);
        }
    };
    nav.selectByNavigate = function(navName) {
        var navModel = this.col.where({
            navigate: navName
        });
        var doc = _.first(navModel);
        if (doc) {
            doc.getRow().select();
        }
    };
    nav.unselect = function() {
        this.list.deselectAll();
    };
    if (define) {
        define(function() {
            return nav;
        });
    }
})();