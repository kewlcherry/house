(function(){
    var index = {};
    index.init = function(callback) {
        require(['../desktop/jquery.js'], function(){
            require(['../desktop/underscore.js'], function(){
                require(['../desktop/backbone.js'], function(){
                    require(['../desktop/backbone-house.js'], function(){
                        require(['../desktop/utils.js'], function(utils){
                            window.utils = utils;
                            require(['../account/account.js'], function(account){
                                account.on('init', function(){
                                    var $account = $('<account></account>');
                                    $('header').append($account);
                                    $account.append(account.render().$el);
                                    require(['../desktop/nav.js'], function(nav){
                                        index.nav = nav;
                                        nav.init();
                                        account.bindRouter(nav.router);
                                        nav.router.on('loading', function(){
                                            $('body').addClass('loading');
                                        });
                                        nav.router.on('loadingComplete', function(){
                                            $('body').removeClass('loading');
                                        });
                                        $('header').append(nav.list.render().$el);
                                        require(['wallpaper.js'], function(wallpaper) {
                                            wallpaper.on('initialized', function(){
                                                $('body').append(wallpaper.getBackgroundView().render().$el);
                                                wallpaper.bindNav(nav);
                                                nav.startRouter('/wallpaper/');
                                                if(callback) callback(wallpaper);
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
    
    if(define) {
        define(function () {
            return index;
        });
    }
})();