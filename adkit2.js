/** vim: et:ts=4:sw=4:sts=4
 * @license RequireJS 2.1.14 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
//Not using strict: uneven strict support in browsers, #392, and causes
//problems with requirejs.exec()/transpiler plugins that may not be strict.
/*jslint regexp: true, nomen: true, sloppy: true */
/*global window, navigator, document, importScripts, setTimeout, opera */

var requirejs, require, define;
(function (global) {
    var req, s, head, baseElement, dataMain, src,
        interactiveScript, currentlyAddingScript, mainScript, subPath,
        version = '2.1.14',
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/,
        currDirRegExp = /^\.\//,
        op = Object.prototype,
        ostring = op.toString,
        hasOwn = op.hasOwnProperty,
        ap = Array.prototype,
        apsp = ap.splice,
        isBrowser = !!(typeof window !== 'undefined' && typeof navigator !== 'undefined' && window.document),
        isWebWorker = !isBrowser && typeof importScripts !== 'undefined',
        //PS3 indicates loaded and complete, but need to wait for complete
        //specifically. Sequence is 'loading', 'loaded', execution,
        // then 'complete'. The UA check is unfortunate, but not sure how
        //to feature test w/o causing perf issues.
        readyRegExp = isBrowser && navigator.platform === 'PLAYSTATION 3' ?
                      /^complete$/ : /^(complete|loaded)$/,
        defContextName = '_',
        //Oh the tragedy, detecting opera. See the usage of isOpera for reason.
        isOpera = typeof opera !== 'undefined' && opera.toString() === '[object Opera]',
        contexts = {},
        cfg = {},
        globalDefQueue = [],
        useInteractive = false;

    function isFunction(it) {
        return ostring.call(it) === '[object Function]';
    }

    function isArray(it) {
        return ostring.call(it) === '[object Array]';
    }

    /**
     * Helper function for iterating over an array. If the func returns
     * a true value, it will break out of the loop.
     */
    function each(ary, func) {
        if (ary) {
            var i;
            for (i = 0; i < ary.length; i += 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    /**
     * Helper function for iterating over an array backwards. If the func
     * returns a true value, it will break out of the loop.
     */
    function eachReverse(ary, func) {
        if (ary) {
            var i;
            for (i = ary.length - 1; i > -1; i -= 1) {
                if (ary[i] && func(ary[i], i, ary)) {
                    break;
                }
            }
        }
    }

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Simple function to mix in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value === 'object' && value &&
                        !isArray(value) && !isFunction(value) &&
                        !(value instanceof RegExp)) {

                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //Similar to Function.prototype.bind, but the 'this' object is specified
    //first, since it is easier to read/figure out what 'this' will be.
    function bind(obj, fn) {
        return function () {
            return fn.apply(obj, arguments);
        };
    }

    function scripts() {
        return document.getElementsByTagName('script');
    }

    function defaultOnError(err) {
        throw err;
    }

    //Allow getting a global that is expressed in
    //dot notation, like 'a.b.c'.
    function getGlobal(value) {
        if (!value) {
            return value;
        }
        var g = global;
        each(value.split('.'), function (part) {
            g = g[part];
        });
        return g;
    }

    /**
     * Constructs an error with a pointer to an URL with more information.
     * @param {String} id the error ID that maps to an ID on a web page.
     * @param {String} message human readable error.
     * @param {Error} [err] the original error, if there is one.
     *
     * @returns {Error}
     */
    function makeError(id, msg, err, requireModules) {
        var e = new Error(msg + '\nhttp://requirejs.org/docs/errors.html#' + id);
        e.requireType = id;
        e.requireModules = requireModules;
        if (err) {
            e.originalError = err;
        }
        return e;
    }

    if (typeof define !== 'undefined') {
        //If a define is already in play via another AMD loader,
        //do not overwrite.
        return;
    }

    if (typeof requirejs !== 'undefined') {
        if (isFunction(requirejs)) {
            //Do not overwrite an existing requirejs instance.
            return;
        }
        cfg = requirejs;
        requirejs = undefined;
    }

    //Allow for a require config object
    if (typeof require !== 'undefined' && !isFunction(require)) {
        //assume it is a config object.
        cfg = require;
        require = undefined;
    }

    function newContext(contextName) {
        var inCheckLoaded, Module, context, handlers,
            checkLoadedTimeoutId,
            config = {
                //Defaults. Do not set a default for map
                //config to speed up normalize(), which
                //will run faster if there is no default.
                waitSeconds: 7,
                baseUrl: './',
                paths: {},
                bundles: {},
                pkgs: {},
                shim: {},
                config: {}
            },
            registry = {},
            //registry of just enabled modules, to speed
            //cycle breaking code when lots of modules
            //are registered, but not activated.
            enabledRegistry = {},
            undefEvents = {},
            defQueue = [],
            defined = {},
            urlFetched = {},
            bundlesMap = {},
            requireCounter = 1,
            unnormalizedCounter = 1;

        /**
         * Trims the . and .. from an array of path segments.
         * It will keep a leading path segment if a .. will become
         * the first path segment, to help with module name lookups,
         * which act like paths, but can be remapped. But the end result,
         * all paths that use this function should look normalized.
         * NOTE: this method MODIFIES the input array.
         * @param {Array} ary the array of path segments.
         */
        function trimDots(ary) {
            var i, part;
            for (i = 0; i < ary.length; i++) {
                part = ary[i];
                if (part === '.') {
                    ary.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i == 1 && ary[2] === '..') || ary[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        ary.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @param {Boolean} applyMap apply the map config to the value. Should
         * only be done if this normalization is for a dependency ID.
         * @returns {String} normalized name
         */
        function normalize(name, baseName, applyMap) {
            var pkgMain, mapValue, nameParts, i, j, nameSegment, lastIndex,
                foundMap, foundI, foundStarMap, starI, normalizedBaseParts,
                baseParts = (baseName && baseName.split('/')),
                map = config.map,
                starMap = map && map['*'];

            //Adjust any relative paths.
            if (name) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // If wanting node ID compatibility, strip .js from end
                // of IDs. Have to do this here, and not in nameToUrl
                // because node allows either .js or non .js to map
                // to same file.
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                // Starts with a '.' so need the baseName
                if (name[0].charAt(0) === '.' && baseParts) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that 'directory' and not name of the baseName's
                    //module. For instance, baseName of 'one/two/three', maps to
                    //'one/two/three.js', but we want the directory, 'one/two' for
                    //this normalization.
                    normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                    name = normalizedBaseParts.concat(name);
                }

                trimDots(name);
                name = name.join('/');
            }

            //Apply map config if available.
            if (applyMap && map && (baseParts || starMap)) {
                nameParts = name.split('/');

                outerLoop: for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join('/');

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = getOwn(map, baseParts.slice(0, j).join('/'));

                            //baseName segment has config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = getOwn(mapValue, nameSegment);
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break outerLoop;
                                }
                            }
                        }
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && getOwn(starMap, nameSegment)) {
                        foundStarMap = getOwn(starMap, nameSegment);
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            // If the name points to a package's name, use
            // the package main instead.
            pkgMain = getOwn(config.pkgs, name);

            return pkgMain ? pkgMain : name;
        }

        function removeScript(name) {
            if (isBrowser) {
                each(scripts(), function (scriptNode) {
                    if (scriptNode.getAttribute('data-requiremodule') === name &&
                            scriptNode.getAttribute('data-requirecontext') === context.contextName) {
                        scriptNode.parentNode.removeChild(scriptNode);
                        return true;
                    }
                });
            }
        }

        function hasPathFallback(id) {
            var pathConfig = getOwn(config.paths, id);
            if (pathConfig && isArray(pathConfig) && pathConfig.length > 1) {
                //Pop off the first array value, since it failed, and
                //retry
                pathConfig.shift();
                context.require.undef(id);

                //Custom require that does not do map translation, since
                //ID is "absolute", already mapped/resolved.
                context.makeRequire(null, {
                    skipMap: true
                })([id]);

                return true;
            }
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Creates a module mapping that includes plugin prefix, module
         * name, and path. If parentModuleMap is provided it will
         * also normalize the name via require.normalize()
         *
         * @param {String} name the module name
         * @param {String} [parentModuleMap] parent module map
         * for the module name, used to resolve relative names.
         * @param {Boolean} isNormalized: is the ID already normalized.
         * This is true if this call is done for a define() module ID.
         * @param {Boolean} applyMap: apply the map config to the ID.
         * Should only be true if this map is for a dependency.
         *
         * @returns {Object}
         */
        function makeModuleMap(name, parentModuleMap, isNormalized, applyMap) {
            var url, pluginModule, suffix, nameParts,
                prefix = null,
                parentName = parentModuleMap ? parentModuleMap.name : null,
                originalName = name,
                isDefine = true,
                normalizedName = '';

            //If no name, then it means it is a require call, generate an
            //internal name.
            if (!name) {
                isDefine = false;
                name = '_@r' + (requireCounter += 1);
            }

            nameParts = splitPrefix(name);
            prefix = nameParts[0];
            name = nameParts[1];

            if (prefix) {
                prefix = normalize(prefix, parentName, applyMap);
                pluginModule = getOwn(defined, prefix);
            }

            //Account for relative paths if there is a base name.
            if (name) {
                if (prefix) {
                    if (pluginModule && pluginModule.normalize) {
                        //Plugin is loaded, use its normalize method.
                        normalizedName = pluginModule.normalize(name, function (name) {
                            return normalize(name, parentName, applyMap);
                        });
                    } else {
                        // If nested plugin references, then do not try to
                        // normalize, as it will not normalize correctly. This
                        // places a restriction on resourceIds, and the longer
                        // term solution is not to normalize until plugins are
                        // loaded and all normalizations to allow for async
                        // loading of a loader plugin. But for now, fixes the
                        // common uses. Details in #1131
                        normalizedName = name.indexOf('!') === -1 ?
                                         normalize(name, parentName, applyMap) :
                                         name;
                    }
                } else {
                    //A regular module.
                    normalizedName = normalize(name, parentName, applyMap);

                    //Normalized name may be a plugin ID due to map config
                    //application in normalize. The map config values must
                    //already be normalized, so do not need to redo that part.
                    nameParts = splitPrefix(normalizedName);
                    prefix = nameParts[0];
                    normalizedName = nameParts[1];
                    isNormalized = true;

                    url = context.nameToUrl(normalizedName);
                }
            }

            //If the id is a plugin id that cannot be determined if it needs
            //normalization, stamp it with a unique ID so two matching relative
            //ids that may conflict can be separate.
            suffix = prefix && !pluginModule && !isNormalized ?
                     '_unnormalized' + (unnormalizedCounter += 1) :
                     '';

            return {
                prefix: prefix,
                name: normalizedName,
                parentMap: parentModuleMap,
                unnormalized: !!suffix,
                url: url,
                originalName: originalName,
                isDefine: isDefine,
                id: (prefix ?
                        prefix + '!' + normalizedName :
                        normalizedName) + suffix
            };
        }

        function getModule(depMap) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (!mod) {
                mod = registry[id] = new context.Module(depMap);
            }

            return mod;
        }

        function on(depMap, name, fn) {
            var id = depMap.id,
                mod = getOwn(registry, id);

            if (hasProp(defined, id) &&
                    (!mod || mod.defineEmitComplete)) {
                if (name === 'defined') {
                    fn(defined[id]);
                }
            } else {
                mod = getModule(depMap);
                if (mod.error && name === 'error') {
                    fn(mod.error);
                } else {
                    mod.on(name, fn);
                }
            }
        }

        function onError(err, errback) {
            var ids = err.requireModules,
                notified = false;

            if (errback) {
                errback(err);
            } else {
                each(ids, function (id) {
                    var mod = getOwn(registry, id);
                    if (mod) {
                        //Set error on module, so it skips timeout checks.
                        mod.error = err;
                        if (mod.events.error) {
                            notified = true;
                            mod.emit('error', err);
                        }
                    }
                });

                if (!notified) {
                    req.onError(err);
                }
            }
        }

        /**
         * Internal method to transfer globalQueue items to this context's
         * defQueue.
         */
        function takeGlobalQueue() {
            //Push all the globalDefQueue items into the context's defQueue
            if (globalDefQueue.length) {
                //Array splice in the values since the context code has a
                //local var ref to defQueue, so cannot just reassign the one
                //on context.
                apsp.apply(defQueue,
                           [defQueue.length, 0].concat(globalDefQueue));
                globalDefQueue = [];
            }
        }

        handlers = {
            'require': function (mod) {
                if (mod.require) {
                    return mod.require;
                } else {
                    return (mod.require = context.makeRequire(mod.map));
                }
            },
            'exports': function (mod) {
                mod.usingExports = true;
                if (mod.map.isDefine) {
                    if (mod.exports) {
                        return (defined[mod.map.id] = mod.exports);
                    } else {
                        return (mod.exports = defined[mod.map.id] = {});
                    }
                }
            },
            'module': function (mod) {
                if (mod.module) {
                    return mod.module;
                } else {
                    return (mod.module = {
                        id: mod.map.id,
                        uri: mod.map.url,
                        config: function () {
                            return  getOwn(config.config, mod.map.id) || {};
                        },
                        exports: mod.exports || (mod.exports = {})
                    });
                }
            }
        };

        function cleanRegistry(id) {
            //Clean up machinery used for waiting modules.
            delete registry[id];
            delete enabledRegistry[id];
        }

        function breakCycle(mod, traced, processed) {
            var id = mod.map.id;

            if (mod.error) {
                mod.emit('error', mod.error);
            } else {
                traced[id] = true;
                each(mod.depMaps, function (depMap, i) {
                    var depId = depMap.id,
                        dep = getOwn(registry, depId);

                    //Only force things that have not completed
                    //being defined, so still in the registry,
                    //and only if it has not been matched up
                    //in the module already.
                    if (dep && !mod.depMatched[i] && !processed[depId]) {
                        if (getOwn(traced, depId)) {
                            mod.defineDep(i, defined[depId]);
                            mod.check(); //pass false?
                        } else {
                            breakCycle(dep, traced, processed);
                        }
                    }
                });
                processed[id] = true;
            }
        }

        function checkLoaded() {
            var err, usingPathFallback,
                waitInterval = config.waitSeconds * 1000,
                //It is possible to disable the wait interval by using waitSeconds of 0.
                expired = waitInterval && (context.startTime + waitInterval) < new Date().getTime(),
                noLoads = [],
                reqCalls = [],
                stillLoading = false,
                needCycleCheck = true;

            //Do not bother if this call was a result of a cycle break.
            if (inCheckLoaded) {
                return;
            }

            inCheckLoaded = true;

            //Figure out the state of all the modules.
            eachProp(enabledRegistry, function (mod) {
                var map = mod.map,
                    modId = map.id;

                //Skip things that are not enabled or in error state.
                if (!mod.enabled) {
                    return;
                }

                if (!map.isDefine) {
                    reqCalls.push(mod);
                }

                if (!mod.error) {
                    //If the module should be executed, and it has not
                    //been inited and time is up, remember it.
                    if (!mod.inited && expired) {
                        if (hasPathFallback(modId)) {
                            usingPathFallback = true;
                            stillLoading = true;
                        } else {
                            noLoads.push(modId);
                            removeScript(modId);
                        }
                    } else if (!mod.inited && mod.fetched && map.isDefine) {
                        stillLoading = true;
                        if (!map.prefix) {
                            //No reason to keep looking for unfinished
                            //loading. If the only stillLoading is a
                            //plugin resource though, keep going,
                            //because it may be that a plugin resource
                            //is waiting on a non-plugin cycle.
                            return (needCycleCheck = false);
                        }
                    }
                }
            });

            if (expired && noLoads.length) {
                //If wait time expired, throw error of unloaded modules.
                err = makeError('timeout', 'Load timeout for modules: ' + noLoads, null, noLoads);
                err.contextName = context.contextName;
                return onError(err);
            }

            //Not expired, check for a cycle.
            if (needCycleCheck) {
                each(reqCalls, function (mod) {
                    breakCycle(mod, {}, {});
                });
            }

            //If still waiting on loads, and the waiting load is something
            //other than a plugin resource, or there are still outstanding
            //scripts, then just try back later.
            if ((!expired || usingPathFallback) && stillLoading) {
                //Something is still waiting to load. Wait for it, but only
                //if a timeout is not already in effect.
                if ((isBrowser || isWebWorker) && !checkLoadedTimeoutId) {
                    checkLoadedTimeoutId = setTimeout(function () {
                        checkLoadedTimeoutId = 0;
                        checkLoaded();
                    }, 50);
                }
            }

            inCheckLoaded = false;
        }

        Module = function (map) {
            this.events = getOwn(undefEvents, map.id) || {};
            this.map = map;
            this.shim = getOwn(config.shim, map.id);
            this.depExports = [];
            this.depMaps = [];
            this.depMatched = [];
            this.pluginMaps = {};
            this.depCount = 0;

            /* this.exports this.factory
               this.depMaps = [],
               this.enabled, this.fetched
            */
        };

        Module.prototype = {
            init: function (depMaps, factory, errback, options) {
                options = options || {};

                //Do not do more inits if already done. Can happen if there
                //are multiple define calls for the same module. That is not
                //a normal, common case, but it is also not unexpected.
                if (this.inited) {
                    return;
                }

                this.factory = factory;

                if (errback) {
                    //Register for errors on this module.
                    this.on('error', errback);
                } else if (this.events.error) {
                    //If no errback already, but there are error listeners
                    //on this module, set up an errback to pass to the deps.
                    errback = bind(this, function (err) {
                        this.emit('error', err);
                    });
                }

                //Do a copy of the dependency array, so that
                //source inputs are not modified. For example
                //"shim" deps are passed in here directly, and
                //doing a direct modification of the depMaps array
                //would affect that config.
                this.depMaps = depMaps && depMaps.slice(0);

                this.errback = errback;

                //Indicate this module has be initialized
                this.inited = true;

                this.ignore = options.ignore;

                //Could have option to init this module in enabled mode,
                //or could have been previously marked as enabled. However,
                //the dependencies are not known until init is called. So
                //if enabled previously, now trigger dependencies as enabled.
                if (options.enabled || this.enabled) {
                    //Enable this module and dependencies.
                    //Will call this.check()
                    this.enable();
                } else {
                    this.check();
                }
            },

            defineDep: function (i, depExports) {
                //Because of cycles, defined callback for a given
                //export can be called more than once.
                if (!this.depMatched[i]) {
                    this.depMatched[i] = true;
                    this.depCount -= 1;
                    this.depExports[i] = depExports;
                }
            },

            fetch: function () {
                if (this.fetched) {
                    return;
                }
                this.fetched = true;

                context.startTime = (new Date()).getTime();

                var map = this.map;

                //If the manager is for a plugin managed resource,
                //ask the plugin to load it now.
                if (this.shim) {
                    context.makeRequire(this.map, {
                        enableBuildCallback: true
                    })(this.shim.deps || [], bind(this, function () {
                        return map.prefix ? this.callPlugin() : this.load();
                    }));
                } else {
                    //Regular dependency.
                    return map.prefix ? this.callPlugin() : this.load();
                }
            },

            load: function () {
                var url = this.map.url;

                //Regular dependency.
                if (!urlFetched[url]) {
                    urlFetched[url] = true;
                    context.load(this.map.id, url);
                }
            },

            /**
             * Checks if the module is ready to define itself, and if so,
             * define it.
             */
            check: function () {
                if (!this.enabled || this.enabling) {
                    return;
                }

                var err, cjsModule,
                    id = this.map.id,
                    depExports = this.depExports,
                    exports = this.exports,
                    factory = this.factory;

                if (!this.inited) {
                    this.fetch();
                } else if (this.error) {
                    this.emit('error', this.error);
                } else if (!this.defining) {
                    //The factory could trigger another require call
                    //that would result in checking this module to
                    //define itself again. If already in the process
                    //of doing that, skip this work.
                    this.defining = true;

                    if (this.depCount < 1 && !this.defined) {
                        if (isFunction(factory)) {
                            //If there is an error listener, favor passing
                            //to that instead of throwing an error. However,
                            //only do it for define()'d  modules. require
                            //errbacks should not be called for failures in
                            //their callbacks (#699). However if a global
                            //onError is set, use that.
                            if ((this.events.error && this.map.isDefine) ||
                                req.onError !== defaultOnError) {
                                try {
                                    exports = context.execCb(id, factory, depExports, exports);
                                } catch (e) {
                                    err = e;
                                }
                            } else {
                                exports = context.execCb(id, factory, depExports, exports);
                            }

                            // Favor return value over exports. If node/cjs in play,
                            // then will not have a return value anyway. Favor
                            // module.exports assignment over exports object.
                            if (this.map.isDefine && exports === undefined) {
                                cjsModule = this.module;
                                if (cjsModule) {
                                    exports = cjsModule.exports;
                                } else if (this.usingExports) {
                                    //exports already set the defined value.
                                    exports = this.exports;
                                }
                            }

                            if (err) {
                                err.requireMap = this.map;
                                err.requireModules = this.map.isDefine ? [this.map.id] : null;
                                err.requireType = this.map.isDefine ? 'define' : 'require';
                                return onError((this.error = err));
                            }

                        } else {
                            //Just a literal value
                            exports = factory;
                        }

                        this.exports = exports;

                        if (this.map.isDefine && !this.ignore) {
                            defined[id] = exports;

                            if (req.onResourceLoad) {
                                req.onResourceLoad(context, this.map, this.depMaps);
                            }
                        }

                        //Clean up
                        cleanRegistry(id);

                        this.defined = true;
                    }

                    //Finished the define stage. Allow calling check again
                    //to allow define notifications below in the case of a
                    //cycle.
                    this.defining = false;

                    if (this.defined && !this.defineEmitted) {
                        this.defineEmitted = true;
                        this.emit('defined', this.exports);
                        this.defineEmitComplete = true;
                    }

                }
            },

            callPlugin: function () {
                var map = this.map,
                    id = map.id,
                    //Map already normalized the prefix.
                    pluginMap = makeModuleMap(map.prefix);

                //Mark this as a dependency for this plugin, so it
                //can be traced for cycles.
                this.depMaps.push(pluginMap);

                on(pluginMap, 'defined', bind(this, function (plugin) {
                    var load, normalizedMap, normalizedMod,
                        bundleId = getOwn(bundlesMap, this.map.id),
                        name = this.map.name,
                        parentName = this.map.parentMap ? this.map.parentMap.name : null,
                        localRequire = context.makeRequire(map.parentMap, {
                            enableBuildCallback: true
                        });

                    //If current map is not normalized, wait for that
                    //normalized name to load instead of continuing.
                    if (this.map.unnormalized) {
                        //Normalize the ID if the plugin allows it.
                        if (plugin.normalize) {
                            name = plugin.normalize(name, function (name) {
                                return normalize(name, parentName, true);
                            }) || '';
                        }

                        //prefix and name should already be normalized, no need
                        //for applying map config again either.
                        normalizedMap = makeModuleMap(map.prefix + '!' + name,
                                                      this.map.parentMap);
                        on(normalizedMap,
                            'defined', bind(this, function (value) {
                                this.init([], function () { return value; }, null, {
                                    enabled: true,
                                    ignore: true
                                });
                            }));

                        normalizedMod = getOwn(registry, normalizedMap.id);
                        if (normalizedMod) {
                            //Mark this as a dependency for this plugin, so it
                            //can be traced for cycles.
                            this.depMaps.push(normalizedMap);

                            if (this.events.error) {
                                normalizedMod.on('error', bind(this, function (err) {
                                    this.emit('error', err);
                                }));
                            }
                            normalizedMod.enable();
                        }

                        return;
                    }

                    //If a paths config, then just load that file instead to
                    //resolve the plugin, as it is built into that paths layer.
                    if (bundleId) {
                        this.map.url = context.nameToUrl(bundleId);
                        this.load();
                        return;
                    }

                    load = bind(this, function (value) {
                        this.init([], function () { return value; }, null, {
                            enabled: true
                        });
                    });

                    load.error = bind(this, function (err) {
                        this.inited = true;
                        this.error = err;
                        err.requireModules = [id];

                        //Remove temp unnormalized modules for this module,
                        //since they will never be resolved otherwise now.
                        eachProp(registry, function (mod) {
                            if (mod.map.id.indexOf(id + '_unnormalized') === 0) {
                                cleanRegistry(mod.map.id);
                            }
                        });

                        onError(err);
                    });

                    //Allow plugins to load other code without having to know the
                    //context or how to 'complete' the load.
                    load.fromText = bind(this, function (text, textAlt) {
                        /*jslint evil: true */
                        var moduleName = map.name,
                            moduleMap = makeModuleMap(moduleName),
                            hasInteractive = useInteractive;

                        //As of 2.1.0, support just passing the text, to reinforce
                        //fromText only being called once per resource. Still
                        //support old style of passing moduleName but discard
                        //that moduleName in favor of the internal ref.
                        if (textAlt) {
                            text = textAlt;
                        }

                        //Turn off interactive script matching for IE for any define
                        //calls in the text, then turn it back on at the end.
                        if (hasInteractive) {
                            useInteractive = false;
                        }

                        //Prime the system by creating a module instance for
                        //it.
                        getModule(moduleMap);

                        //Transfer any config to this other module.
                        if (hasProp(config.config, id)) {
                            config.config[moduleName] = config.config[id];
                        }

                        try {
                            req.exec(text);
                        } catch (e) {
                            return onError(makeError('fromtexteval',
                                             'fromText eval for ' + id +
                                            ' failed: ' + e,
                                             e,
                                             [id]));
                        }

                        if (hasInteractive) {
                            useInteractive = true;
                        }

                        //Mark this as a dependency for the plugin
                        //resource
                        this.depMaps.push(moduleMap);

                        //Support anonymous modules.
                        context.completeLoad(moduleName);

                        //Bind the value of that module to the value for this
                        //resource ID.
                        localRequire([moduleName], load);
                    });

                    //Use parentName here since the plugin's name is not reliable,
                    //could be some weird string with no path that actually wants to
                    //reference the parentName's path.
                    plugin.load(map.name, localRequire, load, config);
                }));

                context.enable(pluginMap, this);
                this.pluginMaps[pluginMap.id] = pluginMap;
            },

            enable: function () {
                enabledRegistry[this.map.id] = this;
                this.enabled = true;

                //Set flag mentioning that the module is enabling,
                //so that immediate calls to the defined callbacks
                //for dependencies do not trigger inadvertent load
                //with the depCount still being zero.
                this.enabling = true;

                //Enable each dependency
                each(this.depMaps, bind(this, function (depMap, i) {
                    var id, mod, handler;

                    if (typeof depMap === 'string') {
                        //Dependency needs to be converted to a depMap
                        //and wired up to this module.
                        depMap = makeModuleMap(depMap,
                                               (this.map.isDefine ? this.map : this.map.parentMap),
                                               false,
                                               !this.skipMap);
                        this.depMaps[i] = depMap;

                        handler = getOwn(handlers, depMap.id);

                        if (handler) {
                            this.depExports[i] = handler(this);
                            return;
                        }

                        this.depCount += 1;

                        on(depMap, 'defined', bind(this, function (depExports) {
                            this.defineDep(i, depExports);
                            this.check();
                        }));

                        if (this.errback) {
                            on(depMap, 'error', bind(this, this.errback));
                        }
                    }

                    id = depMap.id;
                    mod = registry[id];

                    //Skip special modules like 'require', 'exports', 'module'
                    //Also, don't call enable if it is already enabled,
                    //important in circular dependency cases.
                    if (!hasProp(handlers, id) && mod && !mod.enabled) {
                        context.enable(depMap, this);
                    }
                }));

                //Enable each plugin that is used in
                //a dependency
                eachProp(this.pluginMaps, bind(this, function (pluginMap) {
                    var mod = getOwn(registry, pluginMap.id);
                    if (mod && !mod.enabled) {
                        context.enable(pluginMap, this);
                    }
                }));

                this.enabling = false;

                this.check();
            },

            on: function (name, cb) {
                var cbs = this.events[name];
                if (!cbs) {
                    cbs = this.events[name] = [];
                }
                cbs.push(cb);
            },

            emit: function (name, evt) {
                each(this.events[name], function (cb) {
                    cb(evt);
                });
                if (name === 'error') {
                    //Now that the error handler was triggered, remove
                    //the listeners, since this broken Module instance
                    //can stay around for a while in the registry.
                    delete this.events[name];
                }
            }
        };

        function callGetModule(args) {
            //Skip modules already defined.
            if (!hasProp(defined, args[0])) {
                getModule(makeModuleMap(args[0], null, true)).init(args[1], args[2]);
            }
        }

        function removeListener(node, func, name, ieName) {
            //Favor detachEvent because of IE9
            //issue, see attachEvent/addEventListener comment elsewhere
            //in this file.
            if (node.detachEvent && !isOpera) {
                //Probably IE. If not it will throw an error, which will be
                //useful to know.
                if (ieName) {
                    node.detachEvent(ieName, func);
                }
            } else {
                node.removeEventListener(name, func, false);
            }
        }

        /**
         * Given an event from a script node, get the requirejs info from it,
         * and then removes the event listeners on the node.
         * @param {Event} evt
         * @returns {Object}
         */
        function getScriptData(evt) {
            //Using currentTarget instead of target for Firefox 2.0's sake. Not
            //all old browsers will be supported, but this one was easy enough
            //to support and still makes sense.
            var node = evt.currentTarget || evt.srcElement;

            //Remove the listeners once here.
            removeListener(node, context.onScriptLoad, 'load', 'onreadystatechange');
            removeListener(node, context.onScriptError, 'error');

            return {
                node: node,
                id: node && node.getAttribute('data-requiremodule')
            };
        }

        function intakeDefines() {
            var args;

            //Any defined modules in the global queue, intake them now.
            takeGlobalQueue();

            //Make sure any remaining defQueue items get properly processed.
            while (defQueue.length) {
                args = defQueue.shift();
                if (args[0] === null) {
                    return onError(makeError('mismatch', 'Mismatched anonymous define() module: ' + args[args.length - 1]));
                } else {
                    //args are id, deps, factory. Should be normalized by the
                    //define() function.
                    callGetModule(args);
                }
            }
        }

        context = {
            config: config,
            contextName: contextName,
            registry: registry,
            defined: defined,
            urlFetched: urlFetched,
            defQueue: defQueue,
            Module: Module,
            makeModuleMap: makeModuleMap,
            nextTick: req.nextTick,
            onError: onError,

            /**
             * Set a configuration for the context.
             * @param {Object} cfg config object to integrate.
             */
            configure: function (cfg) {
                //Make sure the baseUrl ends in a slash.
                if (cfg.baseUrl) {
                    if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                        cfg.baseUrl += '/';
                    }
                }

                //Save off the paths since they require special processing,
                //they are additive.
                var shim = config.shim,
                    objs = {
                        paths: true,
                        bundles: true,
                        config: true,
                        map: true
                    };

                eachProp(cfg, function (value, prop) {
                    if (objs[prop]) {
                        if (!config[prop]) {
                            config[prop] = {};
                        }
                        mixin(config[prop], value, true, true);
                    } else {
                        config[prop] = value;
                    }
                });

                //Reverse map the bundles
                if (cfg.bundles) {
                    eachProp(cfg.bundles, function (value, prop) {
                        each(value, function (v) {
                            if (v !== prop) {
                                bundlesMap[v] = prop;
                            }
                        });
                    });
                }

                //Merge shim
                if (cfg.shim) {
                    eachProp(cfg.shim, function (value, id) {
                        //Normalize the structure
                        if (isArray(value)) {
                            value = {
                                deps: value
                            };
                        }
                        if ((value.exports || value.init) && !value.exportsFn) {
                            value.exportsFn = context.makeShimExports(value);
                        }
                        shim[id] = value;
                    });
                    config.shim = shim;
                }

                //Adjust packages if necessary.
                if (cfg.packages) {
                    each(cfg.packages, function (pkgObj) {
                        var location, name;

                        pkgObj = typeof pkgObj === 'string' ? { name: pkgObj } : pkgObj;

                        name = pkgObj.name;
                        location = pkgObj.location;
                        if (location) {
                            config.paths[name] = pkgObj.location;
                        }

                        //Save pointer to main module ID for pkg name.
                        //Remove leading dot in main, so main paths are normalized,
                        //and remove any trailing .js, since different package
                        //envs have different conventions: some use a module name,
                        //some use a file name.
                        config.pkgs[name] = pkgObj.name + '/' + (pkgObj.main || 'main')
                                     .replace(currDirRegExp, '')
                                     .replace(jsSuffixRegExp, '');
                    });
                }

                //If there are any "waiting to execute" modules in the registry,
                //update the maps for them, since their info, like URLs to load,
                //may have changed.
                eachProp(registry, function (mod, id) {
                    //If module already has init called, since it is too
                    //late to modify them, and ignore unnormalized ones
                    //since they are transient.
                    if (!mod.inited && !mod.map.unnormalized) {
                        mod.map = makeModuleMap(id);
                    }
                });

                //If a deps array or a config callback is specified, then call
                //require with those args. This is useful when require is defined as a
                //config object before require.js is loaded.
                if (cfg.deps || cfg.callback) {
                    context.require(cfg.deps || [], cfg.callback);
                }
            },

            makeShimExports: function (value) {
                function fn() {
                    var ret;
                    if (value.init) {
                        ret = value.init.apply(global, arguments);
                    }
                    return ret || (value.exports && getGlobal(value.exports));
                }
                return fn;
            },

            makeRequire: function (relMap, options) {
                options = options || {};

                function localRequire(deps, callback, errback) {
                    var id, map, requireMod;

                    if (options.enableBuildCallback && callback && isFunction(callback)) {
                        callback.__requireJsBuild = true;
                    }

                    if (typeof deps === 'string') {
                        if (isFunction(callback)) {
                            //Invalid call
                            return onError(makeError('requireargs', 'Invalid require call'), errback);
                        }

                        //If require|exports|module are requested, get the
                        //value for them from the special handlers. Caveat:
                        //this only works while module is being defined.
                        if (relMap && hasProp(handlers, deps)) {
                            return handlers[deps](registry[relMap.id]);
                        }

                        //Synchronous access to one module. If require.get is
                        //available (as in the Node adapter), prefer that.
                        if (req.get) {
                            return req.get(context, deps, relMap, localRequire);
                        }

                        //Normalize module name, if it contains . or ..
                        map = makeModuleMap(deps, relMap, false, true);
                        id = map.id;

                        if (!hasProp(defined, id)) {
                            return onError(makeError('notloaded', 'Module name "' +
                                        id +
                                        '" has not been loaded yet for context: ' +
                                        contextName +
                                        (relMap ? '' : '. Use require([])')));
                        }
                        return defined[id];
                    }

                    //Grab defines waiting in the global queue.
                    intakeDefines();

                    //Mark all the dependencies as needing to be loaded.
                    context.nextTick(function () {
                        //Some defines could have been added since the
                        //require call, collect them.
                        intakeDefines();

                        requireMod = getModule(makeModuleMap(null, relMap));

                        //Store if map config should be applied to this require
                        //call for dependencies.
                        requireMod.skipMap = options.skipMap;

                        requireMod.init(deps, callback, errback, {
                            enabled: true
                        });

                        checkLoaded();
                    });

                    return localRequire;
                }

                mixin(localRequire, {
                    isBrowser: isBrowser,

                    /**
                     * Converts a module name + .extension into an URL path.
                     * *Requires* the use of a module name. It does not support using
                     * plain URLs like nameToUrl.
                     */
                    toUrl: function (moduleNamePlusExt) {
                        var ext,
                            index = moduleNamePlusExt.lastIndexOf('.'),
                            segment = moduleNamePlusExt.split('/')[0],
                            isRelative = segment === '.' || segment === '..';

                        //Have a file extension alias, and it is not the
                        //dots from a relative path.
                        if (index !== -1 && (!isRelative || index > 1)) {
                            ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                            moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
                        }

                        return context.nameToUrl(normalize(moduleNamePlusExt,
                                                relMap && relMap.id, true), ext,  true);
                    },

                    defined: function (id) {
                        return hasProp(defined, makeModuleMap(id, relMap, false, true).id);
                    },

                    specified: function (id) {
                        id = makeModuleMap(id, relMap, false, true).id;
                        return hasProp(defined, id) || hasProp(registry, id);
                    }
                });

                //Only allow undef on top level require calls
                if (!relMap) {
                    localRequire.undef = function (id) {
                        //Bind any waiting define() calls to this context,
                        //fix for #408
                        takeGlobalQueue();

                        var map = makeModuleMap(id, relMap, true),
                            mod = getOwn(registry, id);

                        removeScript(id);

                        delete defined[id];
                        delete urlFetched[map.url];
                        delete undefEvents[id];

                        //Clean queued defines too. Go backwards
                        //in array so that the splices do not
                        //mess up the iteration.
                        eachReverse(defQueue, function(args, i) {
                            if(args[0] === id) {
                                defQueue.splice(i, 1);
                            }
                        });

                        if (mod) {
                            //Hold on to listeners in case the
                            //module will be attempted to be reloaded
                            //using a different config.
                            if (mod.events.defined) {
                                undefEvents[id] = mod.events;
                            }

                            cleanRegistry(id);
                        }
                    };
                }

                return localRequire;
            },

            /**
             * Called to enable a module if it is still in the registry
             * awaiting enablement. A second arg, parent, the parent module,
             * is passed in for context, when this method is overridden by
             * the optimizer. Not shown here to keep code compact.
             */
            enable: function (depMap) {
                var mod = getOwn(registry, depMap.id);
                if (mod) {
                    getModule(depMap).enable();
                }
            },

            /**
             * Internal method used by environment adapters to complete a load event.
             * A load event could be a script load or just a load pass from a synchronous
             * load call.
             * @param {String} moduleName the name of the module to potentially complete.
             */
            completeLoad: function (moduleName) {
                var found, args, mod,
                    shim = getOwn(config.shim, moduleName) || {},
                    shExports = shim.exports;

                takeGlobalQueue();

                while (defQueue.length) {
                    args = defQueue.shift();
                    if (args[0] === null) {
                        args[0] = moduleName;
                        //If already found an anonymous module and bound it
                        //to this name, then this is some other anon module
                        //waiting for its completeLoad to fire.
                        if (found) {
                            break;
                        }
                        found = true;
                    } else if (args[0] === moduleName) {
                        //Found matching define call for this script!
                        found = true;
                    }

                    callGetModule(args);
                }

                //Do this after the cycle of callGetModule in case the result
                //of those calls/init calls changes the registry.
                mod = getOwn(registry, moduleName);

                if (!found && !hasProp(defined, moduleName) && mod && !mod.inited) {
                    if (config.enforceDefine && (!shExports || !getGlobal(shExports))) {
                        if (hasPathFallback(moduleName)) {
                            return;
                        } else {
                            return onError(makeError('nodefine',
                                             'No define call for ' + moduleName,
                                             null,
                                             [moduleName]));
                        }
                    } else {
                        //A script that does not call define(), so just simulate
                        //the call for it.
                        callGetModule([moduleName, (shim.deps || []), shim.exportsFn]);
                    }
                }

                checkLoaded();
            },

            /**
             * Converts a module name to a file path. Supports cases where
             * moduleName may actually be just an URL.
             * Note that it **does not** call normalize on the moduleName,
             * it is assumed to have already been normalized. This is an
             * internal API, not a public one. Use toUrl for the public API.
             */
            nameToUrl: function (moduleName, ext, skipExt) {
                var paths, syms, i, parentModule, url,
                    parentPath, bundleId,
                    pkgMain = getOwn(config.pkgs, moduleName);

                if (pkgMain) {
                    moduleName = pkgMain;
                }

                bundleId = getOwn(bundlesMap, moduleName);

                if (bundleId) {
                    return context.nameToUrl(bundleId, ext, skipExt);
                }

                //If a colon is in the URL, it indicates a protocol is used and it is just
                //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
                //or ends with .js, then assume the user meant to use an url and not a module id.
                //The slash is important for protocol-less URLs as well as full paths.
                if (req.jsExtRegExp.test(moduleName)) {
                    //Just a plain path, not module name lookup, so just return it.
                    //Add extension if it is included. This is a bit wonky, only non-.js things pass
                    //an extension, this method probably needs to be reworked.
                    url = moduleName + (ext || '');
                } else {
                    //A module that needs to be converted to a path.
                    paths = config.paths;

                    syms = moduleName.split('/');
                    //For each module name segment, see if there is a path
                    //registered for it. Start with most specific name
                    //and work up from it.
                    for (i = syms.length; i > 0; i -= 1) {
                        parentModule = syms.slice(0, i).join('/');

                        parentPath = getOwn(paths, parentModule);
                        if (parentPath) {
                            //If an array, it means there are a few choices,
                            //Choose the one that is desired
                            if (isArray(parentPath)) {
                                parentPath = parentPath[0];
                            }
                            syms.splice(0, i, parentPath);
                            break;
                        }
                    }

                    //Join the path parts together, then figure out if baseUrl is needed.
                    url = syms.join('/');
                    url += (ext || (/^data\:|\?/.test(url) || skipExt ? '' : '.js'));
                    url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
                }

                return config.urlArgs ? url +
                                        ((url.indexOf('?') === -1 ? '?' : '&') +
                                         config.urlArgs) : url;
            },

            //Delegates to req.load. Broken out as a separate function to
            //allow overriding in the optimizer.
            load: function (id, url) {
                req.load(context, id, url);
            },

            /**
             * Executes a module callback function. Broken out as a separate function
             * solely to allow the build system to sequence the files in the built
             * layer in the right sequence.
             *
             * @private
             */
            execCb: function (name, callback, args, exports) {
                return callback.apply(exports, args);
            },

            /**
             * callback for script loads, used to check status of loading.
             *
             * @param {Event} evt the event from the browser for the script
             * that was loaded.
             */
            onScriptLoad: function (evt) {
                //Using currentTarget instead of target for Firefox 2.0's sake. Not
                //all old browsers will be supported, but this one was easy enough
                //to support and still makes sense.
                if (evt.type === 'load' ||
                        (readyRegExp.test((evt.currentTarget || evt.srcElement).readyState))) {
                    //Reset interactive script so a script node is not held onto for
                    //to long.
                    interactiveScript = null;

                    //Pull out the name of the module and the context.
                    var data = getScriptData(evt);
                    context.completeLoad(data.id);
                }
            },

            /**
             * Callback for script errors.
             */
            onScriptError: function (evt) {
                var data = getScriptData(evt);
                if (!hasPathFallback(data.id)) {
                    return onError(makeError('scripterror', 'Script error for: ' + data.id, evt, [data.id]));
                }
            }
        };

        context.require = context.makeRequire();
        return context;
    }

    /**
     * Main entry point.
     *
     * If the only argument to require is a string, then the module that
     * is represented by that string is fetched for the appropriate context.
     *
     * If the first argument is an array, then it will be treated as an array
     * of dependency string names to fetch. An optional function callback can
     * be specified to execute when all of those dependencies are available.
     *
     * Make a local req variable to help Caja compliance (it assumes things
     * on a require that are not standardized), and to give a short
     * name for minification/local scope use.
     */
    req = requirejs = function (deps, callback, errback, optional) {

        //Find the right context, use default
        var context, config,
            contextName = defContextName;

        // Determine if have config object in the call.
        if (!isArray(deps) && typeof deps !== 'string') {
            // deps is a config object
            config = deps;
            if (isArray(callback)) {
                // Adjust args if there are dependencies
                deps = callback;
                callback = errback;
                errback = optional;
            } else {
                deps = [];
            }
        }

        if (config && config.context) {
            contextName = config.context;
        }

        context = getOwn(contexts, contextName);
        if (!context) {
            context = contexts[contextName] = req.s.newContext(contextName);
        }

        if (config) {
            context.configure(config);
        }

        return context.require(deps, callback, errback);
    };

    /**
     * Support require.config() to make it easier to cooperate with other
     * AMD loaders on globally agreed names.
     */
    req.config = function (config) {
        return req(config);
    };

    /**
     * Execute something after the current tick
     * of the event loop. Override for other envs
     * that have a better solution than setTimeout.
     * @param  {Function} fn function to execute later.
     */
    req.nextTick = typeof setTimeout !== 'undefined' ? function (fn) {
        setTimeout(fn, 4);
    } : function (fn) { fn(); };

    /**
     * Export require as a global, but only if it does not already exist.
     */
    if (!require) {
        require = req;
    }

    req.version = version;

    //Used to filter out dependencies that are already paths.
    req.jsExtRegExp = /^\/|:|\?|\.js$/;
    req.isBrowser = isBrowser;
    s = req.s = {
        contexts: contexts,
        newContext: newContext
    };

    //Create default context.
    req({});

    //Exports some context-sensitive methods on global require.
    each([
        'toUrl',
        'undef',
        'defined',
        'specified'
    ], function (prop) {
        //Reference from contexts instead of early binding to default context,
        //so that during builds, the latest instance of the default context
        //with its config gets used.
        req[prop] = function () {
            var ctx = contexts[defContextName];
            return ctx.require[prop].apply(ctx, arguments);
        };
    });

    if (isBrowser) {
        head = s.head = document.getElementsByTagName('head')[0];
        //If BASE tag is in play, using appendChild is a problem for IE6.
        //When that browser dies, this can be removed. Details in this jQuery bug:
        //http://dev.jquery.com/ticket/2709
        baseElement = document.getElementsByTagName('base')[0];
        if (baseElement) {
            head = s.head = baseElement.parentNode;
        }
    }

    /**
     * Any errors that require explicitly generates will be passed to this
     * function. Intercept/override it if you want custom error handling.
     * @param {Error} err the error object.
     */
    req.onError = defaultOnError;

    /**
     * Creates the node for the load command. Only used in browser envs.
     */
    req.createNode = function (config, moduleName, url) {
        var node = config.xhtml ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'html:script') :
                document.createElement('script');
        node.type = config.scriptType || 'text/javascript';
        node.charset = 'utf-8';
        node.async = true;
        return node;
    };

    /**
     * Does the request to load a module for the browser case.
     * Make this a separate function to allow other environments
     * to override it.
     *
     * @param {Object} context the require context to find state.
     * @param {String} moduleName the name of the module.
     * @param {Object} url the URL to the module.
     */
    req.load = function (context, moduleName, url) {
        var config = (context && context.config) || {},
            node;
        if (isBrowser) {
            //In the browser so use a script tag
            node = req.createNode(config, moduleName, url);

            node.setAttribute('data-requirecontext', context.contextName);
            node.setAttribute('data-requiremodule', moduleName);

            //Set up load listener. Test attachEvent first because IE9 has
            //a subtle issue in its addEventListener and script onload firings
            //that do not match the behavior of all other browsers with
            //addEventListener support, which fire the onload event for a
            //script right after the script execution. See:
            //https://connect.microsoft.com/IE/feedback/details/648057/script-onload-event-is-not-fired-immediately-after-script-execution
            //UNFORTUNATELY Opera implements attachEvent but does not follow the script
            //script execution mode.
            if (node.attachEvent &&
                    //Check if node.attachEvent is artificially added by custom script or
                    //natively supported by browser
                    //read https://github.com/jrburke/requirejs/issues/187
                    //if we can NOT find [native code] then it must NOT natively supported.
                    //in IE8, node.attachEvent does not have toString()
                    //Note the test for "[native code" with no closing brace, see:
                    //https://github.com/jrburke/requirejs/issues/273
                    !(node.attachEvent.toString && node.attachEvent.toString().indexOf('[native code') < 0) &&
                    !isOpera) {
                //Probably IE. IE (at least 6-8) do not fire
                //script onload right after executing the script, so
                //we cannot tie the anonymous define call to a name.
                //However, IE reports the script as being in 'interactive'
                //readyState at the time of the define call.
                useInteractive = true;

                node.attachEvent('onreadystatechange', context.onScriptLoad);
                //It would be great to add an error handler here to catch
                //404s in IE9+. However, onreadystatechange will fire before
                //the error handler, so that does not help. If addEventListener
                //is used, then IE will fire error before load, but we cannot
                //use that pathway given the connect.microsoft.com issue
                //mentioned above about not doing the 'script execute,
                //then fire the script load event listener before execute
                //next script' that other browsers do.
                //Best hope: IE10 fixes the issues,
                //and then destroys all installs of IE 6-9.
                //node.attachEvent('onerror', context.onScriptError);
            } else {
                node.addEventListener('load', context.onScriptLoad, false);
                node.addEventListener('error', context.onScriptError, false);
            }
            node.src = url;

            //For some cache cases in IE 6-8, the script executes before the end
            //of the appendChild execution, so to tie an anonymous define
            //call to the module name (which is stored on the node), hold on
            //to a reference to this node, but clear after the DOM insertion.
            currentlyAddingScript = node;
            if (baseElement) {
                head.insertBefore(node, baseElement);
            } else {
                head.appendChild(node);
            }
            currentlyAddingScript = null;

            return node;
        } else if (isWebWorker) {
            try {
                //In a web worker, use importScripts. This is not a very
                //efficient use of importScripts, importScripts will block until
                //its script is downloaded and evaluated. However, if web workers
                //are in play, the expectation that a build has been done so that
                //only one script needs to be loaded anyway. This may need to be
                //reevaluated if other use cases become common.
                importScripts(url);

                //Account for anonymous modules
                context.completeLoad(moduleName);
            } catch (e) {
                context.onError(makeError('importscripts',
                                'importScripts failed for ' +
                                    moduleName + ' at ' + url,
                                e,
                                [moduleName]));
            }
        }
    };

    function getInteractiveScript() {
        if (interactiveScript && interactiveScript.readyState === 'interactive') {
            return interactiveScript;
        }

        eachReverse(scripts(), function (script) {
            if (script.readyState === 'interactive') {
                return (interactiveScript = script);
            }
        });
        return interactiveScript;
    }

    //Look for a data-main script attribute, which could also adjust the baseUrl.
    if (isBrowser && !cfg.skipDataMain) {
        //Figure out baseUrl. Get it from the script tag with require.js in it.
        eachReverse(scripts(), function (script) {
            //Set the 'head' where we can append children by
            //using the script's parent.
            if (!head) {
                head = script.parentNode;
            }

            //Look for a data-main attribute to set main script for the page
            //to load. If it is there, the path to data main becomes the
            //baseUrl, if it is not already set.
            dataMain = script.getAttribute('data-main');
            if (dataMain) {
                //Preserve dataMain in case it is a path (i.e. contains '?')
                mainScript = dataMain;

                //Set final baseUrl if there is not already an explicit one.
                if (!cfg.baseUrl) {
                    //Pull off the directory of data-main for use as the
                    //baseUrl.
                    src = mainScript.split('/');
                    mainScript = src.pop();
                    subPath = src.length ? src.join('/')  + '/' : './';

                    cfg.baseUrl = subPath;
                }

                //Strip off any trailing .js since mainScript is now
                //like a module name.
                mainScript = mainScript.replace(jsSuffixRegExp, '');

                 //If mainScript is still a path, fall back to dataMain
                if (req.jsExtRegExp.test(mainScript)) {
                    mainScript = dataMain;
                }

                //Put the data-main script in the files to load.
                cfg.deps = cfg.deps ? cfg.deps.concat(mainScript) : [mainScript];

                return true;
            }
        });
    }

    /**
     * The function that handles definitions of modules. Differs from
     * require() in that a string for the module should be the first argument,
     * and the function to execute after dependencies are loaded should
     * return a value to define the module corresponding to the first argument's
     * name.
     */
    define = function (name, deps, callback) {
        var node, context;

        //Allow for anonymous modules
        if (typeof name !== 'string') {
            //Adjust args appropriately
            callback = deps;
            deps = name;
            name = null;
        }

        //This module may not have dependencies
        if (!isArray(deps)) {
            callback = deps;
            deps = null;
        }

        //If no name, and callback is a function, then figure out if it a
        //CommonJS thing with dependencies.
        if (!deps && isFunction(callback)) {
            deps = [];
            //Remove comments from the callback string,
            //look for require calls, and pull them into the dependencies,
            //but only if there are function args.
            if (callback.length) {
                callback
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (callback.length === 1 ? ['require'] : ['require', 'exports', 'module']).concat(deps);
            }
        }

        //If in IE 6-8 and hit an anonymous define() call, do the interactive
        //work.
        if (useInteractive) {
            node = currentlyAddingScript || getInteractiveScript();
            if (node) {
                if (!name) {
                    name = node.getAttribute('data-requiremodule');
                }
                context = contexts[node.getAttribute('data-requirecontext')];
            }
        }

        //Always save off evaluating the def call until the script onload handler.
        //This allows multiple modules to be in a file without prematurely
        //tracing dependencies, and allows for anonymous module support,
        //where the module name is not known until the script onload event
        //occurs. If no context, use the global queue, and get it processed
        //in the onscript load callback.
        (context ? context.defQueue : globalDefQueue).push([name, deps, callback]);
    };

    define.amd = {
        jQuery: true
    };


    /**
     * Executes the text. Normally just uses eval, but can be modified
     * to use a better, environment-specific call. Only used for transpiling
     * loader plugins, not for plain JS modules.
     * @param {String} text the text to execute/evaluate.
     */
    req.exec = function (text) {
        /*jslint evil: true */
        return eval(text);
    };

    //Set up with config info.
    req(cfg);
}(this));

