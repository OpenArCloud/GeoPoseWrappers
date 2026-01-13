Some time ago a proposal for an sort of direct CesiumJS support of GeoPose was proposed. 

The proposal looked like this:

"
1. Support setting an OGC GeoPose-compliant camera position by implementing a new Cesium API function that accepts a GeoPose object (OGC Basic Quaternion GeoPose JSON string parsed to an object). 

The setter function could be something like this:  
viewer.placeCameraAtGeoPose(GeoPose)
or 
viewer.camera.placeAtGeoPose(GeoPose)

2. Support getting a GeoPose object based on the current camera position in the Cesium viewer (an object that could be serialized to an OGC Basic Quaternion GeoPose JSON String) by implementing a getter function that returns the GeoPose object.
The getter function could be something like:viewer.getCameraGeoPose():GeoPose
or 
viewer.camera.getGeoPose():GeoPose

3. Support posing a 3D object (like a glTF or other 3D entity) with a GeoPose object (that could have been parsed from a OGC Basic Quaternion JSON string).  

The placement function could be something like this:
viewer.addModelAtGeoPose(modelObject, GeoPose):modelRef
or
viewer.entities.addModelAtGeoPose(modelObject,GeoPose):modelRef

The returned modelRef is to make it convenient to remove the object afterwards, if such a ref would be needed for that.

The two first types of support relate to the camera and in our opinion would be the highest priority functions to implement. I expect them to be the lowest effort in time and development as well. 

The third one would allow the placement of some 3D object at a location is also highly useful, but it seems like Cesium has a more involved API with regards to 3D object handling.
"

Could this proposal be made into a a sort of npm package that serves either directly extends the CesiumJS api as proposed or provides a less invasive "extension" or library that lets developers to the equivalent thing with similar ease and convenience as a direct extension.

This is being considered as a potential future development in the GeoPoseWrappers monorepo. Creating an npm package that either extends the CesiumJS API or provides a convenient library for handling GeoPose objects in Cesium could significantly enhance interoperability and ease of use for developers working with geospatial data.