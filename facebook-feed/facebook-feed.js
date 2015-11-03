define(['comp/graphicComp', 'utils/domUtils', 'utils/objectUtils'],

    function(graphicComp, domUtils, objectUtils) {
        /*jshint validthis: true */
        'use strict';

        var _templates = {
            holder: '<div style="position: relative; width: 100%; height: 100%;"><%=overlayBox %><%=ulWrapper %></div>',
            overlayBox: '<div id="overlayBox" style="position: absolute; <%=overlayPosition %>: 0; height: 38px; width: 100%; background: rgba(<%=overlayColor %>, 0.5); text-align: right; "><a id="fbook-page" style="text-decoration: none;" href="<%=fbookPageLink %>"><div style="background: <%=buttonColor %>; color: <%=buttonTextColor %>; font-size: <%=buttonTextFontSize %>; width: <%=buttonWidth %>; height: <%=buttonHeight %>; line-height: <%=buttonHeight %>; top: <%=buttonPositionTop %>; right: <%=buttonPositionRight %>; font-family: <%=buttonTextFontFamily %>; display: inline-block; overflow: hidden; text-align: center; position: relative; border-radius: 6px;"><%=buttonText %></div></a></div>',
            li: '<li data-fbpost="<%=fbpostLink %>"> <div class="feed-item" style="width: 100%; padding: 4px 0 2px 0; border-bottom: 1px solid <%=separatorColor %>; cursor: pointer;"> <img src="<%=picture %>" style="width: <%=thumbPercentSize %>; margin-left: 2px; margin-top: 2px;"/> <div style="width: <%=textPercentSize %>; vertical-align: top; display: inline-block; word-wrap: break-word; margin-left: 3px; "> <span><%=message %></span> <br/> <a href="<%=articleLink %>" target="_blank" style="color: <%=linkColor %>; text-decoration: underline; cursor: pointer;"> <%=articleLink %> </a><span style="text-align: right; display: block; vertical-align: bottom; margin-right: 5px; color: <%=timestampColor %>;"><%=timestamp %></span> </div></div></li>',
            liNoThumb: '<li data-fbpost="<%=fbpostLink %>"> <div class="feed-item" style="width: 100%; padding: 4px 0 2px 0; border-bottom: 1px solid <%=separatorColor %>; cursor: pointer;"> <div style="width: 100%; vertical-align: top; display: inline-block; word-wrap: break-word; margin-left: 0; "> <span><%=message %></span> <br/> <a href="<%=articleLink %>" target="_blank" style="color: <%=linkColor %>; text-decoration: underline; cursor: pointer;"> <%=articleLink %> </a><span style="text-align: right; display: block; vertical-align: bottom; color: <%=timestampColor %>;"><%=timestamp %></span> </div></div></li>',
            ul: '<ul style="list-style: none; padding: 0; margin: 0; background-color:<%=feedBackgroundColor %>;"><%=li %></ul>',
            ulWrapper: '<div id="ulWrapper" style="overflow: scroll; height: 100%;"><%=ul %></div>',
            imagePlaceHolder: '<div id="sz-placeholderImage" style="width: 100%; height: 100%; background:  url(<%=image %>); background-size: cover; cursor: pointer;"></div>',
            loadingGif: '<img src="data:image/gif;base64,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" alt="Be patient..." style="margin: auto; display: block; transform: translateY(<%=loaderY %>); -ms-transform: translateY(<%=loaderY %>);"/>'
        };
           
        var DEFAULT = {
            fontFamily: 'Arial',
            fontSize: 12,
            textColor: '#000000',
            linkColor: '#0000FF',
            separatorColor: '#DDDDDD',
            timestampColor: '#DDDDDD',
            feedBackgroundColor: 'transparent',
            thumbPercentSize: '15%',
            textPercentSize: '80%',
            overlayColor: '#000000',
            overlayPosition: 'bottom',
            buttonColor: '#000000',
            buttonTextColor: '#FFFFFF',
            buttonTextFontSize: 11,
            buttonWidth: '100px',
            buttonHeight: '100px',
            buttonPositionTop: 0,
            buttonPositionRight: 0,
            buttonText: 'VISIT', 
            buttonTextFontFamily: 'Arial',
        };
            
        var FB_BASE_URL = 'https://www.facebook.com/';
        var ACCESS_TOKEN = '279915592145003|EzrYJeGR2WzRgpjf4hjYlaMv-yY'; // Access token should never change unless the FaceBook app is deleted or its app secret is updated.



        function FacebookFeedComp(properties) {
            graphicComp.call(this, properties);          
        }

        FacebookFeedComp.prototype = new graphicComp();

        FacebookFeedComp.prototype.addProperties = function() {
            graphicComp.prototype.addProperties.call(this);
            // you need to add this property otherwise it will not be parsed (css mesaure)
            if (!this.prop.fontSize){
                 this.prop.fontSize = DEFAULT.fontSize;
            }
            this.prop.facebookPageUrl = this.prop.facebookPageUrl.split('facebook.com/')[1];
        };

        FacebookFeedComp.prototype.internalDraw = function() {
            graphicComp.prototype.internalDraw.call(this);
            domUtils.applyStyle(this.div,{
                'font-family': (this.prop.fontFamily || DEFAULT.fontFamily) + "," + DEFAULT.fontFamily,
                'font-size': this.prop.fontSize + 'px',
                'color': '(this.prop.textColor || DEFAULT.textColor)'
            });
            this.div.innerHTML = buildTemplate.call(this, _templates.imagePlaceHolder, {
                image: this.prop.placeholderImage || ''
            });

            if(this.prop.placeholderImage) {
                // Use placeholder image until user clicks on it.
                domUtils.bindEvent(this.div, 'click', function() {
                    EB.userActionCounter("FacebookFeedClicked");
                    drawFacebookFeed.call(this);
                }.bind(this));
            } else {
                drawFacebookFeed.call(this);
            }
        };

    
        FacebookFeedComp.getInputSchema = function(){
            return FacebookFeedComp.inputSchema;
        };

        FacebookFeedComp.inputSchema = objectUtils.create(graphicComp.inputSchema,{
            facebookPageUrl: null,
            placeholderImage: 'asset',
            showThumbs: 'boolean',
            fontFamily: null,
            fontSize: null,
            textColor: null,
            linkColor: null,
            separatorColor: null,
            timestampColor: null,
            feedBackgroundColor: null,
            thumbPercentSize: null,
            textPercentSize: null,
            overlayColor: null,
            overlayPosition: null,
            buttonColor: null,
            buttonTextColor: null,
            buttonTextFontSize: null,
            buttonWidth: null,
            buttonHeight: null,
            buttonPositionTop: null,
            buttonPositionRight: null,
            buttonText: null, 
            buttonTextFontFamily: null,
        });

        function buildTemplate(str, data){
            return str.replace(/<%=.+? %>/g, function(token){
                var key = token.substring(3, token.length-3);
                return data[key];
            });
        }

        function createTimestamp(creation) {
            var date = new Date(creation.slice(0, -5) + 'Z'); //Use ISO 8601 format because IE9
            var currDate = new Date();
            var hours = Math.abs(currDate - date) / (60*60*1000);

            // If less than 24 hours, return number of hours since posting; otherwise, month + day
            return (hours < 24) ? Math.floor(hours) + 'h' : 
                date.toDateString().substring(4, 7) + ' ' + date.toDateString().substring(8, 10);
        }

        function drawFacebookFeed() {
            var loaderLocY = (this.div.offsetHeight / 2) - 25 + 'px';
            this.div.firstElementChild.innerHTML = buildTemplate.call(this, _templates.loadingGif, {
                loaderY: loaderLocY
            });

            var url = 'https://graph.facebook.com/v2.4/' + this.prop.facebookPageUrl + '/feed?access_token=' + ACCESS_TOKEN + '&fields=id,picture,message,link,icon,created_time';
            fetchFeedData.call(this, url, drawFeedElements);
        }

        function drawFeedElements(feedData) {
            var templateToUse = this.prop.showThumbs === true ? _templates.li : _templates.liNoThumb;
            var facebookPostLink = [];
            var feedEntries = '';

            feedData.forEach(function(item){
                var entry =  buildTemplate.call(this, templateToUse, {
                    picture: item.picture || 'https://graph.facebook.com/v2.4/' + this.prop.facebookPageUrl + '/picture?fields=url', 
                    message: item.message || '', 
                    articleLink: item.link || '',
                    fbpostLink: FB_BASE_URL + this.prop.facebookPageUrl + '/posts/' + item.id.split('_')[1] || '',
                    linkColor: this.prop.linkColor || DEFAULT.linkColor,
                    timestamp: createTimestamp(item.created_time) || '',
                    timestampColor: this.prop.timestampColor || DEFAULT.timestampColor,
                    separatorColor: this.prop.separatorColor || DEFAULT.separatorColor,
                    thumbPercentSize: this.prop.thumbnailPercentageSize || DEFAULT.thumbPercentSize,
                    textPercentSize: 95 - parseInt(this.prop.thumbnailPercentageSize) + '%' || DEFAULT.textPercentSize
                });
                feedEntries += entry;
            }.bind(this));

            var overlayColorRGB = hexToRgb(this.prop.overlayColor);
            var ul = buildTemplate.call(this, _templates.ul, {li: feedEntries, feedBackgroundColor: this.prop.feedBackgroundColor || DEFAULT.feedBackgroundColor});
            var ulWrapper = buildTemplate.call(this, _templates.ulWrapper, {ul: ul});
            var overlayBox = buildTemplate.call(this, _templates.overlayBox, {fbookPageLink: FB_BASE_URL + this.prop.facebookPageUrl, 
                overlayColor: overlayColorRGB.r + ',' + overlayColorRGB.g + ',' + overlayColorRGB.b,
                overlayPosition: this.prop.overlayPosition || DEFAULT.overlayPosition,
                buttonColor: this.prop.buttonColor || DEFAULT.buttonColor,
                buttonTextColor: this.prop.buttonTextColor || DEFAULT.buttonTextColor,
                buttonTextFontSize: (this.prop.buttonTextFontSize || DEFAULT.buttonTextFontSize) + 'px',
                buttonWidth: this.prop.buttonWidth || DEFAULT.buttonWidth,
                buttonHeight: this.prop.buttonHeight || DEFAULT.buttonHeight,
                buttonPositionTop: (this.prop.buttonPositionTop || DEFAULT.buttonPositionTop) + 'px',
                buttonPositionRight: (this.prop.buttonPositionRight || DEFAULT.buttonPositionRight) + 'px',
                buttonText: this.prop.buttonText || DEFAULT.buttonText,
                buttonTextFontFamily: this.prop.buttonTextFontFamily || DEFAULT.buttonTextFontFamily,
            });

            this.div.innerHTML = buildTemplate.call(this, _templates.holder, {overlayBox: overlayBox, ulWrapper: ulWrapper}); 

            // Handle Scrollbars
            var feedEntriesWidth = parseInt(window.getComputedStyle(this.div.querySelector('ul')).width);
            if(feedEntriesWidth === this.div.clientWidth) { // When scrollbar fades in and fades out as an overlay
                var hasVerticalScrollbar = this.div.querySelector('ul').clientHeight >= this.div.clientHeight; 
                if (hasVerticalScrollbar) {
                    this.div.querySelector('#overlayBox').style.right = '10px';
                }
            } else { // When scrollbar is always visible
                var scrollbarWidth =  this.div.clientWidth - feedEntriesWidth;
                this.div.querySelector('#overlayBox').style.right = scrollbarWidth + 'px';
            }

            // Apply clickthroughs
            var liTags = this.div.querySelectorAll('li');
            for(var i=0; i<liTags.length; i++) {
                liTags[i].addEventListener('click', function(event) {
                    event.preventDefault();
                    if(event.target.tagName === 'A') {
                        this.client.clickThrough('FacebookFeedClicked', event.target.href);
                    } else {
                        this.client.clickThrough('FacebookFeedClicked', event.currentTarget.getAttribute('data-fbpost')); //IE 9
                    }
                }.bind(this));
            }

            this.div.querySelector('#fbook-page').addEventListener('click', function(event) {
                event.preventDefault();
                this.client.clickThrough('FacebookFeedClicked', event.currentTarget.href);
            }.bind(this));
        }

        function hexToRgb(hex) {
            var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            result = result ? result : /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(DEFAULT.overlayColor);
            return {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            };
        }

        function fetchFeedData(url, callback) {
                require([url+'&callback=define'], function(data){
                    if (data && data.data instanceof Array) {
                        callback.call(this, data.data);
                    } else if (data && data.error) {
                        console.log('facebook-feed: request failed - ' + data.error.message);
                    } else {
                        console.log('facebook-feed: request failed');
                    }
                }.bind(this));
        }

        return FacebookFeedComp;
    }
);
