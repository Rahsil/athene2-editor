/**
 * Wrapper for the html5 version of geogebra (http://geogebra.org)
 * This plugin does some dirty things,
 * since geogebra does not fit in the standards..
 **/

/*global define,ggbApplet*/
define([
    'jquery',
    'underscore',
    'common',
    'system_notification',
    'texteditor_plugin',
    'translator',
    'text!./editor/templates/plugins/reference/reference_plugin_geogebra.html',
    'loadimage',
    'fileupload',
    'fileupload_iframetransport'
    ],
    function ($, _, Common, SystemNotification, EditorPlugin, t, plugin_template) {
        "use strict";
        var GeogebraReferencePlugin,
            titleRegexp,
            hrefRegexp,
            geogebraScriptSource;

        titleRegexp = new RegExp(/\[[^\]]*\]\(/);
        hrefRegexp =  new RegExp(/\([^\)]*\)/);

        geogebraScriptSource = 'http://www.geogebra.org/web/4.4/web/web.nocache.js';

        // cruel helper function that
        // checks for 20seconds if the
        // global ggbApplet variable
        // is available. geogebra does not
        // seem to have a 'ready' event..
        function waitForGgbApplet(fn) {
            var threshold = 0,
                timeout = setInterval(function () {
                    threshold += 100;
                    if (typeof ggbApplet !== 'undefined') {
                        clearTimeout(timeout);
                        fn();
                    }
                    if (threshold >= 20000) {
                        clearTimeout(timeout);
                        fn(new Error('Could not initialize Geogebra'));
                    }
                }, 100);
        }

        GeogebraReferencePlugin = function (fileuploadOptions) {
            this.state = 'geogebra-reference';

            this.init(fileuploadOptions);
        };

        GeogebraReferencePlugin.prototype = new EditorPlugin();
        GeogebraReferencePlugin.prototype.constructor = GeogebraReferencePlugin;

        GeogebraReferencePlugin.prototype.init = function (fileuploadOptions) {

            this.template = _.template(plugin_template);

            this.data = {};
            this.data.name = 'Geogebra';
            this.fileuploadOptions = fileuploadOptions || {};
        };

        GeogebraReferencePlugin.prototype.activate = function (token, data) {
            var that = this,
                title,
                href;

            that.data.info = data || {};

            that.data.content = token.string;
            title = _.first(that.data.content.match(titleRegexp));
            that.data.title = title.substr(1, title.length - 3);

            href = _.first(that.data.content.match(hrefRegexp));
            that.data.href = href.substr(1, href.length - 2);

            that.$el = $(that.template(that.data));

            that.$el.on('click', '.btn-save', function () {
                that.save($(this).hasClass('save-as-image'));
            });

            that.$el.on('click', '.btn-cancel', function (e) {
                e.preventDefault();
                that.trigger('close');
                return;
            });

            // that.$upload = $('#fileupload', that.$el);
            // that.$uploadInput = $('input', that.$upload);
            // that.$upload.fileupload(_.extend({}, that.fileuploadOptions, {
            //     add: function () {
            //         console.log(arguments);
            //     }
            // }));

            require([geogebraScriptSource], function () {
                // geogebra related stuff.
                if (typeof web !== 'function') {
                    SystemNotification.notify(t('Geogebra plugin could not be loaded, please try again.'));
                }

                function doneWaitingForGgbApplet(error) {
                    if (error) {
                        SystemNotification.notify(t('Geogebra plugin could not be loaded, please try again.'));
                    } else {
                        /// VERY BAD!!
                        /// Have to wait for Geogebra to initialize
                        /// and I couldnt find a callback or event
                        /// for that...... sorry!
                        setTimeout(function () {
                            if (that.data.info.xml) {
                                ggbApplet.setXML(that.data.info.xml);
                            }

                            ggbApplet.startEditing();
                        }, 2000);
                    }
                }

                if (typeof ggbApplet === 'object') {
                    web();
                    doneWaitingForGgbApplet();
                } else {
                    waitForGgbApplet(doneWaitingForGgbApplet);
                }
            });
        };

        GeogebraReferencePlugin.prototype.save = function (asImage) {
            var that = this,
                context,
                imageData,
                formData,
                xml = ggbApplet.getXML();


            function uploadFile(formData, url) {
                return $.ajax({
                    url: url || "/attachment/upload",
                    type: "POST",
                    data: formData,
                    processData: false,
                    contentType: false
                }).error(Common.genericError);
            }

            function proceedSave (attachment) {
                var href = (asImage ? _.last(attachment.files) : _.first(attachment.files)).location;
                $('.href', that.$el).val(href);

                that.data.content = '>[' + $('.title', that.$el).val() + '](' + href + ')';
                that.trigger('save', that);
            }

            // Prepare XML File Upload
            // this.$upload.fileupload('add', xml);
            formData = that.createUploadFormData(xml, 'application/xml', 'geogebra.xml');

            uploadFile(formData)
                .success(function (attachment) {
                    if (asImage) {
                        // Prepare Image File Upload
                        context = ggbApplet.getContext2D();
                        imageData = context.canvas.toDataURL('image/jpeg');
                        imageData = atob(imageData.split(',')[1]);
                        formData = that.createUploadFormData(imageData, 'image/jpeg', 'geogebra.jpg');

                        // Append image to newly created attachment
                        uploadFile(formData, '/attachment/upload/' + attachment.id)
                            .success(function (attachment) {
                                proceedSave(attachment);
                            });
                    } else {
                        proceedSave(attachment);
                    }
                });

            // if (asImage) {
            //     // Generate image
            //     context = ggbApplet.getContext2D();
            //     imageData = context.canvas.toDataURL('image/jpeg');

            //     this.showImagePreview(imageData);

            // } else {
                
            // }

            // console.log(xml);

            // this.data.content = '>[' + $('.title', this.$el).val() + '](' + $('.href', this.$el).val() + ')';
            // this.trigger('save', this);
        };

        GeogebraReferencePlugin.prototype.createUploadFormData = function (data, type, filename) {
            var array = [],
                file,
                formdata;

            for (var i = 0; i < data.length; i++) {
                array.push(data.charCodeAt(i));
            }

            file = new Blob([new Uint8Array(array)], {
                type: type
            });

            formdata = new FormData();
            formdata.append("file", file, filename);

            return formdata;
        };

        EditorPlugin.GeogebraReference = GeogebraReferencePlugin;
    }
);