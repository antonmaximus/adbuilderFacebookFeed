define(['comp/graphicComp', 'utils/domUtils', 'utils/objectUtils'],
    function(graphicComp, domUtils, objectUtils) {
        'use strict';
        var _templates = {
                holder: '<div style="position: relative; width: 100%; height: 100%;"><%=pageBar%><%=ulWrapper%></div>',
                pageBar: '<div style="position: absolute; bottom: 0; height: 38px; width: 100%; background: rgba(0, 0, 0, 0.5); text-align: right; "><a id="fbook-page" href="<%=fbookPageLink %>"><div style="background: #000; display: inline-block; border-radius: 6px; margin-right: 9px; margin-top: 8px; padding: 4px 8px; color: #FFF; font-size: 11px; ">VISIT</div></a></div>',
                li: '<li data-fbpost="<%=fbpostLink %>"> <div class="feed-item" style="width: 100%; padding: 4px 0 2px 0; border-bottom: 1px solid <%=separatorColor %>; cursor: pointer;"> <img src="<%=picture %>" style="width: 15%; margin-left: 2px; margin-top: 2px;"/> <div style="width: 80%; vertical-align: top; display: inline-block; word-wrap: break-word; margin-left: 3px; "> <span><%=message %></span> <br/> <a href="<%=articleLink %>" target="_blank" style="color: <%=linkColor %>; text-decoration: underline; cursor: pointer;"> <%=articleLink %> </a><span style="text-align: right; display: block; vertical-align: bottom; color: <%=timestampColor %>;"><%=timestamp %></span> </div></div></li>',
                liNoThumb: '<li data-fbpost="<%=fbpostLink %>"> <div class="feed-item" style="width: 100%; padding: 4px 0 2px 0; border-bottom: 1px solid <%=separatorColor %>; cursor: pointer;"> <div style="width: 100%; vertical-align: top; display: inline-block; word-wrap: break-word; margin-left: 0; "> <span><%=message %></span> <br/> <a href="<%=articleLink %>" target="_blank" style="color: <%=linkColor %>; text-decoration: underline; cursor: pointer;"> <%=articleLink %> </a><span style="text-align: right; display: block; vertical-align: bottom; color: <%=timestampColor %>;"><%=timestamp %></span> </div></div></li>',
                ul: '<ul style="list-style: none; padding: 0; margin: 0; "><%=li%></ul>',
                ulWrapper: '<div style="overflow: scroll; height: 100%;"><%=ul%></div>',
                imagePlaceHolder: '<div id="sz-placeholderImage" style="width: 100%; height: 100%; background: gray url(<%=image%>); background-size: cover; cursor: pointer;"></div>',
                loadingGif: '<img src="data:image/gif;base64,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" alt="Be patient..." style="margin: auto; display: block; transform: translateY(<%=loaderY%>);"/>'
            },
            _tplCache = {}, 
            _feedData,
            _facebookPage, 
            _self,
            DEFAULT = {
                width: 300,
                height: 250,
                fontFamily: 'Arial',
                fontSize: 12,
                textColor: '#000000',
                linkColor: '#0000FF',
                separatorColor: '#DDDDDD',
                timestampColor: '#DDDDDD'
            },
            FB_BASE_URL = 'https://www.facebook.com/',
            ACCESS_TOKEN = '279915592145003|EzrYJeGR2WzRgpjf4hjYlaMv-yY'; // Access token should never change unless the FaceBook app is deleted or its app secret is updated.


        function FacebookFeedComp(properties) {
            graphicComp.call(this, properties);
            _self = this;

            // Get Facebook Page's name
            _facebookPage = _self.prop.facebookPageUrl.split('facebook.com/')[1];
            if(_facebookPage) {
                var urlSuffix = _facebookPage.search(/[^a-zA-Z0-9.]/); //Parse out any invalid characters.
                _facebookPage = urlSuffix != -1 ?  _facebookPage.substring(0, urlSuffix) : _facebookPage;
                
                if(!_facebookPage){
                    console.log("Invalid Facebook URL");
                }
            } else {
                console.log("Invalid Facebook URL");
            }


        }
        FacebookFeedComp.prototype = new graphicComp();
        var p = FacebookFeedComp.prototype;
        

        p.internalDraw = function() {
            graphicComp.prototype.internalDraw.call(_self);

            // component's css setting
            _self.div.style.cssText += "; width: " + (_self.prop.width || DEFAULT.width) + "px; " + 
                "height: " + (_self.prop.height || DEFAULT.height) + "px; " + 
                "font-family: " + _self.prop.fontFamily + ", " + DEFAULT.fontFamily + "; " + 
                "font-size: " + (_self.prop.fontSize || DEFAULT.fontSize) + "px; " + 
                "color: " + (_self.prop.textColor || DEFAULT.textColor) + ";"

            // Use placeholder image until user clicks on it.
            _self.div.innerHTML  = _self.template(_templates.imagePlaceHolder, {image: _self.prop.placeholderImage});
            _self.div.firstElementChild.addEventListener('click', function() {drawFacebookFeed(_self);});
        };

        p.template = function (str, data){
            // Create a hash to identifiy template (for caching)
            var hash = null;
            if (domUtils.getElementById(str)) {
                hash = str;
                str = domUtils.getElementById(str).innerHTML;
            } else {
                hash = hashString(str);
            }

            // Figure out if we're getting a template, or if we need to
            // load the template - and be sure to cache the result.
            var fn = !/\W/.test(str) ? _tplCache[hash] = _tplCache[hash] || template(str) :
             
                // Generate a reusable function that will serve as a template
                // generator (and which will be cached).
                new Function("obj", 
                    "var p=[],print=function(){p.push.apply(p,arguments);};" +
               
                    // Introduce the data as local variables using with(){}
                    "with(obj){p.push('" +
               
                    // Convert the template into pure JavaScript
                    str
                      .replace(/[\r\t\n]/g, " ")
                      .split("\<%").join("\t")
                      .replace(/((^|%>)[^\t]*)'/g, "$1\r")
                      .replace(/\t=(.*?)%>/g, "',$1,'")
                      .split("\t").join("');")
                      .split("%>").join("p.push('")
                      .split("\r").join("\\'")
                  + "');}return p.join('');");

            // Provide some basic currying to the user
            return data ? fn( data ) : fn;
        };


        p.getInputSchema = function(){
            return FacebookFeedComp.inputSchema;
        };

        FacebookFeedComp.inputSchema = objectUtils.create(graphicComp.inputSchema,{
            facebookPageUrl: null,
            placeholderImage: 'asset',
            showThumbs: true,
            fontFamily: null,
            fontSize: null,
            textColor: null,
            linkColor: null,
            separatorColor: null,
            timestampColor: null,
            width: null,
            height: null
        });

        function createTimestamp(creation) {
            var date = new Date(creation);
            var currDate = new Date();
            var hours = Math.abs(currDate - date) / (60*60*1000);

            // If less than 24 hours, return number of hours since posting; otherwise, month + day
            return (hours < 24) ? Math.floor(hours) + 'h' : 
                date.toDateString().substring(4, 7) + ' ' + date.toDateString().substring(8, 10);
        }

        function drawFacebookFeed() {
            var loaderLocY = (_self.prop.height / 2) - 25 + 'px';
            _self.div.firstElementChild.innerHTML = _self.template(_templates.loadingGif, {loaderY: loaderLocY});

            var url = 'https://graph.facebook.com/v2.4/' + _facebookPage + '/feed?access_token=' + ACCESS_TOKEN + '&fields=id,picture,message,link,icon,created_time';

            console.log(location.protocol);
            console.log('ddddddddd')
            console.log(url)
            fetchFeedData(url, drawFeedElements);
        }

        function drawFeedElements() {
            var templateToUse = _self.prop.showThumbs === true ? _templates.li : _templates.liNoThumb;
            var facebookPostLink = [];
            var feedEntries = '';

            _feedData.forEach(function(item){
                var entry =  _self.template(templateToUse, {
                    picture: item.picture || '', 
                    message: item.message || '', 
                    articleLink: item.link || '',
                    fbpostLink: FB_BASE_URL + _facebookPage + '/posts/' + item.id.split('_')[1] || '',
                    linkColor: _self.prop.linkColor || DEFAULT.linkColor,
                    timestamp: createTimestamp(item.created_time) || '',
                    timestampColor: _self.prop.timestampColor || DEFAULT.timestampColor,
                    separatorColor: _self.prop.separatorColor || DEFAULT.separatorColor });
                feedEntries += entry
            });

            var ul = _self.template(_templates.ul, {li: feedEntries});
            var ulWrapper = _self.template(_templates.ulWrapper, {ul: ul});
            var pageBar = _self.template(_templates.pageBar, {fbookPageLink: FB_BASE_URL + _facebookPage});
            _self.div.innerHTML = _self.template(_templates.holder, {pageBar: pageBar, ulWrapper: ulWrapper}); 

            var liTags = _self.div.querySelectorAll('li');

            for(var i=0; i<liTags.length; i++) {

                liTags[i].addEventListener('click', function(event) {
                    event.preventDefault();
                    if(event.target.tagName === 'A') {
                        adkit.clickThrough('', event.target.href);
                    } else {
                        adkit.clickThrough('', event.currentTarget.getAttribute('data-fbpost'))
                    }
                })
            }

            _self.div.querySelector('#fbook-page').addEventListener('click', function(event) {
                event.preventDefault();
                adkit.clickThrough('', event.currentTarget.href);
            });
        }

function fetchFeedData(url,callback) {
    var xmlhttp;
    if (false) { // IE 9
        console.log('XDomainRequest');
        xmlhttp = new XDomainRequest();
        xmlhttp.onload = function(){
            _feedData = JSON.parse(xmlhttp.responseText).data;
            callback();
        };
    } else {
        console.log('XMLHttpRequest');
        xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == XMLHttpRequest.DONE) {
                if (xmlhttp.status == 200) {
                    _feedData = JSON.parse(xmlhttp.responseText).data;
                    callback();
                } else if (xmlhttp.status == 400) {
                    console.log('There was an error 400');
                } else {
                    console.log('Facebook Group is Invalid');
                }
            }
        };
    } 

    console.log('xmlhttp.onreadystatechange: ' + xmlhttp.onreadystatechange);
    // xmlhttp.onreadystatechange=function() {
    //     if (xmlhttp.readyState==4 && xmlhttp.status==200) {
    //         _feedData = JSON.parse(xmlhttp.responseText).data;
    //         callback();
    //     } else if (xmlhttp.status == 400) {
    //         console.log('There was an error 400');
    //     } else {
    //         console.log('Facebook Group is Invalid');
    //     }
    // };
    xmlhttp.open("GET",url,true);
    xmlhttp.send();
}




        // function fetchFeedData(url, callback) {
        //     console.log(url);
        //     var xmlhttp = new XMLHttpRequest();
        //     xmlhttp.onreadystatechange = function () {
        //         if (xmlhttp.readyState == XMLHttpRequest.DONE) {
        //             if (xmlhttp.status == 200) {
        //                 _feedData = JSON.parse(xmlhttp.responseText).data;
        //                 callback();
        //             } else if (xmlhttp.status == 400) {
        //                 console.log('There was an error 400');
        //             } else {
        //                 console.log('Facebook Group is Invalid');
        //             }
        //         }
        //     };

        //     xmlhttp.open("GET", url, true);
        //     xmlhttp.send();
        // };

        function hashString(str) {
            var hash = 0, i, chr, len;
            if (str.length == 0) {
                return hash;
            }
            for (i = 0, len = str.length; i < len; i++) {
                chr   = str.charCodeAt(i);
                hash  = ((hash << 5) - hash) + chr;
                hash |= 0; // Convert to 32bit integer
            }
            return hash;
        }


        return FacebookFeedComp;
    }
);
