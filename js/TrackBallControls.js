/**
 * @author Eberhard Graether / http://egraether.com/
 * @author Mark Lundin 	/ http://mark-lundin.com
 * @author Simone Manini / http://daron1337.github.io
 * @author Luca Antiga 	/ http://lantiga.github.io
 */
var keyPressNum=0,textWrite;

THREE.TrackballControls = function ( object, domElement ) {

	var _this = this;
	var STATE = { NONE: -1, ROTATE: 0, ZOOM: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_ZOOM_PAN: 4 };

	this.object = object;
	this.domElement = ( domElement !== undefined ) ? domElement : document;

	// API

	this.enabled = true;

	this.screen = { left: 0, top: 0, width: 0, height: 0 };

	this.rotateSpeed = 1.0;
	this.zoomSpeed = 1.2;
	this.panSpeed = 0.3;

	this.noRotate = false;
	this.noZoom = false;
	this.noPan = false;

	this.staticMoving = false;
	this.dynamicDampingFactor = 0.2;

	this.minDistance = 0;
	this.maxDistance = Infinity;

	this.keys = [ 65 /*A*/,  67, /*c*/,83 /*S*/, 68 /*D*/ ];

	// internals

	this.target = new THREE.Vector3();

	var EPS = 0.000001;

	var lastPosition = new THREE.Vector3();

	var _state = STATE.NONE,
	_prevState = STATE.NONE,

	_eye = new THREE.Vector3(),

	_movePrev = new THREE.Vector2(),
	_moveCurr = new THREE.Vector2(),

	_lastAxis = new THREE.Vector3(),
	_lastAngle = 0,

	_zoomStart = new THREE.Vector2(),
	_zoomEnd = new THREE.Vector2(),

	_touchZoomDistanceStart = 0,
	_touchZoomDistanceEnd = 0,

	_panStart = new THREE.Vector2(),
	_panEnd = new THREE.Vector2();

	// for reset

	this.target0 = this.target.clone();
	this.position0 = this.object.position.clone();
	this.up0 = this.object.up.clone();

	// events

	var changeEvent = { type: 'change' };
	var startEvent = { type: 'start' };
	var endEvent = { type: 'end' };


	// methods

	this.handleResize = function () {

		if ( this.domElement === document ) {

			this.screen.left = 0;
			this.screen.top = 0;
			this.screen.width = window.innerWidth;
			this.screen.height = window.innerHeight;

		} else {

			var box = this.domElement.getBoundingClientRect();
			// adjustments come from similar code in the jquery offset() function
			var d = this.domElement.ownerDocument.documentElement;
			this.screen.left = box.left + window.pageXOffset - d.clientLeft;
			this.screen.top = box.top + window.pageYOffset - d.clientTop;
			this.screen.width = box.width;
			this.screen.height = box.height;

		}

	};

	this.handleEvent = function ( event ) {

		if ( typeof this[ event.type ] == 'function' ) {

			this[ event.type ]( event );

		}

	};

	var getMouseOnScreen = ( function () {

		var vector = new THREE.Vector2();

		return function ( pageX, pageY ) {

			vector.set(
				( pageX - _this.screen.left ) / _this.screen.width,
				( pageY - _this.screen.top ) / _this.screen.height
			);

			return vector;

		};

	}() );

	var getMouseOnCircle = ( function () {

		var vector = new THREE.Vector2();

		return function ( pageX, pageY ) {

			vector.set(
				( ( pageX - _this.screen.width * 0.5 - _this.screen.left ) / ( _this.screen.width * 0.5 ) ),
				( ( _this.screen.height + 2 * ( _this.screen.top - pageY ) ) / _this.screen.width ) // screen.width intentional
			);

			return vector;
		};

	}() );

	this.rotateCamera = (function() {

		var axis = new THREE.Vector3(),
			quaternion = new THREE.Quaternion(),
			eyeDirection = new THREE.Vector3(),
			objectUpDirection = new THREE.Vector3(),
			objectSidewaysDirection = new THREE.Vector3(),
			moveDirection = new THREE.Vector3(),
			angle;

		return function () {

			moveDirection.set( _moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0 );
			angle = moveDirection.length();

			if ( angle ) {

				_eye.copy( _this.object.position ).sub( _this.target );

				eyeDirection.copy( _eye ).normalize();
				objectUpDirection.copy( _this.object.up ).normalize();
				objectSidewaysDirection.crossVectors( objectUpDirection, eyeDirection ).normalize();

				objectUpDirection.setLength( _moveCurr.y - _movePrev.y );
				objectSidewaysDirection.setLength( _moveCurr.x - _movePrev.x );

				moveDirection.copy( objectUpDirection.add( objectSidewaysDirection ) );

				axis.crossVectors( moveDirection, _eye ).normalize();

				angle *= _this.rotateSpeed;
				quaternion.setFromAxisAngle( axis, angle );

				_eye.applyQuaternion( quaternion );
				_this.object.up.applyQuaternion( quaternion );

				_lastAxis.copy( axis );
				_lastAngle = angle;

			}

			else if ( !_this.staticMoving && _lastAngle ) {

				_lastAngle *= Math.sqrt( 1.0 - _this.dynamicDampingFactor );
				_eye.copy( _this.object.position ).sub( _this.target );
				quaternion.setFromAxisAngle( _lastAxis, _lastAngle );
				_eye.applyQuaternion( quaternion );
				_this.object.up.applyQuaternion( quaternion );

			}

			_movePrev.copy( _moveCurr );

		};

	}());


	this.zoomCamera = function () {

		var factor;

		if ( _state === STATE.TOUCH_ZOOM_PAN ) {

			factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
			_touchZoomDistanceStart = _touchZoomDistanceEnd;
			_eye.multiplyScalar( factor );

		} else {

			factor = 1.0 + ( _zoomEnd.y - _zoomStart.y ) * _this.zoomSpeed;

			if ( factor !== 1.0 && factor > 0.0 ) {

				_eye.multiplyScalar( factor );

				if ( _this.staticMoving ) {

					_zoomStart.copy( _zoomEnd );

				} else {

					_zoomStart.y += ( _zoomEnd.y - _zoomStart.y ) * this.dynamicDampingFactor;

				}

			}

		}

	};

	this.panCamera = (function() {

		var mouseChange = new THREE.Vector2(),
			objectUp = new THREE.Vector3(),
			pan = new THREE.Vector3();

		return function () {

			mouseChange.copy( _panEnd ).sub( _panStart );

			if ( mouseChange.lengthSq() ) {

				mouseChange.multiplyScalar( _eye.length() * _this.panSpeed );

				pan.copy( _eye ).cross( _this.object.up ).setLength( mouseChange.x );
				pan.add( objectUp.copy( _this.object.up ).setLength( mouseChange.y ) );

				_this.object.position.add( pan );
				_this.target.add( pan );

				if ( _this.staticMoving ) {

					_panStart.copy( _panEnd );

				} else {

					_panStart.add( mouseChange.subVectors( _panEnd, _panStart ).multiplyScalar( _this.dynamicDampingFactor ) );

				}

			}
		};

	}());

	this.checkDistances = function () {

		if ( !_this.noZoom || !_this.noPan ) {

			if ( _eye.lengthSq() > _this.maxDistance * _this.maxDistance ) {

				_this.object.position.addVectors( _this.target, _eye.setLength( _this.maxDistance ) );

			}

			if ( _eye.lengthSq() < _this.minDistance * _this.minDistance ) {

				_this.object.position.addVectors( _this.target, _eye.setLength( _this.minDistance ) );

			}

		}

	};

	this.update = function () {

		_eye.subVectors( _this.object.position, _this.target );

		if ( !_this.noRotate ) {

			_this.rotateCamera();

		}

		if ( !_this.noZoom ) {

			_this.zoomCamera();

		}

		if ( !_this.noPan ) {

			_this.panCamera();

		}

		_this.object.position.addVectors( _this.target, _eye );

		_this.checkDistances();

		_this.object.lookAt( _this.target );

		if ( lastPosition.distanceToSquared( _this.object.position ) > EPS ) {

			_this.dispatchEvent( changeEvent );

			lastPosition.copy( _this.object.position );

		}

	};

	this.reset = function () {

		_state = STATE.NONE;
		_prevState = STATE.NONE;

		_this.target.copy( _this.target0 );
		_this.object.position.copy( _this.position0 );
		_this.object.up.copy( _this.up0 );

		_eye.subVectors( _this.object.position, _this.target );

		_this.object.lookAt( _this.target );

		_this.dispatchEvent( changeEvent );

		lastPosition.copy( _this.object.position );

	};

	// listeners

	function keydown( event ) {
console.log("key pressed");

		if ( _this.enabled === false ) return;

		window.removeEventListener( 'keydown', keydown );

		_prevState = _state;

		if ( _state !== STATE.NONE ) {

			return;

		} else if ( event.keyCode === _this.keys[ STATE.ROTATE ] && !_this.noRotate ) {

			_state = STATE.ROTATE;

		} else if ( event.keyCode === _this.keys[ STATE.ZOOM ] && !_this.noZoom ) {

			_state = STATE.ZOOM;

		} else if ( event.keyCode === _this.keys[ STATE.PAN ] && !_this.noPan ) {

			_state = STATE.PAN;

		}
		if (event.keyCode===67) {
			var snd = new Audio("shut.wav"); // buffers automatically when created
snd.play();
			cupBoard1.position.x=-550;
cupBoard1.position.y=30;
cupBoard1.position.z=600;
//cupBoard1.rotation.z=THREE.Math.degToRad(1);
cupBoard1.rotation.y=THREE.Math.degToRad(90);
cupBoard2.position.x=-550;
cupBoard2.position.y=30;
cupBoard2.position.z=390;
//cupBoard2.rotation.z=THREE.Math.degToRad(1);
cupBoard2.rotation.y=THREE.Math.degToRad(90);
cupBoardHandle1.position.z=450;
cupBoardHandle2.position.z=550;

		}
		/*O*/
	if (event.keyCode===79) {
		var snd = new Audio("open.wav"); // buffers automatically when created
snd.play();
			cupBoard1.position.x=-560;
					cupBoard1.position.y=30;
					cupBoard1.position.z=730;
					cupBoard1.rotation.y=THREE.Math.degToRad(140);
cupBoardHandle2.position.z=750;
					
					cupBoard2.position.x=-560;
					cupBoard2.position.y=30;
					cupBoard2.position.z=250;
cupBoardHandle1.position.z=230;					cupBoard2.rotation.y=THREE.Math.degToRad(-140);
keyPressNum++;
}
/*l*/
if (event.keyCode===76) {
	var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
lampTop.position.x = -200 ;
					lampTop.position.y= -400;
	keyPressNum++;				//lampTop.rotation.y=THREE.Math.degToRad(90);
					
		}	
/*d*/
if (event.keyCode===68) {		
	var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
		lampTop.position.x = -500;
		lampTop.position.y = 400;
		//lampTop.rotation.y=THREE.Math.degToRad(-90);	
		
}
/*m*/
if (event.keyCode===77) {		
	var snd = new Audio("glassBreak.wav"); // buffers automatically when created
snd.play();
		
		
		mirrorCube.rotation.y =THREE.Math.degToRad(120);
		mirrorCube.position.set(-500,-150,-400);
		mirrorBorder.position.set(-520,-150,-400);
		//mirrorBorder.rotation.z =THREE.Math.degToRad(60);
		mirrorBorder.rotation.y =THREE.Math.degToRad(120);
		bloodyHand.rotation.y=THREE.Math.degToRad(120);	
		bloodyHand.position.set(-350,80,-300);
		keyPressNum++;
}
/*p*/
if (event.keyCode===80) {
	var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
mirrorBorder.rotation.y=THREE.Math.degToRad(90);
	mirrorBorder.position.set(-650,70,-100);
		mirrorCube.rotation.y=THREE.Math.degToRad(90);
	mirrorCube.position.set(-630,70,-100);
	bloodyHand.rotation.y=THREE.Math.degToRad(90);	
	bloodyHand.position.set(-620,270,20);
}

/*f*/
if (event.keyCode===70) {
var snd = new Audio("screech.mp3"); // buffers automatically when created
snd.play();
	drawer.position.set(-350,-350,-100);
	bloodDrip.position.set(-295,-270,50);
	keyPressNum++;
}

/*b*/
if (event.keyCode===66) {
var snd = new Audio("screech.mp3"); // buffers automatically when created
snd.play();
	drawer.position.set(-580,-350,-100);
	bloodDrip.position.set(-525,-270,50);
}
/*u*/
if (event.keyCode===85) {
var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
	vaseObj.position.set(1220,-250,700);
	vaseObj.rotation.x=THREE.Math.degToRad(0);
}
/*v*/
if (event.keyCode===86) {
var snd = new Audio("glassBreak.wav"); // buffers automatically when created
snd.play();
	vaseObj.position.set(1200,-450,850);
	vaseObj.rotation.x=THREE.Math.degToRad(90);
	keyPressNum=0;
	// textWrite.position.set(-100,-100,-8000);
	// scene.add(textWrite);
	text="You FOUND it!",

            height = 20,
            size = 90,
            hover = 30,

            curveSegments = 4,

            bevelThickness = 2,
            bevelSize = 1.5,
            bevelSegments = 3,
            bevelEnabled = true,

            font = "optimer", // helvetiker, optimer, gentilis, droid sans, droid serif
            weight = "bold", // normal bold
            style = "normal"; // normal italic
             var textGeo = new THREE.TextGeometry( text, {

                size: size,
                height: height,
                curveSegments: curveSegments,

                font: font,
                weight: weight,
                style: style,

                bevelThickness: bevelThickness,
                bevelSize: bevelSize,
                bevelEnabled: bevelEnabled,


            });


//  var geometry = new THREE.CubeGeometry(10,10,1);
 textmaterial = new THREE.MeshFaceMaterial( [
					new THREE.MeshBasicMaterial( { color: 0x880000, shading: THREE.FlatShading } ), // front
					new THREE.MeshBasicMaterial( { color: 0x880000, shading: THREE.SmoothShading } ) // side
				] );
   textWrite = new THREE.Mesh(textGeo, textmaterial); 
  textWrite.rotation.x=THREE.Math.degToRad(10);
  textWrite.position.set(0,800,500);
  scene.add(textWrite);

	//bloodDrip.position.set(-525,-270,50);
}

/*t*/
if (event.keyCode===84) {
var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
	  camera.position.z = 2500;
       //  camera.position.x = 500;
        camera.position.y = 300;
}

/*q*/
if (event.keyCode===81) {
var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
	  camera.position.z = 1500;
       //  camera.position.x = 500;
        camera.position.y = -50;
}
/*w*/
if (event.keyCode===87) {
var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
 camera.position.z = 1000;
        camera.position.x = 500;
       camera.position.y = 2000;
}

/*e*/
if (event.keyCode===69) {
var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
	  camera.position.z = 500;
        camera.position.x = -500;
       camera.position.y = 1000;
}

/*r*/
if (event.keyCode===82) {
var snd = new Audio("swoosh.mp3"); // buffers automatically when created
snd.play();
	  camera.position.z = 500;
        camera.position.x = 700;
       camera.position.y = 700;
}
console.log(keyPressNum);
if(keyPressNum>4){
	//  
	text="You LOOSE!",

            height = 20,
            size = 90,
            hover = 30,

            curveSegments = 4,

            bevelThickness = 2,
            bevelSize = 1.5,
            bevelSegments = 3,
            bevelEnabled = true,

            font = "optimer", // helvetiker, optimer, gentilis, droid sans, droid serif
            weight = "bold", // normal bold
            style = "normal"; // normal italic
             var textGeo = new THREE.TextGeometry( text, {

                size: size,
                height: height,
                curveSegments: curveSegments,

                font: font,
                weight: weight,
                style: style,

                bevelThickness: bevelThickness,
                bevelSize: bevelSize,
                bevelEnabled: bevelEnabled,


            });


//  var geometry = new THREE.CubeGeometry(10,10,1);
 textmaterial = new THREE.MeshFaceMaterial( [
					new THREE.MeshBasicMaterial( { color: 0x880000, shading: THREE.FlatShading } ), // front
					new THREE.MeshBasicMaterial( { color: 0x880000, shading: THREE.SmoothShading } ) // side
				] );
  textWrite = new THREE.Mesh(textGeo, textmaterial); 
  textWrite.rotation.x=THREE.Math.degToRad(10);
  textWrite.position.set(0,700,500);
  scene.add(textWrite);

	
}
	}

	function keyup( event ) {

		if ( _this.enabled === false ) return;

		_state = _prevState;

		window.addEventListener( 'keydown', keydown, false );

	}

	function mousedown( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		if ( _state === STATE.NONE ) {

			_state = event.button;
			isUserInteracting = true;

				onPointerDownPointerX = event.clientX;
				onPointerDownPointerY = event.clientY;
console.log(onPointerDownPointerY,onPointerDownPointerY);
// var mouse = new THREE.Vector3(
//       event.clientX / (window.innerWidth * 0.5) - 1.0,
//       -1.0 * (event.clientY / (window.innerHeight * 0.5) - 1.0), 0.0);

//   var proj = new THREE.Projector();
//   var raycaster = proj.pickingRay(mouse, camera);

//   var meshList = [];

//   var intersects = raycaster.intersectObjects(decalTargets);

//   if (intersects.length > 0) {
//     var closest = 0;
//     var closeDistance = 1000000000000000000;
//     for(var i = 0; i < intersects.length; i++){
//       if(intersects[i].distance < closeDistance){
//         closest = i;
//         closeDistance = intersects[i].distance;
//       }
//     }

//     var size = Math.random() * 40 + 2;
//     decalFactory.projectOnMesh( intersects[closest].object, intersects[closest].point, raycaster.ray.direction, Math.random() * Math.PI * 2, new THREE.Vector3(size, size, size+5) );
//   } else {
//     console.log("No intersections.");
//   }

		}

		if ( _state === STATE.ROTATE && !_this.noRotate ) {

			_moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );
			_movePrev.copy(_moveCurr);

		} else if ( _state === STATE.ZOOM && !_this.noZoom ) {

			_zoomStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );
			_zoomEnd.copy(_zoomStart);

		} else if ( _state === STATE.PAN && !_this.noPan ) {

			_panStart.copy( getMouseOnScreen( event.pageX, event.pageY ) );
			_panEnd.copy(_panStart);

		}

		document.addEventListener( 'mousemove', mousemove, false );
		document.addEventListener( 'mouseup', mouseup, false );

		_this.dispatchEvent( startEvent );

	}

	function mousemove( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		if ( _state === STATE.ROTATE && !_this.noRotate ) {

			_movePrev.copy(_moveCurr);
			_moveCurr.copy( getMouseOnCircle( event.pageX, event.pageY ) );

		} else if ( _state === STATE.ZOOM && !_this.noZoom ) {

			_zoomEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

		} else if ( _state === STATE.PAN && !_this.noPan ) {

			_panEnd.copy( getMouseOnScreen( event.pageX, event.pageY ) );

		}
		if ( isUserInteracting === true ) {
//if(onPointerDownPointerX>=70 && onPointerDownPointerX<=200 && onPointerDownPointerY>=70 && onPointerDownPointerY<=200) {
								
console.log("mouse move");
}

	}

	function mouseup( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		_state = STATE.NONE;
isUserInteracting = false;
				
		document.removeEventListener( 'mousemove', mousemove );
		document.removeEventListener( 'mouseup', mouseup );
		_this.dispatchEvent( endEvent );

	}

	function mousewheel( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		var delta = 0;

		if ( event.wheelDelta ) { // WebKit / Opera / Explorer 9

			delta = event.wheelDelta / 40;

		} else if ( event.detail ) { // Firefox

			delta = - event.detail / 3;

		}

		_zoomStart.y += delta * 0.01;
		_this.dispatchEvent( startEvent );
		_this.dispatchEvent( endEvent );

	}

	function touchstart( event ) {

		if ( _this.enabled === false ) return;

		switch ( event.touches.length ) {

			case 1:
				_state = STATE.TOUCH_ROTATE;
				_moveCurr.copy( getMouseOnCircle( event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
				_movePrev.copy(_moveCurr);
				break;

			case 2:
				_state = STATE.TOUCH_ZOOM_PAN;
				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				_touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt( dx * dx + dy * dy );

				var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
				var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
				_panStart.copy( getMouseOnScreen( x, y ) );
				_panEnd.copy( _panStart );
				break;

			default:
				_state = STATE.NONE;

		}
		_this.dispatchEvent( startEvent );


	}

	function touchmove( event ) {

		if ( _this.enabled === false ) return;

		event.preventDefault();
		event.stopPropagation();

		switch ( event.touches.length ) {

			case 1:
				_movePrev.copy(_moveCurr);
				_moveCurr.copy( getMouseOnCircle(  event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
				break;

			case 2:
				var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
				var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
				_touchZoomDistanceEnd = Math.sqrt( dx * dx + dy * dy );

				var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
				var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
				_panEnd.copy( getMouseOnScreen( x, y ) );
				break;

			default:
				_state = STATE.NONE;

		}

	}

	function touchend( event ) {

		if ( _this.enabled === false ) return;

		switch ( event.touches.length ) {

			case 1:
				_movePrev.copy(_moveCurr);
				_moveCurr.copy( getMouseOnCircle(  event.touches[ 0 ].pageX, event.touches[ 0 ].pageY ) );
				break;

			case 2:
				_touchZoomDistanceStart = _touchZoomDistanceEnd = 0;

				var x = ( event.touches[ 0 ].pageX + event.touches[ 1 ].pageX ) / 2;
				var y = ( event.touches[ 0 ].pageY + event.touches[ 1 ].pageY ) / 2;
				_panEnd.copy( getMouseOnScreen( x, y ) );
				_panStart.copy( _panEnd );
				break;

		}

		_state = STATE.NONE;
		_this.dispatchEvent( endEvent );

	}

	this.domElement.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );

	this.domElement.addEventListener( 'mousedown', mousedown, false );

	this.domElement.addEventListener( 'mousewheel', mousewheel, false );
	this.domElement.addEventListener( 'DOMMouseScroll', mousewheel, false ); // firefox

	this.domElement.addEventListener( 'touchstart', touchstart, false );
	this.domElement.addEventListener( 'touchend', touchend, false );
	this.domElement.addEventListener( 'touchmove', touchmove, false );

	window.addEventListener( 'keydown', keydown, false );
	window.addEventListener( 'keyup', keyup, false );

	this.handleResize();

	// force an update at start
	this.update();

};

THREE.TrackballControls.prototype = Object.create( THREE.EventDispatcher.prototype );
THREE.TrackballControls.prototype.constructor = THREE.TrackballControls;