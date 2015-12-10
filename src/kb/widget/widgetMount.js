/*global
 define, console, window
 */
/*jslint
 browser: true,
 white: true
 */
define([
    'bluebird',
    'kb/common/dom',
    'kb/common/html'
],
    function (Promise, dom, html) {
        'use strict';
        function factory(config) {
            var mounted, container, mountedWidget, runtime;

            mounted = config.node;
            if (!mounted) {
                throw new Error('Cannot create widget mount without a parent node. Pass it as "node"');
            }
            runtime = config.runtime;
            if (!runtime) {
                throw new Error('The widget mounter needs a runtime object in order to find and mount widgets.');
            }
            container = dom.createElement('div');
            container = mounted.appendChild(container);
            container.id = html.genId();

            function unmount() {
                return Promise.try(function () {
                    if (mountedWidget) {
                        var widget = mountedWidget.widget;
                        return Promise.try(function () {
                            return widget.stop && widget.stop();
                        })
                            .then(function () {
                                return widget.detach && widget.detach();
                            })
                            .then(function () {
                                return widget.destroy && widget.destroy();
                            });
                    } else {
                        // ignore
                        return null;
                    }
                });
            }
            function mount(widgetId, params) {
                return Promise.try(function () {
                    return runtime.getService('widget').makeWidget(widgetId, {});
                })
                    .then(function (widget) {
                        if (widget === undefined) {
                            throw new Error('Widget could not be created: ' + widgetId);
                        }
                        mountedWidget = {
                            id: html.genId(),
                            widget: widget,
                            container: null,
                            state: 'created'
                        };
                        return [widget, widget.init && widget.init()];
                    })
                    .spread(function (widget) {
                        var c = dom.createElement('div');
                        c.id = mountedWidget.id;
                        container.innerHTML = '';
                        dom.append(container, c);
                        mountedWidget.container = c;
                        return [widget, widget.attach && widget.attach(c)];
                    })
                    .spread(function (widget) {
                        return [widget, widget.start && widget.start(params)];
                    })
                    .spread(function (widget) {
                        return widget.run && widget.run(params);
                    });
            }
            function mountWidget(widgetId, params) {
                // stop the old one
                // Stop and unmount current widget.
                return Promise.try(function () {
                    if (mountedWidget) {
                        var widget = mountedWidget.widget;
                        return Promise.try(function () {
                            return widget.stop && widget.stop();
                        })
                            .then(function () {
                                return widget.detach && widget.detach();
                            })
                            .then(function () {
                                return widget.destroy && widget.destroy();
                            });
                    }
                })
                    .then(function () {
                        // return runtime.ask('widgetManager', 'makeWidget', widgetId);
                        return runtime.getService('widget').makeWidget(widgetId, {});
                    })
                    .then(function (widget) {
                        if (widget === undefined) {
                            throw new Error('Widget could not be created: ' + widgetId);
                        }
                        mountedWidget = {
                            id: html.genId(),
                            widget: widget,
                            container: null,
                            state: 'created'
                        };
                        return [widget, widget.init && widget.init()];
                    })
                    .spread(function (widget) {
                        var c = dom.createElement('div');
                        c.id = mountedWidget.id;
                        container.innerHTML = '';
                        dom.append(container, c);
                        mountedWidget.container = c;
                        return [widget, widget.attach && widget.attach(c)];
                    })
                    .spread(function (widget) {
                        return [widget, widget.start && widget.start(params)];
                    })
                    .spread(function (widget) {
                        return widget.run && widget.run(params);
                    });
            }
            return {
                mountWidget: mountWidget,
                mount: mount,
                unmount: unmount
            };
        }
        return {
            make: function (config) {
                return factory(config);
            }
        };
    });