define("requireJs", function(){});

/**
 * @license RequireJS domReady 2.0.1 Copyright (c) 2010-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/domReady for details
 */
/*jslint */
/*global require: false, define: false, requirejs: false,
  window: false, clearInterval: false, document: false,
  self: false, setInterval: false */


define('requireDomReady',[],function () {
    'use strict';

    var isTop, testDiv, scrollIntervalId,
        isBrowser = typeof window !== "undefined" && window.document,
        isPageLoaded = !isBrowser,
        doc = isBrowser ? document : null,
        readyCalls = [];

    function runCallbacks(callbacks) {
        var i;
        for (i = 0; i < callbacks.length; i += 1) {
            callbacks[i](doc);
        }
    }

    function callReady() {
        var callbacks = readyCalls;

        if (isPageLoaded) {
            //Call the DOM ready callbacks
            if (callbacks.length) {
                readyCalls = [];
                runCallbacks(callbacks);
            }
        }
    }

    /**
     * Sets the page as loaded.
     */
    function pageLoaded() {
        if (!isPageLoaded) {
            isPageLoaded = true;
            if (scrollIntervalId) {
                clearInterval(scrollIntervalId);
            }

            callReady();
        }
    }

    if (isBrowser) {
        if (document.addEventListener) {
            //Standards. Hooray! Assumption here that if standards based,
            //it knows about DOMContentLoaded.
            document.addEventListener("DOMContentLoaded", pageLoaded, false);
            window.addEventListener("load", pageLoaded, false);
        } else if (window.attachEvent) {
            window.attachEvent("onload", pageLoaded);

            testDiv = document.createElement('div');
            try {
                isTop = window.frameElement === null;
            } catch (e) {}

            //DOMContentLoaded approximation that uses a doScroll, as found by
            //Diego Perini: http://javascript.nwbox.com/IEContentLoaded/,
            //but modified by other contributors, including jdalton
            if (testDiv.doScroll && isTop && window.external) {
                scrollIntervalId = setInterval(function () {
                    try {
                        testDiv.doScroll();
                        pageLoaded();
                    } catch (e) {}
                }, 30);
            }
        }

        //Check if document already complete, and if so, just trigger page load
        //listeners. Latest webkit browsers also use "interactive", and
        //will fire the onDOMContentLoaded before "interactive" but not after
        //entering "interactive" or "complete". More details:
        //http://dev.w3.org/html5/spec/the-end.html#the-end
        //http://stackoverflow.com/questions/3665561/document-readystate-of-interactive-vs-ondomcontentloaded
        //Hmm, this is more complicated on further use, see "firing too early"
        //bug: https://github.com/requirejs/domReady/issues/1
        //so removing the || document.readyState === "interactive" test.
        //There is still a window.onload binding that should get fired if
        //DOMContentLoaded is missed.
        if (document.readyState === "complete") {
            pageLoaded();
        }
    }

    /** START OF PUBLIC API **/

    /**
     * Registers a callback for DOM ready. If DOM is already ready, the
     * callback is called immediately.
     * @param {Function} callback
     */
    function domReady(callback) {
        if (isPageLoaded) {
            callback(doc);
        } else {
            readyCalls.push(callback);
        }
        return domReady;
    }

    domReady.version = '2.0.1';

    /**
     * Loader Plugin API method
     */
    domReady.load = function (name, req, onLoad, config) {
        if (config.isBuild) {
            onLoad(null);
        } else {
            domReady(onLoad);
        }
    };

    /** END OF PUBLIC API **/

    return domReady;
});

