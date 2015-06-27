/**
 * MLJLib
 * MeshLabJS Library
 * 
 * Copyright(C) 2015
 * Paolo Cignoni 
 * Visual Computing Lab
 * ISTI - CNR
 * 
 * All rights reserved.
 *
 * This program is free software; you can redistribute it and/or modify it under 
 * the terms of the GNU General Public License as published by the Free Software 
 * Foundation; either version 2 of the License, or (at your option) any later 
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT 
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS 
 * FOR A PARTICULAR PURPOSE. See theGNU General Public License 
 * (http://www.gnu.org/licenses/gpl.txt) for more details.
 * 
 */

/**
 * @file Defines the functions to manage the scene
 * @author Stefano Gabriele
 */

/**
 * MLJ.core.Scene namespace
 * @namespace MLJ.core.Scene
 * @memberOf MLJ.core
 * @author Stefano Gabriele
 */
MLJ.core.Scene = {};

(function () {

    //Contains all mesh in the scene
    var _layers = new MLJ.util.AssociativeArray();

    //Reference to selected layer (type MeshFile)
    var _selectedLayer;

    var _scene, _camera, _renderer;
    var _this = this;

    function get3DSize() {
        var _3D = $('#_3D');

        return {
            width: _3D.width(),
            height: _3D.height()
        };
    }

    function initDragAndDrop() {
        function FileDragHandler(e) {
            e.stopPropagation();
            e.preventDefault();
            var files = e.target.files || e.dataTransfer.files;
            MLJ.core.File.openMeshFile(files);
        }

        function FileDragHover(e) {
            e.stopPropagation();
            e.preventDefault();
        }

        $(window).ready(function () {
            var ddd = document.getElementById("_3D");
            ddd.addEventListener("dragover", FileDragHover, false);
            ddd.addEventListener("dragleave", FileDragHover, false);
            ddd.addEventListener("drop", FileDragHandler, false);
        });
    }

//SCENE INITIALIZATION  ________________________________________________________

    function initScene() {
        var _3DSize = get3DSize();

        _scene = new THREE.Scene();
        _camera = new THREE.PerspectiveCamera(45, _3DSize.width / _3DSize.height, 0.1, 1800);
        _camera.position.z = 15;
        _renderer = new THREE.WebGLRenderer({alpha: true});
        _renderer.shadowMapEnabled = true;
        _renderer.setSize(_3DSize.width, _3DSize.height);
        $('#_3D').append(_renderer.domElement);
        _scene.add(_camera);

        //INIT CONTROLS
        var container = document.getElementsByTagName('canvas')[0];
        var controls = new THREE.TrackballControls(_camera, container);
        controls.rotateSpeed = 4.0;
        controls.zoomSpeed = 1.2;
        controls.panSpeed = 2.0;
        controls.noZoom = false;
        controls.noPan = false;
        controls.staticMoving = true;
        controls.dynamicDampingFactor = 0.3;
        controls.keys = [65, 83, 68];

        //INIT LIGHTS 
        _this.lights.AmbientLight = new MLJ.core.AmbientLight(_scene, _camera, _renderer);
        _this.lights.Headlight = new MLJ.core.Headlight(_scene, _camera, _renderer);

        //EVENT HANDLERS
        $('canvas')[0].addEventListener('touchmove', controls.update.bind(controls), false);
        $('canvas')[0].addEventListener('mousemove', controls.update.bind(controls), false);
        $('canvas')[0].addEventListener('mousewheel', function () {
            controls.update();
            return false;
        }, false);

        controls.addEventListener('change', function () {
            MLJ.core.Scene.render();
        });

        $(window).resize(function () {
            var size = get3DSize();

            _camera.aspect = size.width / size.height;
            _camera.updateProjectionMatrix();
            _renderer.setSize(size.width, size.height);

            MLJ.core.Scene.render();
        });

        $(document).on("MeshFileOpened",
                function (event, meshFile) {
                    MLJ.core.Scene.addLayer(meshFile);
                });

        $(document).on("MeshFileReloaded",
                function (event, meshFile) {
                    MLJ.core.Scene.reloadLayer(meshFile);
                    /**
                     *  Triggered when a layer is updated
                     *  @event MLJ.core.Scene#SceneLayerUpdated
                     *  @type {Object}
                     *  @property {MLJ.core.MeshFile} meshFile The updated mesh file
                     *  @example
                     *  <caption>Event Interception:</caption>
                     *  $(document).on("SceneLayerUpdated",
                     *      function (event, meshFile) {
                     *          //do something
                     *      }
                     *  );
                     */
                    $(document).trigger("SceneLayerUpdated", [meshFile]);
                });

//        $(document).on(MLJ.events.Scene.SELECT_LAYER,
//                function (event, layerName) {
//                    _selectedLayer = _layers.getByKey(layerName);
//                    /**
//                     *  Triggered when a layer is selected
//                     *  @event MLJ.core.Scene#SceneLayerSelected
//                     *  @type {Object}
//                     *  @property {MLJ.core.MeshFile} meshFile The selected mesh file
//                     *  @example
//                     *  <caption>Event Interception:</caption>
//                     *  $(document).on("SceneLayerSelected",
//                     *      function (event, meshFile) {
//                     *          //do something
//                     *      }
//                     *  );
//                     */
//                    $(document).trigger("SceneLayerSelected", [_selectedLayer]);
//                });
    }

    function computeGlobalBBbox() {
        var iter = _layers.iterator();

        var threeMesh;
        while (iter.hasNext()) {
            threeMesh = iter.next().getThreeMesh();
            if (threeMesh.scaleFactor) {
                threeMesh.position.x -= threeMesh.offsetVec.x;
                threeMesh.position.y -= threeMesh.offsetVec.y;
                threeMesh.position.z -= threeMesh.offsetVec.z;
                var scaling = threeMesh.scaleFactor;
                threeMesh.scale.multiplyScalar(1 / scaling);
            }
        }

        var BBGlobal = new THREE.Box3();
        iter = _layers.iterator();
        while (iter.hasNext()) {
            threeMesh = iter.next().getThreeMesh();
            var bbox = new THREE.Box3().setFromObject(threeMesh);
            BBGlobal.union(bbox);
        }

        iter = _layers.iterator();
        while (iter.hasNext()) {
            threeMesh = iter.next().getThreeMesh();
            var scaleFac = 15.0 / (BBGlobal.min.distanceTo(BBGlobal.max));
            threeMesh.scale.multiplyScalar(scaleFac);
            threeMesh.scaleFactor = scaleFac;
        }

        BBGlobal = new THREE.Box3();
        iter = _layers.iterator();
        while (iter.hasNext()) {
            threeMesh = iter.next().getThreeMesh();
            var bbox = new THREE.Box3().setFromObject(threeMesh);
            BBGlobal.union(bbox);
        }

        iter = _layers.iterator();
        while (iter.hasNext()) {
            threeMesh = iter.next().getThreeMesh();
            var offset = new THREE.Vector3();
            offset = BBGlobal.center().negate();
            threeMesh.position.x += offset.x;
            threeMesh.position.y += offset.y;
            threeMesh.position.z += offset.z;
            threeMesh.offsetVec = offset;
        }

    }

    this.lights = {
        AmbientLight: null,
        Headlight: null
    };

    this.selectLayerByName = function (layerName) {      
            _selectedLayer = _layers.getByKey(layerName);
            /**
             *  Triggered when a layer is selected
             *  @event MLJ.core.Scene#SceneLayerSelected
             *  @type {Object}
             *  @property {MLJ.core.MeshFile} meshFile The selected mesh file
             *  @example
             *  <caption>Event Interception:</caption>
             *  $(document).on("SceneLayerSelected",
             *      function (event, meshFile) {
             *          //do something
             *      }
             *  );
             */
            $(document).trigger("SceneLayerSelected", [_selectedLayer]);
    };
    

    this.setLayerVisible = function (layerName, visible) {
        var layer = _layers.getByKey(layerName);
        layer.getThreeMesh().visible = visible;
        MLJ.core.Scene.render();
    };

    this.reloadLayer = function (meshFile) {
        MLJ.core.Scene.removeLayerByName(meshFile.name);
        MLJ.core.Scene.addLayer(meshFile, true);
    };

    this.addLayer = function (meshFile, reloaded) {
        if (meshFile instanceof MLJ.core.MeshFile) {

            //Add new mesh to associative array _layers            
            _layers.set(meshFile.name, meshFile);

            if (meshFile.cpp === true) {
                meshFile.updateThreeMesh();
            }

            //Set mesh position
            var mesh = meshFile.getThreeMesh();
            var box = new THREE.Box3().setFromObject(mesh);
            mesh.position = box.center();
            _scene.add(mesh);

            _selectedLayer = meshFile;

            //Compute the global bounding box
            computeGlobalBBbox();

            //render the scene
            this.render();

            if (!reloaded) {
                /**
                 *  Triggered when a layer is added
                 *  @event MLJ.core.Scene#SceneLayerAdded
                 *  @type {Object}
                 *  @property {MLJ.core.MeshFile} meshFile The last mesh file added
                 *  @property {Integer} layersNumber The number of layers in the scene
                 *  @example
                 *  <caption>Event Interception:</caption>
                 *  $(document).on("SceneLayerSelected",
                 *      function (event, meshFile, layersNumber) {
                 *          //do something
                 *      }
                 *  );
                 */
                $(document).trigger("SceneLayerAdded", [meshFile, _layers.size()]);
            }

        } else {
            console.error("The parameter must be an instance of MLJ.core.MeshFile");
        }
    };

    this.updateLayer = function (meshFile) {
        if (meshFile instanceof MLJ.core.MeshFile) {

            if (_layers.getByKey(meshFile.name) === undefined) {
                console.warn("Trying to update a mesh not in the scene.");
                return;
            }

            meshFile.updateThreeMesh();

            //render the scene
            this.render();

            //Trigger event
            $(document).trigger("SceneLayerUpdated", [meshFile]);

        } else {
            console.error("The parameter must be an instance of MLJ.core.MeshFile");
        }
    };

    this.getLayerByName = function (name) {
        return _layers.getByKey(name);
    };

    this.removeLayerByName = function (name) {
        var meshFile = this.getLayerByName(name);

        if (meshFile !== undefined) {
            _layers.remove(name);

            _scene.remove(meshFile.getThreeMesh());
            meshFile.dispose();
        }
    };

    this.getSelectedLayer = function () {
        return _selectedLayer;
    };

    this.getLayers = function () {
        return _layers;
    };

    this.render = function () {
        _renderer.render(_scene, _camera);
    };

    $(window).ready(function () {
        initScene();
        initDragAndDrop();
    });

}).call(MLJ.core.Scene);
