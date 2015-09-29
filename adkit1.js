    (function(){

        // adkit latest version
        var version = '1_0_5_1';
        adkit = typeof adkit === 'undefined' ?  {} : adkit;
        adkit.onReady = function(callback){
            window.addEventListener('adkit-ready', callback);
        };

        // get the script element which loaded this script file
        function getCurrentScript() {
            var scripts = document.getElementsByTagName('script');
            return scripts[scripts.length-1];
        }

        // get the origin (protocol+host+port) of this script file
        function getScriptOrigin(script){
            var start = script.src.indexOf('://') + 3;
            var end = script.src.indexOf('/', start);
            return script.src.substr(0, end);
        }

        // load the specified script synchronously
        function loadScript(src){
            var curScript = getCurrentScript();
            var curScriptOrigin = getScriptOrigin(curScript);
            var parent = document.getElementsByTagName['head'] || document.documentElement;
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = curScriptOrigin + src;
            // define preview mode
            script.setAttribute('adkit-mode', 'preview');
            // define alternate location for ad config file
            if (curScript.hasAttribute('adkit-config')){
                script.setAttribute('adkit-config', curScript.getAttribute('adkit-config'));
            }
            parent.appendChild(script);
        }

        // load adkit specific version synchronously
        // loadScript('/BurstingCachedScripts/adkit/' + version + '/adkit.js');
    })();