/**
 * Created by Nardi.Jaacobi on 9/7/2014.
 */

define('core/adkitAPI',[],function(){

    /// Is adkit ready
    var _adkitReady = false;
    // refernce to ad mangaer
    var _adManager = null;
    // client
    var _client = null;

    // notify adkit ready
    adkit.notifyReady = function(adManager) {
        // set adkit state to ready
        _adkitReady = true;
        // save reference to ad manager
        _adManager = adManager;
        // client
        _client = _adManager.getClient();
        // notify adkit ready
        var event = document.createEvent('HTMLEvents');
        event.initEvent('adkit-ready', false, false);
        window.dispatchEvent(event);
    };

    // register for ready evnet
    adkit.onReady = function(readyCB){
        // If adkit ready immediately call specified callback
        // else push the specified callback
        if (_adkitReady) {
            readyCB();
        } else {
            window.addEventListener('adkit-ready', readyCB);
        }
    };

    // set current container for created items
    adkit.setCurrentContainer = function(id){
        if (_adManager){
            _adManager.setCurrentContainer(id);
        }
    };

    // add item to ad
    adkit.addItem = function(item, readyCB){
        if (_adManager){
            _adManager.addItem(item, readyCB)
        }
    };

    // load the specified components
    // for compatibility only
    adkit.loadComponents = function(compTypes, readyCB){
        if (_adManager){
            _adManager.loadComponents(compTypes, readyCB);
        }
    };

    adkit.getServingParams = function() {
        return (_client) ? _client.getServingParams() : null;
    };

    // get ad info
    adkit.getAdInfo = function(){
        return (_adManager) ? _adManager.getAdInfo() : null;
    };

    adkit.getComponentsByType = function(type){
        return (_adManager) ?_adManager.getComponentsByType(type) : null;
    };

    // get sv data by key
    adkit.getSVData = function(svKey){
        return (_client) ? _client.getSVData(svKey) : null;
    };

    // notify that version has been clicked
    adkit.clickedVersion = function(versionIndex, url){
        if (_client){
            _client.clickedVersion(versionIndex, url);
        }
    };

    // get versions data
    adkit.getVersions = function(){
        if (_client){
            _client.getVersions.apply(_client, arguments);
        }
    };

    // get number of versions
    adkit.getVersionCount = function(){
        return (_client) ? _client.getVersionCount() : null;
    };

    adkit.getMinVersions = function(){
        return (_client) ? _client.getMinVersions() : null;
    };

    // get version data by key
    adkit.getVersionDataByKey = function(versionIndex, key, readyCB){
        if (_client){
            _client.getVersionDataByKey(versionIndex, key, readyCB);
        }
    };

    adkit.expand = function(){
		if (_client){
            _client.expand.apply(_client, arguments);
        }
	};

	adkit.userSwipe = function(){
		if (_client){
            _client.userSwipe();
        }
	};

    adkit.collapse = function(){
        if (_client){
            _client.collapse.apply(_client, arguments);
        }
    };

    adkit.clickThrough = function(){
        if (_client) {
            _client.clickThrough.apply(_client, arguments);
        }
    };

    adkit.customInteraction = function(name, clickURL){
        if (_client) {
            _client.userActionCounter.apply(_client, arguments);
        }
    };

    adkit.onExpand = function(expandCB){
        if (_adManager){
            _adManager.onExpand(expandCB);
        }
    };

    adkit.onCollapse = function(collapseCB){
        if (_adManager){
            _adManager.onCollapse(collapseCB);
        }
    };

    return adkit;

});

