/**
 * Created by Nardi.Jaacobi on 7/3/2014.
 */

define(['core/adInfo', 'utils/objectUtils'], function(adInfo, objectUtils){

    var svDataObject = null;
    var svCatVersions = null;

    var isValidVersionIndex = function(index){
        return (index > 0 && index <= EB.getVersionCount());
    };

    var getSVCatalogVersions = function(){
        if (svCatVersions == null) {
            svCatVersions = createSVCatVersions();
        }
        return svCatVersions;
    };

    var getSVDataObject = function(){
        if (svDataObject == null) {
            svDataObject = createSVDataObject();
        }
        return svDataObject;
    };

    var getVersionCount = function() {
        var versionCount = 0;
        var svData = adInfo.svCatalogSchema.svData;
        if (svData) {
            var firstItem = true;
            for (var key in svData) {
                if (svData[key].value instanceof Array) {
                    var length = svData[key].value.length;
                    if (firstItem) {
                        versionCount = length;
                        firstItem = false;
                    } else if (length < versionCount) {
                        versionCount = length;
                    }
                }
            }
        }
        return versionCount;
    };

    var createSVDataObject = function(){
        var dataObject = {};
        var svData = adInfo.svSchema.svData;
        if (svData) {
            for (var key in svData) {
                var svItem = svData[key];
                if (svItem != null) {
                    dataObject[key] = svItem.value;
                }
            }
        }
        return dataObject;
    };

    var createSVCatVersions = function(){
        var versions = [];
        var numVersions = getVersionCount();
        var svData = adInfo.svCatalogSchema.svData;
        for (var i = 0; i < numVersions; i++) {
            var version = {};
            for (var key in svData) {
                var value = svData[key].value[i];
                version[key] = (value instanceof Object) ? value : { value: value };
            }
            versions.push(version);
        }
        return versions;
    };

    EBG = {

        VideoModule: function(videoElement) {
            this.videoElement = videoElement;
            this.setFullScreenState = function() {

            };
            this.playVideo = function() {

            }
        },

        EventName: {
            EB_INITIALIZED: 'ebinitialized',
            PAGE_LOAD: 'PAGE_LOAD',
            SDK_DATA_CHANGE: 'sdkDataChange',
            SV_DATA_FAILED: 'svDataFailed',
            SV_DATA_READY: 'svDataReady',
            CATALOG_FAILED: 'catalogFailed',
            CATALOG_READY: 'catalogReady'
        },

        ActionType: {
            USER: 'user',
            AUTO: 'auto'
        },

        VideoInteraction: {
            FULLPLAY: "ebVideoFullPlay",
            FULLSCREEN_ASSET_DURATION: "ebFSVideoAssetDuration",
            FULLSCREEN_DURATION: "ebFSVideoPlayDuration",
            FULLSCREEN_END: "ebFSEnd",
            FULLSCREEN_MUTE: "ebFSVideoMute",
            FULLSCREEN_PAUSE: "ebFSVideoPause",
            FULLSCREEN_START: "ebFSStart",
            MUTE: "ebVideoMute",
            PAUSE: "ebVideoPause",
            PERCENT_25_PLAYED: "eb25Per_Played",
            PERCENT_50_PLAYED: "eb50Per_Played",
            PERCENT_75_PLAYED: "eb75Per_Played",
            REPLAY: "ebVideoReplay",
            SLIDER_DRAGGED: "ebSliderDragged",
            STARTED: "ebVideoStarted",
            NMUTE: "ebVideoUnmute",
            UNMUTED: "ebVideoUnmuted",
            USER_INITIATED_VIDEO: "ebUserInitiatedVideo",
            VIDEO_ASSET_DURATION: "ebVideoAssetDuration",
            VIDEO_PLAY_DURATION: "ebVideoPlayDuration"
        }
    };

    EB = {

        notifyCreativeWhenReady: function(readyCB){
            readyCB();
        },

        isInitialized: function(){
            return true;
        },

        addEventListener: function(event, callback){
            var execute = false;
            switch (event){
                case EBG.EventName.SV_DATA_READY:
                case EBG.EventName.CATALOG_READY:
                case EBG.EventName.PAGE_LOAD:
                case EBG.EventName.EB_INITIALIZED:
                    execute = true;
                    break;
            }
            if (execute){
                callback();
            }
        },

        browserSupports: function(featureName){
            return true;
        },
        showDefaultImage: function(){

        },
        clickthrough: function(){
            var url = null;
            switch(arguments.length){
                case 0:
                    url = adInfo.clickThrough && adInfo.clickThrough.url;
                    break;
                case 2:
                    url = arguments[1];
                    break;
            }
            if (typeof url === 'string'){
                window.open(url, '_blank', 'fullscreen=yes')
            }
        },
        userSwipe: function(){

        },
        userActionCounter: function(intName, clickURL){

        },
        automaticEventCounter: function(intName, clickURL){

        },
        startTimer: function(intName){

        },
        stopTimer: function(intName){

        },
        videoInteraction: function(intName, localPath){

        },
        startVideoTimer: function(localPath){

        },
        stopVideoTimer: function(localPath){

        },
        initExpansionParams: function(x, y, width, height) {

        },
        setExpansionParams: function(x, y, width, height) {

        },
        expand: function(params){

        },
        collapse: function(){

        },
        isMobileDevice: function(){
            return false;
        },
        getAssetUrl: function(asset, ordinalNumber){
            // on error return null or undefined
            var result = null;
            if (asset) {
                result = adkit.environment.paths.folderRoot + '/' + asset;
            } else {
                var additionalAsset = adInfo.additionalAssets[ordinalNumber];
                // if ordinal number found and asset property is not an empty string then
                // build additional asset url
                if (additionalAsset instanceof Object &&
                    typeof additionalAsset.FileName === 'string' &&
                    additionalAsset.FileName.length) {
                    result = adkit.environment.paths.folderRoot + '/AdditionalAssets/' + additionalAsset.FileName;
                }
            }
            return result;
        },

        getSVData: function(svKey){
            var result = null;
            var dataObject = getSVDataObject();
            if (dataObject) {
                if (svKey) {
                    if (dataObject[svKey]) {
                        result = dataObject[svKey].value;
                    }
                } else {
                    result = dataObject;
                }
            }
            return result;
        },

        getSDKData: function(){

        },

        getVersions: function(){
            var result = null;
            // arguments initialization
            var startIndex = (typeof arguments[0] === 'number') ? arguments[0] : 1;
            var endIndex = (typeof arguments[1] === 'number') ? arguments[1] : EB.getVersionCount();
            var readyCB = (typeof arguments[1] === 'function') ? arguments[1] : arguments[2];
            // validate arguments
            if (isValidVersionIndex(startIndex) &&
                isValidVersionIndex(endIndex) &&
                typeof readyCB === 'function') {
                // get versions object
                var versions = getSVCatalogVersions();
                if (versions) {
                    // create empty result
                    result = { versionData: { } };
                    // build result
                    for (var i=startIndex; i<=endIndex; i++){
                        result.versionData[i] = versions[i-1];
                    }
                }
            }
            // notify result ready
            readyCB(result);
        },

        getVersionCount: function(){
            var count = 0;
            var versions = getSVCatalogVersions();
            if (versions) {
                count = versions.length;
            }
            return count;
        },

        getMinVersions: function() {
            return this.getVersionCount();
        },

        clickedVersion: function() {

        },

        isCatalogReady: function() {
            return true;
        },

        getVersionDataByKey: function(versionIndex, key, readyCB) {
            var versions = getSVCatalogVersions();
            if (versions && isValidVersionIndex(versionIndex)){
               readyCB(versions[versionIndex-1][key.toLowerCase()]);
            } else {
               readyCB(null);
            }
        }

    };

});