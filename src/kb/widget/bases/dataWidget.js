/*global define */
/*jslint white: true, browser: true */
define([
    'bluebird',
    'underscore',
    'kb_common_dom',
    'kb_common_state',
    'kb_common_html',
    'kb_common_domEvent'
],
    function (Promise, _, dom, State, html, domEventFactory) {
        'use strict';

        function makeWidget(config) {
            var mount, container, hooks = [], listeners = [],
                state = State.make(),
                runtime = config.runtime,
                internalApi = {}, externalApi = {},
                domEvent = domEventFactory.make(),
                params = State.make(),
                paramDefaults = config.defaults,
                places = {};

            if (!runtime) {
                throw {
                    type: 'ArgumentError',
                    reason: 'RuntimeMissing',
                    blame: 'dataWidget',
                    message: 'The runtime argument was not provided'
                };
            }

            // The hooks for widget objects.
            function addHook(name, fun) {
                if (!hooks.hasOwnProperty(name)) {
                    hooks[name] = [];
                }
                hooks[name].push(fun);
            }
            function hook(name, fun) {
                if (_.isArray(name)) {
                    name.forEach(function (hookDef) {
                        addHook(hookDef[0], hookDef[1]);
                    });
                } else {
                    addHook(name, fun);
                }
            }
            function hasHook(name) {
                if (hooks.hasOwnProperty(name)) {
                    return true;
                }
                return false;
            }
            function getHook(name) {
                if (hasHook(name)) {
                    return hooks[name];
                }
                return [];
            }

            // CONFIG
            function getConfig(prop, defaultValue) {
                return runtime.getConfig(prop, defaultValue);
            }
            function hasConfig(prop) {
                return runtime.hasConfig(prop);
            }

            // STATE
            // 
            // Interacting with state
            function setState(prop, value) {
                state.set(prop, value);
            }
            function getState(prop, defaultValue) {
                return state.get(prop, defaultValue);
            }
            function hasState(prop) {
                return state.has(prop);
            }
            
            // Just params
            function setParam(prop, value) {
                params.set(prop, value);
            }
            function getParam(prop, defaultValue) {
                return params.get(prop, defaultValue || paramDefaults[prop]);
            }
            function hasParam(prop) {
                return params.has(prop);
            }
            
            // Direct interaction with DOM, discouraged, but sometimes necessary.
            function getDomNode() {
                return container;
            }
            

            // EVENTS
            function recv(channel, message, handler) {
                listeners.push(runtime.recv(channel, message, handler));
            }
            function send(channel, message, data) {
                runtime.send(channel, message, data);
            }

            // DOM EVENTS
            function addDomEvent(type, handler, id, data) {
                return domEvent.addEvent(type, handler, id, data);
            }
            function attachDomEvent(type, handler, selector, data) {
                return domEvent.attachEvent(type, handler, selector, data);
            }
            function attachDomEvents() {
                domEvent.attachEvents();
            }
            function detachDomEvents() {
                domEvent.detachEvents();
            }

            // Object construction setup

            if (config && config.on) {
                Object.keys(config.on).forEach(function (hookName) {
                    addHook(hookName, config.on[hookName]);
                });
            }

            if (config && config.events) {
                config.events.forEach(function (event) {
                    attachDomEvent(event);
                });
            }


            // INTERNAL API

            internalApi = Object.freeze({
                recv: recv,
                send: send,
                getConfig: getConfig,
                hasConfig: hasConfig,
                
                getState: getState,
                setState: setState,
                hasState: hasState,
                
                getParam: getParam,
                setParam: setParam,
                hasParam: hasParam,
                
                getPlace: getPlace,
                
                getDomNode: getDomNode,
                get: getState,
                set: setState,
                addDomEvent: addDomEvent,
                attachDomEvent: attachDomEvent,
                setTitle: setTitle,
                runtime: runtime
            });


            // RENDERING

            function render() {
                return Promise.try(function () {
                    if (!state.isDirty()) {
                        return;
                    }
                    state.setClean();
                    // For now we assume that rendering blows away dom events
                    // and re-initializes them.
                    // Let us get more subtle later.
                    detachDomEvents();
                    var renderHooks = getHook('render');
                    if (renderHooks.length > 1) {
                        throw {
                            type: 'HookError',
                            reason: 'TooManyHooks',
                            message: 'The render hook only supports 0 or 1 hooks'
                        };
                    } else if (renderHooks.length === 0) {
                        return;
                    }
                    return Promise.try(function () {
                        return renderHooks[0].call(internalApi)
                    })
                        .then(function (results) {
                            if (results) {
                                if (typeof results === 'object') {
                                    if (results.content) {
                                        setContent('body', results.content);
                                    }
                                    if (results.after) {
                                        try {
                                            results.after.call(internalApi);
                                        } catch (ex) {
                                            console.log('Error running "after" method for render');
                                            console.log(ex);
                                            setContent('error', 'Error running "after" method for render');
                                        }
                                    }
                                } else {
                                    setContent('body', results);
                                }
                            }
                        })
                        .then(function () {
                            attachDomEvents();
                        });
                });
            }

            // Data
            function addErrorMessage(errorObject) {
                console.log('ERROR');
                console.log(errorObject);
            }

            // invokes an arbitrary set of data fetch hooks, each of which sets
            // a property on the observed object in order to invoke
            function fetchData(params) {
                return Promise.try(function () {
                    if (hasHook('fetch')) {
                        var promises = getHook('fetch').map(function (fun) {
                            return Promise.try(function () {
                                return fun.call(internalApi, params);
                            });
                        });
                        return Promise.all(promises)
                            .then(function (results) {
                                results.forEach(function (result) {
                                    if (result) {
                                        setState(result.name, result.value);
                                    }
                                })
                            });
                    }
                });
            }

            function buildLayout() {
                var div = html.tag('div'),
                    span = html.tag('span'),
                    id = html.genId(),
                    content = div({id: id, class: 'panel panel-default'}, [
                        div({class: 'panel-heading'}, [
                            span({class: 'panel-title', dataElement: 'title'})
                        ]),
                        div({class: 'panel-body'}, [
                            div({dataElement: 'body'}),
                            div({dataElement: 'error'})
                        ])
                    ]);
                return {
                    id: id,
                    content: content
                };
            }
            function buildCollapseLayout(config) {
                var div = html.tag('div'),
                    span = html.tag('span'),
                    id = html.genId(),
                    headingId = html.genId(),
                    collapseId = html.genId(),
                    content = div({id: id, class: 'panel panel-default'}, [
                        div({id: headingId, class: 'panel-heading'}, [
                            span({class: 'panel-title'}, [
                                span({class: (config.collapsed ? 'collapsed' : ''),
                                    style: {cursor: 'pointer'}, ariaControls: collapseId,
                                    ariaExpanded: (config.collapsed ? 'false' : 'true'),
                                    dataTarget: '#' + collapseId,
                                    dataToggle: 'collapse', dataElement: 'title'})
                            ])
                        ]),
                        div({id: collapseId, class: 'panel-collapse collapse in',
                            areaLabelledby: headingId}, [
                            div({class: 'panel-body'}, [
                                div({dataElement: 'body'}),
                                div({dataElement: 'error'})
                            ])
                        ])
                    ]);
                return {
                    id: id,
                    content: content
                };
            }
            // var layout = buildCollapseLayout({collapsed: false});
            var layout;
            function getLayout() {
                if (!layout) {
                    layout = buildLayout();
                }
                return layout;
            }

            function setContent(element, content) {
                var node = container.querySelector('[data-element="' + element + '"]');
                if (node) {
                    node.innerHTML = content;
                }
            }
            function setTitle(content) {
                var node = container.querySelector('[data-element="title"]');
                if (node) {
                    node.innerHTML = content;
                }
            }
            function getNode(element) {
                return container.querySelector('[data-element="' + element + '"]');
            }
            
            // Places
            function getPlace(name) {
                return places[name];
            }

            // The Interface

            function init(config) {
                return Promise.try(function () {
                    if (hasHook('init')) {
                        var promises = getHook('init').map(function (fun) {
                            return Promise.try(function () {
                                return fun.call(internalApi, config);
                            });

                        });
                        return Promise.all(promises);
                    }
                });
            }
            function attach(node) {
                return Promise.try(function () {
                    mount = node;
                    container = dom.append(mount, dom.createElement('div'));
                    container.innerHTML = getLayout().content;
                    if (hasHook('attach')) {
                        var promises = getHook('attach').map(function (fun) {
                            return Promise.try(function () {
                                return fun.call(internalApi, container);
                            });
                        });
                        return Promise.all(promises)
                            .then(function () {
                                attachDomEvents();
                            });
                    } else if (hasHook('layout')) {
                        var layout = getHook('layout')[0];
                        return Promise.try(function () {
                            return layout.call(internalApi);
                        })
                        .then(function (result) {
                            setContent('body', result.content);                        
                            Object.keys(result.places).forEach(function (name) {
                                var place = result.places[name],
                                    node;
                                if (place.id) {
                                    place.node = document.getElementById(place.id);                                    
                                }
                                places[name] = place;
                            });
                        });
                    }
                });
            }
            function start(params) {
                return Promise.try(function () {
                    // Start the heartbeat listener, which presently just 
                    // renders.

                    if (config.title) {
                        setTitle(config.title);
                    }

                    listeners.push(runtime.recv('app', 'heartbeat', function () {
                        render()
                            .then(function () {
                                // what here?
                            })
                            .catch(function (err) {
                                // handle render error
                                console.log('ERROR');
                                console.log(err);
                            });
                    }));
                    return Promise.try(function () {
                        var promises = [];
                        if (hasHook('initialContent')) {
                            getHook('initialContent').forEach(function (fun) {
                                promises.push(
                                    Promise.try(function () {
                                        return fun.call(internalApi, params);
                                    })
                                    .then(function (data) {
                                        setContent('body', data);
                                    }));
                            });
                        }
                        if (hasHook('start')) {
                            getHook('start').forEach(function (fun) {
                                promises.push(Promise.try(function () {
                                    return fun.call(internalApi, params);
                                }));
                            });
                        }
                        return promises;
                    })
                        .each(function (item, index, value) {
                            // what to do? Check value for error and log it.
                        });
                });
            }
            function run(params) {
                return Promise.try(function () {
                    setState('params', params);
                    return fetchData(params);
                });
            }
            function stop() {
                return Promise.try(function () {
                    if (hasHook('stop')) {
                        var promises = getHook('stop').map(function (fun) {
                            return Promise.try(function () {
                                fun.call(internalApi);
                            });
                        });
                        return Promise.all(promises);
                    }
                });
            }
            function detach() {
                return Promise.try(function () {
                    if (mount) {
                        mount.removeChild(container);
                    }
                    container = null;
                    mount = null;
                    if (hasHook('detach')) {
                        var promises = getHook('detach').map(function (fun) {
                            return Promise.try(function () {
                                return fun.call(internalApi);
                            });
                        });
                        return Promise.all(promises)
                            .then(function () {
                                detachDomEvents();
                            });
                    }
                });
            }
            function destroy() {
                return Promise.try(function () {
                    if (hasHook('destroy')) {
                        var promises = getHook('destroy').map(function (fun) {
                            return Promise.try(function () {
                                return fun.call(internalApi);
                            });
                        });
                        return Promise.all(promises);
                    }
                });
            }

            return Object.freeze({
                // Widget Interface
                on: hook,
                // Lifecycle Interface
                init: init,
                attach: attach,
                start: start,
                run: run,
                stop: stop,
                detach: detach,
                destroy: destroy
            });
        }

        return Object.freeze({
            make: function (config) {
                return makeWidget(config);
            }
        });
    });