/**
 * Created by Nardi.Jaacobi on 11/24/2014.
 */

define('utils/stringUtils',[],function(){

    // Remove white spaces from right and left (SPACE, LF, CR, TAB etc.)
    var trim = function(str) {
        if (typeof str === 'string') {
            return str.replace(/^\s+|\s+$/g, '');
        } else {
            return str;
        }
    };

    return {
        trim: trim
    };
});
/**
 * Created by Nardi.Jaacobi on 1/4/2015.
 */

define('utils/urlUtils',[],function(){

    // Change url's protocol to the specified one
    var changeProtocol = function(url, protocol) {
        return url.replace(/^\w+:\/\//, protocol + '://');
    };

    // Change url's protocol to be the same as the page protocol
    var changeToPageProtocol = function(url) {
        var pageProtocol = window.location.protocol.slice(0,-1);
        if (pageProtocol === 'http' || pageProtocol === 'https') {
            return changeProtocol(url, pageProtocol);
        } else {
            return url;
        }
    };

    // Return true if url contain http/s protocol
    var hasHttpProtocol = function(url) {
        return (url.search(/^https?:\/\//) == 0);
    };

	var getExtension = function(fileName){
		if(fileName) {
			var extensionIndex = fileName.lastIndexOf(".");
			if(extensionIndex > 0) {
				var ans = fileName.substr(extensionIndex);
				ans = ans.toLowerCase();

				return ans;
			}
		}
	};

	var fixURL = function(url){
		if (url && url.indexOf("http") != 0) {
			return "http://" + url;
		}
		else {
			return url;
		}
	};

	var escapeUrl = function(url){
		if(url){
			return encodeURI(url);
		}
		return url;
	};

    return {
        hasHttpProtocol			: 	hasHttpProtocol,
        changeProtocol			: 	changeProtocol,
        changeToPageProtocol	: 	changeToPageProtocol,
		getExtension			: 	getExtension,
		fixURL					:	fixURL,
		escapeUrl				:	escapeUrl
    };
});

/**
 * Created by einat.rolnik on 7/21/2014.
 */

define('infra/logger',[],function() {

    var debugLevel = 0;       // -1: no output, 0: output to console
    var addTimeStamp = false; // when set to true will add a time stamp for each message

    var log = function (msg) {
        if (addTimeStamp)
            msg += " " + getFormattedDate();
        if (debugLevel == 0) {
            if (!window.console) return; // for IE, in the developer tools are closed and console is undefined - don't log
            //console.log("adkit-log | "+msg);
        }
    };

    var getFormattedDate = function() {
        var date = new Date();
        var str = date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + ":" + date.getMilliseconds();

        return str;
    };

    return {
        debugLevel: debugLevel,
        addTimeStamp: addTimeStamp,
        log:log
    };

});
/**
 * Created by einat.rolnik on 10/12/2014.
 */

define('core/client/assetsHelper',['utils/stringUtils', 'utils/urlUtils', 'infra/logger'],
       function(stringUtils, urlUtils, logger) {

    var getAssetUrl = function(url, ordinal){
        return EB.getAssetUrl(url, ordinal);
    };

	// Convert asset object identifier to url
	var parseAssetObject = function(asset) {
		var assetURL;
		if ('schema' in asset && 'src' in asset) {
			switch (asset.schema) {
				case 'ordinal':
					assetURL = parseOrdinalNumberAsset(asset.src);
					break;
				case 'url':
					assetURL = parseAssetUrl(asset.src);
					break;
				case 'workspace':
					assetURL = parseWorkspaceAsset(stringUtils.trim(asset.src));
			}
		}
		return assetURL;
	};

	// Convert workspace asset identifier to url
	var parseWorkspaceAsset = function(asset) {
		var assetUrl = getAssetUrl(asset,'');
		if (assetUrl === asset) {
			assetUrl = getAssetUrl('assets/' + asset, '');
		}
		return assetUrl;
	};

	// Convert ordinal number asset identifier to url
	var parseOrdinalNumberAsset = function(asset) {
		return getAssetUrl('', asset);
	};

	// Convert asset string identifier to url
	var parseAssetString = function(asset) {
		var assetURL;
		// Test if string represent ordinal number
		var tAsset  = stringUtils.trim(asset);
		if(tAsset === ''){ // empty asset
			assetURL = null;
		}
		else {
			var num = parseInt(tAsset);
			if (num == tAsset) {
				// Ordinal number asset identifier
				assetURL = parseOrdinalNumberAsset(num);
			} else if (urlUtils.hasHttpProtocol(tAsset)) {
				// Url asset identifier
				assetURL = parseAssetUrl(tAsset);
			} else {
				// Workspace asset identifier
				assetURL = parseWorkspaceAsset(tAsset);
			}
		}
		return assetURL;
	};

	var parseAssetUrl = function(asset) {
		return urlUtils.changeToPageProtocol(stringUtils.trim(asset));
	};

	// Convert asset identifier to url
	var parseAsset = function(asset){
		var assetUrl;
		var type = typeof asset;
		switch(type) {
			case 'number':
				assetUrl = parseOrdinalNumberAsset(asset);
				break;
			case 'object':
				assetUrl = parseAssetObject(asset);
				break;
			case 'string':
				assetUrl = parseAssetString(asset);
		}
		return assetUrl;
	};

	// Convert array of asset identifiers to array of urls
	var parseAssets = function(assets) {
		var result = [];
		for (var i in assets) {
			result.push(parseAsset(assets[i]));
		}
		return result;
	};

	return {
		// Convert asset identifier to url
		parseAsset: parseAsset,
		// Convert array of asset identifiers to array of urls
		parseAssets: parseAssets
	};
});

/**
 * Created by Nardi.Jaacobi on 3/23/2015.
 */

define('infra/dataObjectList',[],function(){

    // constructor
    function DataObjectList(){
        this.dataObjectsMap = {};
        this.dataObjectsArray = [];
    }

    // add data object to list
    DataObjectList.prototype.addDataObject = function(dataObject){
        if (dataObject) {
            var index = this.dataObjectsMap[dataObject.getSignature()];
            if (index != null) {
                this.dataObjectsArray[index] = dataObject;
            } else {
                this.dataObjectsArray.push(dataObject);
                this.dataObjectsMap[dataObject.getSignature()] = this.dataObjectsArray.length-1;
            }
        }
    };

    // clone data object but preserve data object references
    DataObjectList.prototype.clone = function(){
        var clonedDataObject = new DataObjectList();
        this.dataObjectsArray.forEach(function(dataObject){
            clonedDataObject.addDataObject(dataObject);
        });
        return clonedDataObject;
    };

    // get data object by signature
    DataObjectList.prototype.getDataObjectBySignature = function(signature){
        return this.dataObjectsArray[this.dataObjects[signature]];
    };

    // get data object by signature
    DataObjectList.prototype.some = function(handler){
        this.dataObjectsArray.some(handler);
    };

    return DataObjectList;

});
/**
 * Created by Nardi.Jaacobi on 7/3/2014.
 */

define('core/client/clientManager',['core/client/assetsHelper','infra/dataObjectList', 'infra/logger'],
        function(assetsHelper, dataObjectList, logger){

    // modules enum
    var MODULES = { SV: 1, SVCAT: 2 };
    // adInfo reference
    var _adInfo = null;
    // ready callback reference
    var _readyCB = null;
    // client ready cb params
    var _servingParams = null;
    // client modules
    var _clientModules = {};
    // num of internal modules
    var _numModulesToLoad = 0;
    // data objects list
    var _dataObjects = new dataObjectList();

    // Setup client modules array
    var setupClientModules = function() {
        // Define EBModulesToLoad if not defined yet
        if (typeof EBModulesToLoad === 'undefined') {
            EBModulesToLoad = [];
        }
        var ebModulesToLoad = EBModulesToLoad;
        // Add client Video module if not added yet
        if (_adInfo.usingVideo &&
            ebModulesToLoad.indexOf('Video') === -1) {
            ebModulesToLoad.push('Video');
        }
        // Add client SV module if not added yet
        if (_adInfo.usingSV &&
            ebModulesToLoad.indexOf('SV') === -1) {
            ebModulesToLoad.push('SV');
            _clientModules[MODULES.SV] = 'core/client/svModule';
        }
        // Add client SV Catalog module if not added yet
        if (_adInfo.usingSVCatalog &&
            ebModulesToLoad.indexOf('SVCAT') === -1) {
            ebModulesToLoad.push('SVCAT');
            _clientModules[MODULES.SVCAT] = 'core/client/catalogModule';
        }
        _numModulesToLoad = Object.keys(_clientModules).length;
    };

    var getServingParams = function() {
        return _servingParams;
    };

    var buildDataObjects = function(){
        var module = _clientModules[MODULES.SV];
        if (module){
            var dataObject = module.getDataObject();
            if (dataObject){
                _dataObjects.addDataObject(dataObject);
            }
        }
    };

    var extendFromEB = function(){
        _extern.clickThrough = EB.clickthrough.bind(EB);
        _extern.userSwipe = EB.userSwipe.bind(EB);
        _extern.isMobileDevice = EB.isMobileDevice.bind(EB);
    };

    var finalizeClientSetup = function(){
        extendFromEB();
        buildDataObjects();
        if (_readyCB){
            _readyCB();
        }
    };

    var onModuleReady = function(){
        if (--_numModulesToLoad <= 0){
            finalizeClientSetup();
        }
    };

    var getModulesPath = function(){
        var modulesPath = ['client/EBLoader'];
        for (var key in _clientModules) {
            modulesPath.push(_clientModules[key]);
            _clientModules[key] = null;
        }
        return modulesPath;
    };

    var getDataObjects = function(){
        return _dataObjects;
    };

    var getCatalogDataProvider = function(){
        var module = _clientModules[MODULES.SVCAT];
        if (module){
            return module.getDataProvider();
        }
    };

    var initModules = function(){
        // initialize internal modules
        for (var key in _clientModules) {
            var module = _clientModules[key];
            if (module) {
                module.init(_adInfo, _extern, onModuleReady);
            }
        }
    };

    var onClientReady = function(params){
        // save serving params (for adBuilder)
        _servingParams = params;

        if (_numModulesToLoad === 0){
            finalizeClientSetup();
        } else {
            initModules();
        }
    };

    // save loaded modules reference
    var saveModulesRef = function(modules){
        // skip EBLoader
        for (var i = 1; i < modules.length; i++){
            var module = modules[i];
            if (module){
                _clientModules[MODULES[module.id]] = module;
            }
        }
    };

    var loadClient = function(){
        var modulesPaths = getModulesPath();
        require(modulesPaths, function(){
            saveModulesRef(arguments);
            // Register for ready state
            if (EB.notifyCreativeWhenReady) {
                EB.notifyCreativeWhenReady(onClientReady);
            } else if (EB.isInitialized()){
                onClientReady();
            } else{
                EB.addEventListener(EBG.EventName.EB_INITIALIZED, onClientReady);
            }
        });
    };

    var init = function(adInfo, readyCB){
        // save reference to adInfo
        _adInfo = adInfo;
        // save reference to ready callback
        _readyCB = readyCB;
        // continue only client code not loaded yet
        if (window['EB'] == null) {
            // setup client modules array
            setupClientModules();
            // load client modules
            loadClient();
        }
    };

    var getAssetUrl = function(assetId){
        return assetsHelper.parseAsset(assetId);
    };

    var getAssetsUrl = function(assetsIdArray){
        return assetsHelper.parseAssets(assetsIdArray);
    };

    var customInteraction = function(name, clickURL){
        EB.userActionCounter.apply(EB, arguments);
    };

    var registerVideo = function(video){
        new EBG.VideoModule(video);
    };

    var expand = function(){
        var params = null;
        if (arguments[0] == null || arguments[0] instanceof Object){
            params = arguments[0];
        } else {
            params = {panelName: arguments[0]};
            if (arguments[1]){
                params.actionType = arguments[1] ? EBG.ActionType.USER : EBG.ActionType.AUTO;
            }
        }
        EB.expand(params);
    };

    var collapse = function(){
        var params = null;
        if (arguments[0] == null || arguments[0] instanceof Object){
            params = arguments[0];
        } else {
            params = {panelName: arguments[0]};
        }
        EB.collapse(params);
    };

    logger.log('client manager loaded');

    var _extern = {
        init: init,
        expand: expand,
        collapse: collapse,
        getServingParams: getServingParams,
        getDataObjects: getDataObjects,
        registerVideo: registerVideo,
        getCatalogDataProvider: getCatalogDataProvider,
        getAssetUrl: getAssetUrl,
        getAssetsUrl: getAssetsUrl,
        customInteraction: customInteraction
    };

    return _extern;

});
/**
 * Created by evyatar.vaknin on 02/17/2015.
 */
define('utils/domUtils',[],function() {
	var helperDiv = document.createElement('div');

	var root = document.documentElement;


	var createElement = function (tag) {
		return document.createElement(tag);
	};

    var getElementInParent = function(parent, search){
        var element = null;
        if (parent && search) {
            var elements = parent.getElementsByTagName('*');
            var numElements = elements.length;
            for (var i = 0; i < numElements; i++){
                if (elements[i].getAttribute(search.attribute) === search.value) {
                    element = elements[i];
                    break;
                }
            }
        }
        return element;
    };

    // get dom element
    //  id -> id of the element to search for
    //  parent -> optional - search within this parent
    //  deep -> not implemented yet
	var getElementById = function (id, parent) {
        var element = null;
        if (parent){
            element = getElementInParent(parent, {attribute:'id', value:id});
        } else {
            element = document.getElementById(id);
        }
		return element;
	};

	var insertElementIntoContainer = function(container, element){
		if (container && element) {
			container.appendChild(element);
		}
	};

	var clearElementContent = function(element){
		if (element){
			element.innerHTML = '';
		}
	};

	var clearElementContentById = function(id){
		var element = getElementById(id);
		clearElementContent(element);
	};

	var setElementHtmlContent = function(element, htmlContent){
		if (element && htmlContent){
			element.innerHTML = htmlContent;
		}
	};

	var setElementTextContent = function(element, textContent){
		if (element && textContent){
			element.textContent = textContent;
		}
	};

	var setElementId = function(element, id){
		if (element && id){
			element.id = id;
		}
	};

	var hideElement = function(element){
		if (element){
			element.style.visibility = 'hidden';
		}
	};

	var showElement = function(element){
		if (element){
			element.style.visibility = 'visible';
		}
	};

	var getElementWidth = function(element){
		if (element){
			return element.clientWidth;
		}
	};

	var getElementHeight = function(element){
		if (element){
			return element.clientHeight;
		}
	};

    var getElementContentWidth = function(element){
        if (element){
            return element.offsetWidth;
        }
    };

    var getElementContentHeight = function(element){
        if (element){
            return element.offsetHeight;
        }
    };

	var getCssProperty = function(element, cssProperty){
		if (element && cssProperty){
			//return element.style[cssProperty];
			var style = window.getComputedStyle(element);
			return style.getPropertyValue(cssProperty);
		}
	};

    var getElementProperty = function(element, prop){
        if (element && prop) {
            return element[prop];
        }
    };

	var applyStyle = function(elem, styleProperties){
		if (elem && styleProperties){
			for (var htmlProperty in styleProperties) {
				elem.style[htmlProperty] = styleProperties[htmlProperty];
			}
		}
	};

	var addClass = function(elem, classArray){
		if (elem && classArray){
			if (typeof classArray === 'string'){
				if (elem.className) {
                    elem.className = elem.className + " " + classArray;
				} else {
                    elem.className = classArray;
				}
			}

			else if(classArray instanceof Array) {
				for (var curClass in classArray) {
					if (elem.className) {//already has a class
						elem.className = elem.className + ' ' + classArray[curClass];
					} else {
						elem.className = classArray[curClass];
					}
				}
			}
		}
	};

    var removeClass = function(elem, className){
        if (elem && className) {
            if (elem.classList) {
                elem.classList.remove(className);
            } else if (elem.className) {
                var classes = elem.className.split(" ");
                classes.splice(classes.indexOf(className), 1);
                elem.className = classes.join(" ");
            }
        }
    };

	var setClass = function(elem, classArray){
		if (elem && classArray){
			elem.className = '';
			addClass(elem, classArray);
		}
	};

	var applyElementProperties = function(element, elementProperties){
		if (element && elementProperties){
			for (var htmlProperty in elementProperties) {
				element[htmlProperty] = elementProperties[htmlProperty];
			}
		}
	};

	var getOffsetSum = function(elem) {
		var top = 0, left = 0;
		/*while(elem) {
			top = top + parseInt(elem.offsetTop);
			left = left + parseInt(elem.offsetLeft);
			elem = elem.offsetParent;
		}*/
		left = elem.offsetLeft;
		top = elem.offsetTop;
		return {top: top, left: left};
	};

	var bindEvent = function(element, event, functionToBind){
		if (element && event && functionToBind){
			if (element.addEventListener) {// For all major browsers, except IE 8 and earlier
				element.addEventListener(event, functionToBind);
			}
		}
	};

	var bindEvents = function(element, events, functionToBind){
		events.forEach(function (event) {
			bindEvent(element, event, functionToBind);
		});
	};

	var isVisible = function(element){
		if (element){
			return (element.style.visibility !== 'hidden'); //if(getElementWidth(element) > 0 || getElementHeight(element) > 0){
		}
	};

	var setCssProperty = function(element, cssProperty, value){
		if (element && cssProperty && value){
			element.style[cssProperty] = value;
		}
	};

	var applyElementAttributes = function(element, elementAttributes){
		if (element && elementAttributes){
			for (var htmlProperty in elementAttributes) {
				element.setAttribute(htmlProperty, elementAttributes[htmlProperty]);
			}
		}
	};

	var insertElementBefore = function(newElement, parent, existingElement){
		parent.insertBefore(newElement, existingElement);
	};

	var getElementByTagName = function(tagName){
		return getElementsByTagName(tagName)[0];
	};

	var getElementsByTagName = function(tagName){
		return document.getElementsByTagName(tagName);
	};

	var insertElementToHead = function(element){
		var head = getElementByTagName("head");
		insertElementIntoContainer(head, element);
	};

	var isStylePropertySupported = function(property){
		return (property in root.style);
	};

	var isStyleValueSupported = function(property, valueToInsert, valueToFind){
		helperDiv.style[property] = valueToInsert;
		if (typeof valueToFind === 'undefined'){
			valueToFind = valueToInsert;
		}
		return helperDiv.style[property].indexOf(valueToFind) > -1;
	};

	var createTextNode = function(value){
		return document.createTextNode(value);
	};

    var cloneElement = function(element, deep){
        var cloned = null;
        if (element) {
            cloned = element.cloneNode(deep);
        }
        return cloned;
    };

	var dispatchEvent = function(element, evtName, userData){
		var event = document.createEvent('HTMLEvents');
		event.initEvent(evtName, false, false);
        event.data = userData;
		element.dispatchEvent(event);
	};

	return {
		createElement 						: 		createElement,
		getElementById 						: 		getElementById,
		insertElementIntoContainer 			: 		insertElementIntoContainer,
		clearElementContent 				: 		clearElementContent,
		clearElementContentById				:		clearElementContentById,
		setElementHtmlContent				:		setElementHtmlContent,
		setElementTextContent				:		setElementTextContent,
		setElementId						:		setElementId,
		hideElement							: 		hideElement,
		showElement							:		showElement,
		getElementWidth						:		getElementWidth,
        getElementHeight					:		getElementHeight,
        getElementContentWidth			    :		getElementContentWidth,
        getElementContentHeight			    :		getElementContentHeight,
		getCssProperty						:		getCssProperty,
		applyStyle							:		applyStyle,
		addClass							:		addClass,
        removeClass                         :       removeClass,
		applyElementProperties				:		applyElementProperties,
		getOffsetSum						:		getOffsetSum,
		bindEvent							:		bindEvent,
		isVisible							:		isVisible,
		setCssProperty						:		setCssProperty,
		setClass							:		setClass,
		bindEvents							:		bindEvents,
		applyElementAttributes				:		applyElementAttributes,
		insertElementBefore					:		insertElementBefore,
		getElementByTagName					:		getElementByTagName,
		getElementsByTagName				:		getElementsByTagName,
		insertElementToHead					:		insertElementToHead,
		isStylePropertySupported			:		isStylePropertySupported,
		isStyleValueSupported				:		isStyleValueSupported,
		dispatchEvent						:		dispatchEvent,
		createTextNode						:		createTextNode,
        cloneElement                        :       cloneElement,
        getElementProperty                  :       getElementProperty
	};
});

/**
 * Created by Nardi.Jaacobi on 7/2/2014.
 */

define('core/adBuilder',['utils/domUtils'], function(domUtils){

    var _adInfo = null;
    var _compManager = null;

    // add item to ad
    var addItem = function(item, readyCB) {
        if (_compManager) {
            _compManager.addItem(item, readyCB);
        }
    };

    // build pre defined items
    var buildPreDefinedItems = function(readyCB) {
        // validate input
        if (_compManager) {
            if (_adInfo.items.length > 0) {
                _compManager.addItems(_adInfo.items, readyCB);
            } else {
                readyCB();
            }
        }
    };

    // initialize builder
    var init = function(adInfo, compManager) {
        _adInfo = adInfo;
        _compManager = compManager;
    };

    // builder ad using adInfo
    var build = function(readyCB){
        if (_adInfo) {
            // set ad background color
            if (_adInfo.bgColor){
                domUtils.applyElementAttributes(document.body,{
                    bgColor:_adInfo.bgColor
                });
            }
            // build predefined items
            buildPreDefinedItems(readyCB);
        }
    };

    return {
        init: init,
        build: build,
        addItem: addItem
    };

});
/**
 * Created by Nardi.Jaacobi on 11/18/2014.
 */

define('comp/types',['utils/urlUtils'], function(urlUtils){

    // reference to client object
    var _client = null;
	// helper dom element for validation
	var _helperDiv = document.createElement('div');

    // initializer
    var init = function(client){
        _client = client;
    };

	var isValidCSSDimension = function(input){
		_helperDiv.style.top = input;
		return (_helperDiv.style.top === input);
	};

	var convertCSSDimension = function(input){
		var result = null;
		if (isValidCSSDimension(input)) {
			result = input;
		} else if (isValidCSSDimension(input+'px')){
			result = input+'px';
		}
		return result;
	};

    var parse = function(type, value){
        if (_types[type]){
            return _types[type].parse(value);
        }
    };

	var _types = {

		'int': {
			parse: function(input) {
				var result;
				var num = parseInt(input);
				if (num == input) {
					result = num;
				}
				return result;
			}
		},

		'float': {
			parse: function(input) {
				var result;
				var num = parseFloat(input);
				if (num == input) {
					result = num;
				}
				return result;
			}
		},

		'cssTop': {
			parse: function(input){
				return convertCSSDimension(input);
			}
		},

		'cssLeft': {
			parse: function(input){
				return convertCSSDimension(input);
			}
		},

		'cssWidth': {
			parse: function(input){
				return convertCSSDimension(input);
			}
		},

		'cssHeight': {
			parse: function(input){
				return convertCSSDimension(input);
			}
		},

		'bool': {
			parse: function(input) {
				var result = null;
				if (typeof input === 'boolean') {
					result = input;
				} else if (typeof input === 'string') {
					var value = input.toLowerCase();
					if (value === 'true') {
						result = true;
					} else if (value === 'false') {
						result = false;
					}
				}
				return result;
			}
		},

		'assets': {
			parse: function(input) {
				var result = null;
				if (typeof input === 'string' ||
					typeof input === 'number' ||
					(input instanceof Object && !(input instanceof Array))) {
					input = [input];
				}
				if (input instanceof Array) {
					result = _client.getAssetsUrl(input);
				}
				return result;
			}
		},

		'asset': {
			parse: function(input) {
				var result = null;
				if (typeof input === 'string' ||
					typeof input === 'number' ||
					input instanceof Object) {
					result = _client.getAssetUrl(input);
				}
				return result;
			}
		},

        'array':{
            parse: function(input){
                var result = null;
                if(input instanceof Array){
                    result = input;
                } else {
                    result = [];
                }
                return result;
            }
        },

		'url':{
			parse: function(input){
				var result = null;
				if(typeof input === 'string'){
					result = urlUtils.fixURL(input);
				}
				return result;
			}
		},

        'clickThrough':{
            parse: function(input){
                var result = null;
                if (input instanceof Object){
                    if (input.kind === 'custom' && input.url){
                        input.url = _types.url.parse(input.url);
                    }
                    result = input;
                }
                return result;
            }
        }
	};

    return {
        init: init,
        parse: parse
    };

});

/**
 * Created by Nardi.Jaacobi on 8/12/2015.
 */

define('comp/compFactory',['comp/types', 'infra/logger'], function(types, logger) {

    var _compMap = {}; // component map (id, referehttp://www.willmaster.com/images/wmlogo_icon.gifnce)
    var _compListMap = {};
    var _client = null;
    var _compRepository = {};

    // initialize component manager
    var init = function(initProp){
        _client = initProp.client;
        _compRepository = initProp.compRepository;
        types.init(_client);
    };

    // load component by id
    var loadComponentById = function(compId, readyCB){
        require([compId], function(comp){
            _compMap[compId] = comp;
            readyCB(comp);
        }, function(error){
            readyCB(null);
        });
    };

    // convert comp type list to comp id list and remove already loaded comp
    var compTypesToCompIds = function(compTypes) {
        // create empty comp id array
        var compIds = [];
        // loop comp type list
        for (var i in compTypes) {
            // convert current type to id
            var compId = compTypeToCompId(compTypes[i]);
            // check if valid and if not already loaded
            if (compId && compIds.indexOf(compId) == -1) {
                compIds.push(compId);
            }
        }
        return compIds;
    };

    // load components in compTypes (list of comp types)
    // and call readyCB when ready
    var loadComponents = function(compTypes, readyCB) {
        var compIds = compTypesToCompIds(compTypes);
        if (compIds && compIds.length) {
            require(compIds, function() {
                for (var i in compIds) {
                    _compMap[compIds[i]] = arguments[i];
                }
                readyCB();
            });
        } else {
            readyCB();
        }
    };

    // convert comp type to comp id than can be used by require
    var compTypeToCompId = function(type) {
        // result comp id
        var compId = null;

        if (type && typeof type === 'string') {
            var sep = type.indexOf('-');
            if (sep > 0 && sep < type.length){
                var base = _compRepository[type.substring(0, sep)];
                if (base){
                    var name = type.substring(sep+1, type.length);
                    compId = base + '/' + name + '/' + name;
                }
            }
        }
        return compId;
    };

    // get Component by type
    var getComponentByType = function(type, readyCB){
        var compId = compTypeToCompId(type);
        if (compId) {
            var comp = _compMap[compId];
            if (comp) {
                readyCB(comp);
            } else {
                loadComponentById(compId, readyCB);
            }
        }
    };

    var addToCompList = function(type, comp){
        if(!(type in _compListMap)){
            _compListMap[type] = [];
        }
        _compListMap[type].push(comp);
    };

    var getComponentsByType = function(type){
        return _compListMap[type];
    };

    var createComp = function(prop) {
        getComponentByType(prop.prop.type, function(comp){
            if (comp) {
                // create component instance
                var compInst = new comp({
                    div: prop.div,
                    prop: prop.prop,
                    dataObjects: prop.dataObjects,
                    client: _client
                });
                // draw component
                compInst.draw();
                addToCompList(prop.prop.type, compInst);
            }
            // notify component ready
            prop.readyCB(compInst);
        });
    };

    return {
        init: init,
        createComp: createComp,
        loadComponents: loadComponents,
        getComponentsByType: getComponentsByType
    };

});

/**
 * Created by Nardi.Jaacobi on 7/3/2014.
 */

define('core/compManager',['utils/domUtils', 'comp/compFactory', 'infra/logger'],
        function(domUtils, compFactory, logger) {

    var _currentContainer = null;
    // temporary implementation for holding a list of reference for items in this ad by type
    var _compPrefixToBaseLocation = {
        'adkit': 'comp',
        'user': 'user'
    };

    // initialize component manager
    var init = function(client){
        _currentContainer = domUtils.getElementById('adkit-container') ||
                            domUtils.getElementsByTagName('body')[0];
        compFactory.init({
            client: client,
            compRepository: _compPrefixToBaseLocation
        });
    };

    // get item div - create one if not exist
    var getItemDiv = function(item) {
        var div = domUtils.getElementById(item.id);
        // create item div if net exist
        if (!div){
            // create div
            div = domUtils.createElement('div');
            domUtils.setElementId(div, item.id);
			_currentContainer.appendChild(div);
        }
        return div;
    };



    // add adkit item and notify when ready
    var addItem = function(item, readyCB) {
        if (item) {
            var div = getItemDiv(item);
            compFactory.createComp({
                div: div,
                prop: item,
                readyCB: function(comp){
                    if (readyCB) {
                        readyCB(comp);
                    }
                }
            });
        }
    };

    // add the specified adkit items and notify when ready
    var addItems = function(items, readyCB) {
        var itemsAdded = 0;
        var numItems = items.length;
        items.forEach(function(item){
            // add adkit item
            addItem(item, function(){
                if (++itemsAdded === numItems){
                    readyCB();
                }
            });
        });
    };

    var setCurrentContainer = function(id){
        _currentContainer = domUtils.getElementById(id);
    };

    return {
        init: init,
        addItem: addItem,
        addItems: addItems,
        loadComponents: compFactory.loadComponents,
        setCurrentContainer: setCurrentContainer,
		getComponentsByType: compFactory.getComponentsByType
    };

});

/**
 * Created by Nardi.Jaacobi on 7/7/2014.
 */

define('infra/subject',[],function(){

    var Subject = function (){
        this.eventCBMap = {};
    };

    Subject.prototype.registerForEvent = function (event, times, callback) {
        // validate params
        if (typeof callback === 'function' &&
            typeof event === 'string' &&
            typeof times === 'number' &&
            (times === -1 || times > 0)) {
            // create key for the specified
            // event if not created yet
            if (!this.eventCBMap[event]) {
                this.eventCBMap[event] = [];
            }
            // add callback info
            this.eventCBMap[event].push({
                cb: callback,
                times: times
            });
        }
    };

    Subject.prototype.dispatchEvent = function (event, data) {
        // validate param
        if (typeof event === 'string' && this.eventCBMap[event]) {
            // if event registered
            if (this.eventCBMap[event]) {
                var cbList = this.eventCBMap[event];
                for (var i in cbList) {
                    cbList[i].cb(data);
                    if (cbList[i].times > 0) {
                        if (--cbList[i].times === 0) {
                            cbList.slice(parseInt(i), 1);
                        }
                    }
                }
            }
        }
    };

    return Subject;

});

/**
 * Created by Nardi.Jaacobi on 7/1/2014.
 */

define('core/adManager',['core/client/clientManager', 'core/adBuilder', 'core/compManager', 'utils/domUtils', 'infra/subject'],
        function(clientManager, adBuilder, compManager, domUtils, subject) {

    var _adInfo = null;
    var _subject = new subject();

    var _EVENTS = {
        EXPAND: 'adkit-expand',
        COLLAPSE: 'adkit-collapse'
    };

    // initialize ad manager
    var init = function(adInfo, readyCB) {
        // save ad info
        _adInfo = adInfo;
        // initialize client manager
        clientManager.init(_adInfo, function(){
            // initialize component manager with data providers
            compManager.init(clientManager);
            // build items
            build(readyCB);
        });
    };

    var build = function(readyCB) {
        adBuilder.init(_adInfo, compManager);
        adBuilder.build(readyCB);
    };

    var getAdInfo = function() {
        return _adInfo;
    };

    var onExpand = function(expandCB){
        _subject.registerForEvent(_EVENTS.EXPAND, 1, expandCB);
    };

    var onCollapse = function(collapseCB){
        _subject.registerForEvent(_EVENTS.COLLAPSE, 1, collapseCB);
    };

    var getClient = function(){
        return clientManager;
    };

    return {
        init: init,
        addItem: adBuilder.addItem,
        getAdInfo: getAdInfo,
        setCurrentContainer: compManager.setCurrentContainer,
        loadComponents: compManager.loadComponents,
        getComponentsByType : compManager.getComponentsByType,
        onExpand: onExpand,
        onCollapse: onCollapse,
        getClient: getClient
    };

});

/**
 * Created by Nardi.Jaacobi on 7/10/2014.
 */

define('core/localConfig',['config'], function(localConfig){

    var config = { };

    if (localConfig){
        config = localConfig;
    }

    var getConfig = function(){
        return config;
    };

    return {
        getConfig: getConfig
    };

});
/**
 * Created by Nardi.Jaacobi on 7/3/2014.
 */

define('core/configManager',['core/localConfig', 'infra/logger'], function(localConfig, logger) {

    var buildITEMS = function(config){
        var items = config.ITEMS;
        if (items &&
            items instanceof Array &&
            items.length) {
            adConfig.ITEMS = items;
        }
    };

    var buildBanners = function(config){
        var banners = config.banners;
        if (banners && banners instanceof Array) {
            for (var i in banners) {
                var banner = banners[i];
                if (banner instanceof Object && banner.id) {
                    adConfig.banners[banner.id] = banner;
                }
            }
        }
    };

    var buildPanels = function(config){
        var panels = config.panels;
        if (panels && panels instanceof Array) {
            for (var i in panels) {
                var panel = panels[i];
                if (panel instanceof Object && panel.id) {
                    adConfig.panels[panel.id] = panel;
                }
            }
        }
    };

    var buildSV = function(config){
        var sv = config.SV;
        if (sv && sv instanceof Object &&
            sv.svData instanceof Array &&
            sv.svData.length) {
            for (var i in sv.svData) {
                var currentSV = sv.svData[i];
                if (currentSV instanceof Object && typeof currentSV.svKey === 'string' ) {
                    adConfig.SV.svData[currentSV.svKey.toLowerCase()] = currentSV;
                }
            }
        }
    };

    var buildSVCatalog = function(config){
        var svCatalog = config.SVCatalog;
        if (svCatalog &&
            svCatalog instanceof Object &&
            svCatalog.svData instanceof Array &&
            svCatalog.svData.length) {
            adConfig.SVCatalog.minVersions = svCatalog.minVersions;
            adConfig.SVCatalog.maxVersions = svCatalog.maxVersions;
            for (var i in svCatalog.svData) {
                var currentSV = svCatalog.svData[i];
                if (currentSV instanceof Object && typeof currentSV.svCatKey === 'string' ) {
                    adConfig.SVCatalog.svData[currentSV.svCatKey.toLowerCase()] = currentSV;
                }
            }
        }
    };

    var buildAdditionalAssets = function(config){
        var additionalAssets = config.AdditionalAssets;
        if (additionalAssets &&
            additionalAssets instanceof Array &&
            additionalAssets.length) {
            for (var i in additionalAssets) {
                var currentAA = additionalAssets[i];
                if (currentAA instanceof Object && currentAA.OrdinalNumber) {
                    adConfig.AdditionalAssets[currentAA.OrdinalNumber] = currentAA;
                }
            }
        }
    };

    var buildSimpleProperty = function(config, property) {
        if (config[property]){
            adConfig[property] = config[property];
        }
    };

    var buildSimpleProperties = function(config){
        buildSimpleProperty(config, 'type');
        buildSimpleProperty(config, 'defaultBanner');
		buildSimpleProperty(config, 'defaultPanel');
        buildSimpleProperty(config, 'bgColor');
        buildSimpleProperty(config, 'clickThrough');
        buildSimpleProperty(config, 'meta');
    };

    // build internal config object from local config
    var buildFromLocalConfig = function(config) {
        // Process config
        if (config instanceof Object) {
            // Build modules map and array
            buildITEMS(config);
            buildBanners(config);
            buildPanels(config);
            buildSV(config);
            buildSVCatalog(config);
            buildAdditionalAssets(config);
            buildSimpleProperties(config);
        }

    };

    var init = function(){
        var config = localConfig.getConfig();
        buildFromLocalConfig(config);
    };

    var getConfig = function(){
        return adConfig;
    };

    // Save ref erence to ad config
    var adConfig = {
        banners: {},
        panels: {},
        SV: { svData: {} },
        SVCatalog: { svData:{} },
        AdditionalAssets: {}
    };

    return {
        init: init,
        getConfig : getConfig
    };

});

/**
 * Created by Nardi.Jaacobi on 7/10/2014.
 */

define('core/adInfo',[],function(){
    return {
        usingVideo: false,
        usingSV: false,
        usingSVCatalog: false,
        items: [],
        svSchema: {},
        svCatalogSchema: {},
        additionalAssets: {}
    };
});
/**
 * Created by Nardi.Jaacobi on 7/2/2014.
 */

define('core/adInfoBuilder',['core/configManager', 'core/adInfo'], function(configManager, adInfo){

    _adInfo = adInfo;

    var getAdInfo = function(){
        return _adInfo;
    };

    var isUsingSV = function(config){
        return (Object.keys(config.SV.svData).length > 0);
    };

    var isUsingSVCatalog = function(config){
        return (Object.keys(config.SVCatalog.svData).length > 0);
    };

    var isItemUsingVideo = function(item){
        var usingVideo = false;
        if (item.type === 'adkit-video' || item.type === 'adkit-youtube') {
            usingVideo = true;
        } else {
            for (var p in item) {
                if (item[p] instanceof Object) {
                    if (isItemUsingVideo(item[p])) {
                        usingVideo = true;
                        break;
                    }
                }
            }
        }
        return usingVideo;
    };

    var getSimpleConfigAdPart = function(config){
        return {
            type: 'banner',
            data: { items: config.ITEMS }
        };
    };

	var getDefaultBanner = function(banners){
		for (var banner in banners){
			if(banners.hasOwnProperty(banner)){
				return banners[banner];
			}
		}
	};

    var getBannerAdPart = function(config, name){
        return {
            type: 'banner',
            data: config.banners[name] || config.banners[config.defaultBanner] || getDefaultBanner(config.banners)
        };
    };

    var getPanelAdPart = function(config, name){
        return {
            type: 'panel',
            data: config.panels[name] || config.panels[config.defaultPanel]
        };
    };

    var getExtendedConfigAdPart = function(config){
        var adPart = null;
        var clientAdPart = adkit.environment.adParts;
        if (clientAdPart instanceof Object) {
            if (clientAdPart.type === 'banner') {
                adPart = getBannerAdPart(config, clientAdPart.name);
            } else if (clientAdPart.type === 'panel') {
                adPart = getPanelAdPart(config, clientAdPart.name);
            }
        }
        if (adPart == null){
            adPart = getBannerAdPart(config);
        }
        return adPart;
    };

    var getAdPart = function(config){
        var adPart = null;
        if (Object.keys(config.banners).length) {
            adPart = getExtendedConfigAdPart(config);
        } else {
            adPart = getSimpleConfigAdPart(config);
        }
        return adPart;
    };

    var getItems = function(adPart){
        return (adPart.data.items instanceof Array) ? adPart.data.items : [];
    };

    var getBackgroundColor = function(adPart, config){
        return ('bgColor' in adPart.data) ?
                    adPart.data.bgColor :('bgColor' in config) ? config.bgColor : null;
    };

    var isUsingVideo = function(items){
        var usingVideo = false;
        for (var p in items) {
            if (isItemUsingVideo(items[p])) {
                usingVideo = true;
                break;
            }
        }
        return usingVideo;
    };

    var getClickThrough = function(config){
        return (config.clickThrough instanceof Object) ? config.clickThrough : null;
    };

    var build = function(){
        // initialize config manager
        configManager.init();
        var config = configManager.getConfig();
        // get ad part
        _adInfo.adPart = getAdPart(config);
		// get ad type
		_adInfo.adType = config.type || '';
        // get ad part items
        _adInfo.items = getItems(_adInfo.adPart);
        // get clickthrough
        _adInfo.clickThrough = getClickThrough(config);
        // get is using sv
        _adInfo.usingSV = isUsingSV(config);
        // get is using sv catalog
        _adInfo.usingSVCatalog = isUsingSVCatalog(config);
        // get sv data object
        _adInfo.svSchema = config.SV;
        // get sv data object
        _adInfo.svCatalogSchema = config.SVCatalog;
        // get additional assets
        _adInfo.additionalAssets = config.AdditionalAssets;
        // is using video
        _adInfo.usingVideo = isUsingVideo(_adInfo.items);
        // ad background color
        _adInfo.bgColor = getBackgroundColor(_adInfo.adPart, config);
		// ad clickThrough
		_adInfo.clickThrough = config.clickThrough;

    };

    return {
        build: build,
        getAdInfo: getAdInfo
    };

});

/**
 * Created by Nardi.Jaacobi on 7/3/2014.
 */

define('core/main',['requireDomReady', 'core/adkitAPI', 'core/adManager', 'core/adInfoBuilder', 'infra/logger'],
       function(domReady, adkitAPI, adManager, adInfoBuilder, logger){

    // init global adkit object for use by external code
    var initExternalInterface = function(adManager){
        // notify adkit ready
        adkitAPI.notifyReady(adManager);
        logger.log('init external interface');
    };

    (function() {
        // wait for dom ready
		domReady(function(){
            adInfoBuilder.build();
            // initialize ad manager
            adManager.init(adInfoBuilder.getAdInfo(), function() {
                initExternalInterface(adManager);
            });
		});
    })();
	
});
/**
 * Created by Nardi.Jaacobi on 7/3/2014.
 */

(function() {

	var urlSep = '/';
    var configjs = 'config';
    var adkitScriptRegEx1 = /adkit\/\d_\d_\d_\d\/adkit.js/;
    var adkitScriptRegEx2 = /\/adkit.js/;
    var replaceDSlashRegEx = /\/+$/;
    var requireDomReadyPath = 'contrib/requirejs-domready/domReady';
    var requireCssPath = 'contrib/require-css/css';

    // fix double slash
    var fixPathSep = function(path) {
       return path.replace(replaceDSlashRegEx,'');
    };

    // return adkit script object reference
    var getAdkitScript = function(){
        var script = null;
        var localPreviewScript = null;
        // get all script elements
        var scripts = document.getElementsByTagName('script');
        for (var i in scripts) {
            var curScript = scripts[i];
            if (curScript.src) {
                // if script src is adkit url with version
                if (curScript.src.search(adkitScriptRegEx1) !== -1) {
                    script = curScript;
                    break;
                // if script src is adkit direct url
                } else if (!localPreviewScript && curScript.src.search(adkitScriptRegEx2) !== -1) {
                    localPreviewScript = curScript;
                }
            }
        }
        // return adkit url with version otherwise use direct link
        return script || localPreviewScript;
    };

    // get reference to the script element which initiated current script
	var getCurrentScript = function() {
        var script = null;
        // if currentScript function defined use it
        if (document.currentScript) {
            script = document.currentScript;
        // if currentScript function not defined
        } else {
            script = getAdkitScript();
        }
        return script;
	};

    // initialize adkit environment object if not defined
    var initEnvironment = function() {
        if (!adkit.environment) {
            var pathname = window.location.pathname;
            adkit.environment = {
                paths: {
                    folderRoot: window.location.protocol + '//' +
                                window.location.host +
                                fixPathSep(pathname.substring(0, pathname.lastIndexOf(urlSep)))
                }
            };
        }
    };

    // return config.js location
    var getConfigPath = function() {
        return (adkitConfig) ? adkitConfig :
                               fixPathSep(adkit.environment.paths.folderRoot) + '/' + configjs;
    };

    // detect if require js already loaded
	var isRequirejsLoaded = function() {
		return (typeof require === 'function');
	};

    initEnvironment();

	var curScript = getCurrentScript();
    // var adkitMode = curScript.getAttribute('adkit-mode');
    var adkitMode = 'local';
    var isServing = adkitMode ? (adkitMode === 'serving') : true;
    var adkitConfig =  null; //curScript.getAttribute('adkit-config');
    // console.log(adkitConfig);
    // debugger;
    var configPath = getConfigPath();
    var adkitBasePath = fixPathSep(curScript.src.substring(0, curScript.src.lastIndexOf(urlSep))+'/');
    var requirejsPath = adkitBasePath + '/contrib/requirejs/require.js';
	var clientPath = isServing ? fixPathSep(adkit.environment.paths.nonCachedScript) : 'client';
    var configFallback = [configPath, configjs];

    var requireConfig = {
        baseUrl: adkitBasePath,
        paths: {
            'requireDomReady': requireDomReadyPath,
            'client': clientPath,
            'config': configFallback,
            'requireCss' : requireCssPath,
            'user': adkit.environment.paths.folderRoot
        }
    };

	if (isRequirejsLoaded()) {
        require.config(requireConfig);
        require(['core/main']);
    }
	else {
		require = requireConfig;
	    require.deps = ['core/main'];
		var script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = requirejsPath;
		curScript.parentNode.appendChild(script);
	}

})();

define("adkit", function(){});

/**
 * Created by einat.rolnik on 7/17/2014.
 */

define('comp/baseComp',['comp/types', 'utils/domUtils', 'infra/logger'], function(types, domUtils, logger) {

    //--------------------------
    // Constructor
    //--------------------------
    function BaseComp(properties) {
        if (properties) {
            this.prop = Object.create(properties.prop);
            this.dataObjects = properties.dataObjects;
            this.div = properties.div;
            this.client = properties.client;
            this.normalize();
        }
    }

    //--------------------------
    // Private member functions
    //--------------------------

    // get data for the specified object from specified dataObjects
    var getDataFromDataObjects = function(dataObjects, obj){
        var data = null;
        if (dataObjects && obj){
            dataObjects.some(function(dataObject){
                var signature = dataObject.getSignature() + 'Key';
                if (signature in obj) {
                    data = getDataValue(dataObject.getDataByKey(obj[signature]));
                    return true;
                }
            });
        }
        return data;
    };

    // get variable data for the specified variable object
    var getVariableData = function(obj){
        var data = getDataFromDataObjects(this.dataObjects, obj);
        if (data == null){
            data = getDataFromDataObjects(this.client.getDataObjects(), obj);
        }
        return data;
    };

    var updateVariableData = function(obj, property, varDataObj){
        var data = getVariableData.call(this, varDataObj);
        if (data != null) {
            obj[property] = data;
        }
    };

    var getDataValue = function(data){
        var value =  (data instanceof Object && 'value' in data) ? data.value : data;
        return (typeof value === 'string' || typeof value === 'number' || value instanceof Object) ? value : null;
    };

    var attachClickThrough = function(element, clickThrough){
        var self = this;
        switch(clickThrough.kind){
            case 'platform':
                domUtils.bindEvent(element, 'click', function(){
                    self.client.clickThrough();
                });
                break;
            case 'custom':
            domUtils.bindEvent(element, 'click', function(){
                self.client.clickThrough(clickThrough.name, clickThrough.url);
            });
            break;
        }
    };



    var parseInput = function(curItem, inputSchema) {
        var result = curItem;
        if (curItem && inputSchema) {
            if (typeof inputSchema === 'string'){
                var parsed = types.parse(inputSchema, curItem);
                if (parsed != null){
                    result = parsed;
                }
            } else if(curItem instanceof Object && inputSchema instanceof Object) {
                var passFullInputSchema = false;
                if (curItem instanceof Array) { // curItem = [{someObject}, {someObject}, ...]
                    if (!(inputSchema instanceof Array)) { // input schema = {someObjectSchema}
                        passFullInputSchema = true;
                    }
                }
                for (var key in curItem) {
                    result[key] = parseInput(curItem[key], passFullInputSchema ? inputSchema : inputSchema[key]);
                }
            }
        }
        return result;
    };

    //--------------------------
    // Protected member functions
    //--------------------------

    BaseComp.prototype.internalDraw = function() {

        var style = this.div.style;

        if ('position' in this.prop) {
            style.position = this.prop.position;
        }
        if ('width' in this.prop) {
            style.width = this.prop.width;
        }
        if ('height' in this.prop) {
            style.height = this.prop.height;
        }
        if ('top' in this.prop) {
            style.top = this.prop.top;
        }
        if ('left' in this.prop) {
            style.left = this.prop.left;
        }
        if ('zIndex' in this.prop) {
            style.zIndex = this.prop.zIndex;
        }
        if ('clickThrough' in this.prop &&
            this.prop.clickThrough instanceof Object) {
            attachClickThrough.call(this, this.div, this.prop.clickThrough);
        }
    };

    BaseComp.prototype.convertFromPrevFormat = function() {
        if (this.prop.params instanceof Object) {
            for (var p in this.prop.params) {
                this.prop[p] = this.prop.params[p];
            }
            delete this.prop.params;
        }
    };

    BaseComp.prototype.normalizeDefaultProperty = function() {
        var dProp = this.getDefaultProperty();
        if (dProp) {
            updateVariableData.call(this, this.prop, dProp, this.prop);
        }
    };

    BaseComp.prototype.normalizeProperties = function() {
        var inputSchema = this.getInputSchema();
        for (var p in inputSchema) {
            if (inputSchema[p] !== 'adkitComp' && p in this.prop) {
                if (this.prop[p] instanceof Object && !(this.prop[p] instanceof Array)) {
                    updateVariableData.call(this, this.prop, p, this.prop[p]);
                }

				this.prop[p] = parseInput(this.prop[p], inputSchema[p]);
                if (this.prop[p] == null) {
                    delete this.prop[p];
                }
            }
        }
    };

    BaseComp.prototype.addProperties = function() {
    };

    BaseComp.prototype.normalize = function(){
        this.convertFromPrevFormat();
        this.addProperties();
        this.normalizeDefaultProperty();
        this.normalizeProperties();
    };

    BaseComp.prototype.getDefaultProperty = function(){
        return null;
    };

    BaseComp.prototype.getInputSchema = function() {
        return BaseComp.inputSchema;
    };

    BaseComp.inputSchema = {
        top: 'cssTop',
        left: 'cssLeft',
        width: 'cssWidth',
        height: 'cssHeight',
        clickThrough: 'clickThrough',
        position: null,
        zIndex: null
    };

    //--------------------------
    // Public member functions
    //--------------------------

    BaseComp.prototype.draw = function() {
        if (this.div) {
            this.internalDraw();
        }
    };

    //--------------------------
    // AMD - return class name
    //--------------------------

    return BaseComp;

});

/**
 * Created by Nardi.Jaacobi on 2/8/2015.
 */

define('utils/objectUtils',[],function(){

    var create = function(proto, object){
        var newObj = Object.create(proto);
        Object.keys(object).forEach(function(item) {
            newObj[item] = object[item];
        });
        return newObj;
    };

	var removeUndefinedProperties = function(obj){
		if(obj) {
			for (var prop in obj) {
				if (obj[prop] == null) {//remove undefined or null properties
					delete obj[prop];
				}
			}
		}
	};

    var lowerCaseProperties = function(obj){
        var resultObj = null;
        // validate input
        if (obj) {
            resultObj = {};
            var keys = Object.keys(obj);
            var n = keys.length;
            while(n--){
                var originalKey = keys[n];
                if (resultObj[originalKey] instanceof Object) {
                    resultObj[originalKey.toLowerCase()] = lowerCaseProperties(obj[originalKey], true);
                } else {
                    resultObj[originalKey.toLowerCase()] = obj[originalKey];
                }
            }
        }
        return resultObj;
    };

    var generateGUID = function() {
        var s4 = function() {
            return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
        };
        return (s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4());
    };

    return {
        create: create,
        removeUndefinedProperties: removeUndefinedProperties,
        lowerCaseProperties: lowerCaseProperties,
        generateGUID: generateGUID
    };
});

/**
 * Created by Nardi.Jaacobi on 8/25/2014.
 */
define('comp/graphicComp',['comp/baseComp', 'utils/objectUtils', 'infra/logger'],
    function(baseComp, objectUtils, logger){

        function GraphicComp(properties) {
            baseComp.call(this, properties);
        }

        GraphicComp.prototype = new baseComp();

        GraphicComp.prototype.internalDraw = function() {

            baseComp.prototype.internalDraw.call(this);

            var style = this.div.style;

            style.fontFamily = 'Arial,Helvetica,sans-serif';

            if ('visible' in this.prop) {
                style.visibility = this.prop.visible ? 'visible' : 'hidden';
            }
            if ('opacity' in this.prop) {
                style.opacity = this.prop.opacity;
            }
            if ('layout' in this.prop) {
                style.display = this.prop.layout ? 'block' : 'none';
            }
            if ('bgColor' in this.prop) {
                style.backgroundColor = this.prop.bgColor;
            }
            if('color' in this.prop){
                style.color = this.prop.color;
            }

            var overflow = 'hidden';
            if ('overflow' in this.prop) {
                overflow = this.prop.overflow;
            }
            style.overflow = overflow;

            var wordBreak = 'normal';
            if ('wordBreak' in this.prop) {
                wordBreak = this.prop.wordBreak;
            }
            style.wordBreak = wordBreak;

            if('css' in this.prop ){
                style.cssText = (typeof style.cssText === 'string') ?
                                 style.cssText + ";" + this.prop.css : this.prop.css;
            }

        };

        GraphicComp.prototype.getInputSchema = function() {
            return GraphicComp.inputSchema;
        };

        GraphicComp.inputSchema = objectUtils.create(baseComp.inputSchema,{
            visible: 'bool',
            layout: 'bool',
            opacity: null,
            bgColor: null,
            overflow: null,
            wordBreak: null,
            color: null,
            css: null
        });

        return GraphicComp;

    });


//# sourceMappingURL=adkit.js.map