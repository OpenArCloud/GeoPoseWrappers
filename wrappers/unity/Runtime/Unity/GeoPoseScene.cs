using System;
using System.Collections.Generic;
using UnityEngine;

namespace OpenArCloud.GeoPose.Unity
{
    [DisallowMultipleComponent]
    public sealed class GeoPoseScene : MonoBehaviour
    {
        public GeoPosition origin=new GeoPosition(60,10,100);
        [Min(1)] public float localRangeWarningMetres=10000;
        private GeoReference frame;
        private readonly HashSet<GeoPoseAnchor> anchors=new HashSet<GeoPoseAnchor>();
        public GeoReference Frame => frame??(frame=new GeoReference(origin));
        private void Awake() { UnityConversions.RequireUnitScale(transform); frame=new GeoReference(origin); }
        internal void Register(GeoPoseAnchor anchor) => anchors.Add(anchor);
        internal void Unregister(GeoPoseAnchor anchor) => anchors.Remove(anchor);
        public GeoPoseAnchor Place(GameObject prefab,BasicPose pose,BodyAxes axes=BodyAxes.ForwardLeftUp)
        {
            var go=new GameObject(prefab==null?"GeoPose anchor":prefab.name+" GeoPose"); go.transform.SetParent(transform,false);
            var anchor=go.AddComponent<GeoPoseAnchor>(); anchor.Set(this,pose,axes);
            if(prefab!=null) Instantiate(prefab,go.transform,false);
            return anchor;
        }
        public GeoPoseAnchor PlaceEcef(GameObject prefab,Pose3d ecef,BodyAxes axes=BodyAxes.ForwardLeftUp) => Place(prefab,Wgs84.FromEcef(ecef),axes);
        public BasicPose CaptureWorld(Transform target,BodyAxes axes=BodyAxes.ForwardLeftUp)
        {
            UnityConversions.RequireUnitScale(transform); UnityConversions.RequireUnitScale(target);
            return Frame.UnityToGeoPose(transform.WorldPose().Inverse*target.WorldPose(),axes);
        }
        public BasicPose CaptureCamera(Camera camera) => CaptureWorld(camera.transform,BodyAxes.CameraRightUpBack);
        public void ApplyWorld(Transform target,BasicPose pose,BodyAxes axes=BodyAxes.ForwardLeftUp)
        {
            UnityConversions.RequireUnitScale(transform); UnityConversions.RequireUnitScale(target);
            target.SetWorldPose(transform.WorldPose()*Frame.GeoPoseToUnity(pose,axes));
        }
        // Keeps canonical geographic poses; changes Unity coordinates. Call CaptureTransform on moving anchors first.
        public void Rebase(GeoPosition newOrigin)
        {
            var next=new GeoReference(newOrigin); origin=newOrigin; frame=next;
            foreach(var anchor in anchors) if(anchor!=null) anchor.Apply();
        }
        // For AR: move the geographic content root, never the camera driven by AR Foundation.
        public void AlignToCamera(BasicPose cameraGeoPose,Pose3d trackedCameraAtCapture)
        {
            UnityConversions.RequireUnitScale(transform);
            transform.SetWorldPose(Frame.AlignToCapturedCamera(cameraGeoPose,trackedCameraAtCapture));
        }
        public void RebasePreservingTracking(GeoPosition newOrigin,Camera trackedCamera)
        {
            var geo=CaptureCamera(trackedCamera); var tracked=trackedCamera.transform.WorldPose();
            Rebase(newOrigin); AlignToCamera(geo,tracked);
        }
        private void OnDrawGizmosSelected()
        {
            Gizmos.color=Color.red; Gizmos.DrawLine(transform.position,transform.TransformPoint(Vector3.right*2));
            Gizmos.color=Color.green; Gizmos.DrawLine(transform.position,transform.TransformPoint(Vector3.up*2));
            Gizmos.color=Color.blue; Gizmos.DrawLine(transform.position,transform.TransformPoint(Vector3.forward*2));
        }
    }
}
