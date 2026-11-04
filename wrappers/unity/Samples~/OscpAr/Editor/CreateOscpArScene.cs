using System.IO;
using OpenArCloud.GeoPose.Unity;
using Unity.XR.CoreUtils;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace OpenArCloud.GeoPose.Samples.Editor
{
    public static class CreateOscpArScene
    {
        [MenuItem("GeoPose/Create OSCP AR demo scene")]
        public static void Create()
        {
            if(!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            new GameObject("AR Session",typeof(ARSession),typeof(ARInputManager));
            var tracking=new GameObject("XR Origin"); var origin=tracking.AddComponent<XROrigin>();
            var offset=new GameObject("Camera Offset"); offset.transform.SetParent(tracking.transform,false);
            var cameraObject=new GameObject("AR Camera"); cameraObject.tag="MainCamera"; cameraObject.transform.SetParent(offset.transform,false);
            var camera=cameraObject.AddComponent<Camera>(); camera.nearClipPlane=0.05f; camera.farClipPlane=250;
            origin.Camera=camera; origin.CameraFloorOffsetObject=offset; origin.CameraYOffset=0;
            origin.RequestedTrackingOriginMode=XROrigin.TrackingOriginMode.Device;
            var driver=cameraObject.AddComponent<TrackedPoseDriver>();
            driver.positionInput=new InputActionProperty(new InputAction("Position",InputActionType.Value,"<XRHMD>/centerEyePosition",expectedControlType:"Vector3"));
            driver.rotationInput=new InputActionProperty(new InputAction("Rotation",InputActionType.Value,"<XRHMD>/centerEyeRotation",expectedControlType:"Quaternion"));
            driver.trackingStateInput=new InputActionProperty(new InputAction("Tracking State",InputActionType.Value,"<XRHMD>/trackingState",expectedControlType:"Integer"));
            var manager=cameraObject.AddComponent<ARCameraManager>(); manager.requestedFacingDirection=CameraFacingDirection.World;
            var background=cameraObject.AddComponent<ARCameraBackground>();
            var planes=tracking.AddComponent<ARPlaneManager>(); planes.requestedDetectionMode=PlaneDetectionMode.Horizontal;
            var scene=new GameObject("Geographic content (ENU)").AddComponent<GeoPoseScene>();
            var light=new GameObject("Sun").AddComponent<Light>(); light.type=LightType.Directional; light.intensity=1;
            light.transform.rotation=Quaternion.Euler(50,-30,0);
            RenderSettings.ambientMode=UnityEngine.Rendering.AmbientMode.Flat; RenderSettings.ambientLight=new Color(.4f,.4f,.4f);
            var app=new GameObject("OSCP AR demo");
            var capture=app.AddComponent<ArBackgroundCapture>(); capture.enabled=false;
            capture.arCamera=camera; capture.cameraManager=manager; capture.background=background; capture.enabled=true;
            var demo=app.AddComponent<OscpArDemo>(); demo.capture=capture; demo.geographicScene=scene; demo.planeManager=planes;
            foreach(var guid in AssetDatabase.FindAssets("geopose-demo t:TextAsset"))
            {
                string path=AssetDatabase.GUIDToAssetPath(guid);
                if(!path.EndsWith("geopose-demo.json")) continue;
                demo.configuration=AssetDatabase.LoadAssetAtPath<TextAsset>(path);
                string source=Path.Combine(Path.GetDirectoryName(path),"../Assets");
                Directory.CreateDirectory("Assets/StreamingAssets/GeoPoseDemo");
                foreach(string name in new[]{"arrow.glb","marker.glb"}) File.Copy(Path.Combine(source,name),"Assets/StreamingAssets/GeoPoseDemo/"+name,true);
                break;
            }
            AssetDatabase.Refresh(); Selection.activeGameObject=app;
            if(demo.configuration==null) Debug.LogError("Import the OSCP AR sample and assign its geopose-demo.json configuration.");
            EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        }
    }
}
